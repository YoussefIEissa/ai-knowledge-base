// Low-level HTTP client. All requests to the backend go through this file.

/** Base path of the API. "/api" is forwarded to FastAPI by the Vite proxy. */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/+$/, "");

export type ApiErrorKind = "http" | "network" | "invalid-response";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  /** HTTP status, or 0 when no response was received. */
  readonly status: number;

  constructor(message: string, kind: ApiErrorKind, status = 0) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError("Something went wrong while talking to the backend.", "network");
}

export function describeError(error: unknown): string {
  return toApiError(error).message;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const REQUEST_LOCATIONS = new Set(["body", "query", "path"]);

/**
 * Extract a readable message from a FastAPI error body. Handles both
 * `{"detail": "text"}` and the validation form `{"detail": [{loc, msg}]}`.
 */
export function errorMessageFromBody(body: unknown): string | null {
  if (!isRecord(body)) return null;
  const detail = body.detail;

  if (typeof detail === "string" && detail.trim()) return detail.trim();

  if (Array.isArray(detail)) {
    const parts: string[] = [];
    for (const item of detail) {
      if (!isRecord(item) || typeof item.msg !== "string") continue;
      const field = Array.isArray(item.loc)
        ? item.loc.filter((part) => !REQUEST_LOCATIONS.has(String(part))).join(".")
        : "";
      parts.push(field ? `${field}: ${item.msg}` : item.msg);
    }
    if (parts.length > 0) return parts.join("; ");
  }

  return null;
}

export function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  if (!text) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

/** Build an ApiError for a non-success response. */
export function httpError(status: number, text: string): ApiError {
  const parsed = parseJson(text);
  const detail = parsed.ok ? errorMessageFromBody(parsed.value) : null;
  if (detail) return new ApiError(detail, "http", status);

  // FastAPI always answers errors with JSON. A 5xx without JSON comes from
  // the proxy, which means the backend itself did not answer.
  if (!parsed.ok && status >= 500) {
    return new ApiError(
      "The backend did not answer. Check that the FastAPI server is running.",
      "network",
      status,
    );
  }
  return new ApiError(`The request failed (HTTP ${status}).`, "http", status);
}

export function buildUrl(path: string, query?: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value) params.set(key, value);
  }
  const search = params.toString();
  return `${API_BASE_URL}${path}${search ? `?${search}` : ""}`;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | undefined>;
  /** Sent as a JSON body when provided. */
  json?: unknown;
  signal?: AbortSignal;
}

/**
 * Send a request and return the parsed JSON body (undefined for 204).
 * Throws ApiError for failures and rethrows AbortError when cancelled.
 */
export async function request(path: string, options: RequestOptions = {}): Promise<unknown> {
  const hasBody = options.json !== undefined;
  let response: Response;
  let text: string;

  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? "GET",
      headers: hasBody
        ? { Accept: "application/json", "Content-Type": "application/json" }
        : { Accept: "application/json" },
      body: hasBody ? JSON.stringify(options.json) : undefined,
      signal: options.signal,
    });
    text = response.status === 204 ? "" : await response.text();
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError(
      "Could not reach the backend. Check that the FastAPI server is running.",
      "network",
    );
  }

  if (!response.ok) throw httpError(response.status, text);
  if (response.status === 204) return undefined;

  const parsed = parseJson(text);
  if (!parsed.ok) {
    throw new ApiError(
      "The backend returned a response that could not be read.",
      "invalid-response",
      response.status,
    );
  }
  return parsed.value;
}

export function invalidResponse(what: string): ApiError {
  return new ApiError(`The backend returned an unexpected ${what}.`, "invalid-response");
}
