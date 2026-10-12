import type { ApiInfo, AskRequest, AskResponse, Source } from "../types/api";
import { invalidResponse, isRecord, request } from "./api";

export function toSource(value: unknown): Source {
  const record = isRecord(value) ? value : {};
  return {
    document_id: typeof record.document_id === "string" ? record.document_id : null,
    source_filename: typeof record.source_filename === "string" ? record.source_filename : null,
    headings: Array.isArray(record.headings)
      ? record.headings.filter((heading): heading is string => typeof heading === "string")
      : [],
    chunk_id: typeof record.chunk_id === "string" ? record.chunk_id : null,
    score: typeof record.score === "number" && Number.isFinite(record.score) ? record.score : null,
  };
}

/** POST /ask. The backend answers with the complete response; it does not stream. */
export async function askQuestion(payload: AskRequest, signal?: AbortSignal): Promise<AskResponse> {
  const body = await request("/ask", { method: "POST", json: payload, signal });
  if (!isRecord(body) || typeof body.answer !== "string") throw invalidResponse("answer");
  return {
    question: typeof body.question === "string" ? body.question : payload.question,
    answer: body.answer,
    sources: Array.isArray(body.sources) ? body.sources.map(toSource) : [],
  };
}

/**
 * Read the API title and version from FastAPI's built-in /openapi.json.
 * The backend has no health endpoint; this is the lightest existing route
 * that proves the server is answering.
 */
export async function fetchApiInfo(signal?: AbortSignal): Promise<ApiInfo> {
  const body = await request("/openapi.json", { signal });
  if (!isRecord(body) || !isRecord(body.info) || !isRecord(body.paths)) {
    throw invalidResponse("API description");
  }
  return {
    title: typeof body.info.title === "string" ? body.info.title : "Unknown API",
    version: typeof body.info.version === "string" ? body.info.version : "unknown",
  };
}
