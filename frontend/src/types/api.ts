// Shapes of the existing FastAPI backend, as defined in app.py.

/** A row of the SQLite `documents` table. */
export interface DocumentRecord {
  /** SQLite primary key. Used in /documents/{id} paths. */
  id: number;
  title: string;
  content: string;
  category: string;
  /** Original filename of an uploaded PDF; null for manually created rows. */
  source_filename: string | null;
  /** Server path of the stored PDF; null for manually created rows. */
  file_path: string | null;
}

/** Body of PATCH /documents/{id}. At least one field is required. */
export interface DocumentPatch {
  title?: string;
  content?: string;
  category?: string;
}

/** Query parameters of GET /documents. */
export interface DocumentFilters {
  /** Exact category match. */
  category?: string;
  /** Substring match on title or content. */
  q?: string;
}

/** Response of POST /documents/upload. */
export interface UploadResponse {
  id: number;
  message: string;
  source_filename: string;
  /** Stored filename. This is the `document_id` used by the vector index. */
  filename: string;
  size_bytes: number;
  extracted_characters: number;
  category: string;
  ingestion: {
    chunks_indexed: number;
    vector_size: number;
    collection: string;
  };
}

/** Body of POST /ask. Extra fields are rejected by the backend. */
export interface AskRequest {
  question: string;
  /** Vector-index document id (the stored PDF filename), not the SQLite id. */
  document_id?: string;
}

/** Metadata of one retrieved passage. Every field may be missing. */
export interface Source {
  document_id: string | null;
  source_filename: string | null;
  headings: string[];
  chunk_id: string | null;
  score: number | null;
}

/** Response of POST /ask. */
export interface AskResponse {
  question: string;
  answer: string;
  sources: Source[];
}

/** The parts of GET /openapi.json used for the connection check. */
export interface ApiInfo {
  title: string;
  version: string;
}
