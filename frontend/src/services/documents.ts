import type {
  DocumentFilters,
  DocumentPatch,
  DocumentRecord,
  UploadResponse,
} from "../types/api";
import { ApiError, buildUrl, httpError, invalidResponse, isRecord, parseJson, request } from "./api";

function toDocument(value: unknown): DocumentRecord {
  if (!isRecord(value) || typeof value.id !== "number") throw invalidResponse("document");
  return {
    id: value.id,
    title: typeof value.title === "string" ? value.title : "",
    content: typeof value.content === "string" ? value.content : "",
    category: typeof value.category === "string" ? value.category : "",
    source_filename: typeof value.source_filename === "string" ? value.source_filename : null,
    file_path: typeof value.file_path === "string" ? value.file_path : null,
  };
}

/**
 * The identifier the vector index uses for a document: the stored PDF
 * filename (for example "cd9be4…f7c9.pdf"). The backend does not return it
 * as its own field, but it is the last segment of `file_path`. Rows without
 * a stored PDF were never indexed and return null.
 */
export function vectorDocumentId(document: Pick<DocumentRecord, "file_path">): string | null {
  if (!document.file_path) return null;
  const name = document.file_path.split(/[\\/]/).pop()?.trim();
  return name ? name : null;
}

export async function listDocuments(
  filters: DocumentFilters = {},
  signal?: AbortSignal,
): Promise<DocumentRecord[]> {
  const body = await request("/documents", {
    query: { category: filters.category, q: filters.q },
    signal,
  });
  if (!Array.isArray(body)) throw invalidResponse("document list");
  return body.map(toDocument);
}

export async function getDocument(id: number, signal?: AbortSignal): Promise<DocumentRecord> {
  return toDocument(await request(`/documents/${id}`, { signal }));
}

export async function patchDocument(id: number, patch: DocumentPatch): Promise<DocumentRecord> {
  return toDocument(await request(`/documents/${id}`, { method: "PATCH", json: patch }));
}

export async function deleteDocument(id: number): Promise<void> {
  await request(`/documents/${id}`, { method: "DELETE" });
}

function toUploadResponse(value: unknown): UploadResponse {
  if (!isRecord(value) || typeof value.id !== "number" || typeof value.filename !== "string") {
    throw invalidResponse("upload response");
  }
  const ingestion = isRecord(value.ingestion) ? value.ingestion : {};
  const numberOr = (candidate: unknown, fallback: number) =>
    typeof candidate === "number" ? candidate : fallback;
  const stringOr = (candidate: unknown, fallback: string) =>
    typeof candidate === "string" ? candidate : fallback;

  return {
    id: value.id,
    message: stringOr(value.message, ""),
    source_filename: stringOr(value.source_filename, value.filename),
    filename: value.filename,
    size_bytes: numberOr(value.size_bytes, 0),
    extracted_characters: numberOr(value.extracted_characters, 0),
    category: stringOr(value.category, ""),
    ingestion: {
      chunks_indexed: numberOr(ingestion.chunks_indexed, 0),
      vector_size: numberOr(ingestion.vector_size, 0),
      collection: stringOr(ingestion.collection, ""),
    },
  };
}

interface UploadOptions {
  signal?: AbortSignal;
  /** Fraction (0–1) of the file bytes sent so far. */
  onProgress?: (fraction: number) => void;
  /** Called once the whole file has been sent and the backend is processing it. */
  onSent?: () => void;
}

/**
 * Upload a PDF to POST /documents/upload as multipart field "file".
 *
 * XMLHttpRequest is used instead of fetch because it reports how many bytes
 * have been sent. That is the only measurable part: conversion, chunking
 * and indexing happen inside one request with no progress signal.
 */
export function uploadPdf(file: File, options: UploadOptions = {}): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    // The backend requires the part's content type to be exactly
    // "application/pdf". Some systems report no type for PDFs, so fill it in
    // for .pdf files. The backend still checks the file's PDF signature.
    const needsType = file.type === "" && file.name.toLowerCase().endsWith(".pdf");
    const payload = needsType ? new File([file], file.name, { type: "application/pdf" }) : file;

    const form = new FormData();
    form.append("file", payload, file.name);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", buildUrl("/documents/upload"));
    xhr.setRequestHeader("Accept", "application/json");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        options.onProgress?.(event.loaded / event.total);
      }
    };
    xhr.upload.onload = () => {
      options.onProgress?.(1);
      options.onSent?.();
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(httpError(xhr.status, xhr.responseText));
        return;
      }
      const parsed = parseJson(xhr.responseText);
      if (!parsed.ok) {
        reject(invalidResponse("upload response"));
        return;
      }
      try {
        resolve(toUploadResponse(parsed.value));
      } catch (error) {
        reject(error);
      }
    };
    xhr.onerror = () => {
      reject(
        new ApiError(
          "The upload could not reach the backend. Check that the FastAPI server is running.",
          "network",
        ),
      );
    };
    xhr.onabort = () => {
      reject(new DOMException("Upload cancelled", "AbortError"));
    };

    if (options.signal) {
      if (options.signal.aborted) {
        reject(new DOMException("Upload cancelled", "AbortError"));
        return;
      }
      options.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    xhr.send(form);
  });
}
