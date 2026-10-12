export const APP_NAME = "Knowledge AI";

/**
 * Limits copied from the backend (app.py) so the UI can describe them and
 * catch obvious mistakes early. The backend remains the authority: every
 * request is still validated there.
 */
export const UPLOAD_MAX_BYTES = 40 * 1024 * 1024;
export const QUESTION_MAX_LENGTH = 2000;

/** Category the backend assigns to every uploaded PDF. */
export const UPLOADED_CATEGORY = "uploaded";

/**
 * Pipeline defaults read from the backend source (app_services/rag.py and
 * app_services/llm.py) when this frontend was written. The API has no
 * endpoint that reports them, so the UI presents them as configured values,
 * never as live status.
 */
export const BACKEND_PIPELINE: ReadonlyArray<{ label: string; value: string }> = [
  { label: "PDF conversion", value: "Docling" },
  { label: "Chunking", value: "Docling HybridChunker" },
  { label: "Embedding model", value: "sentence-transformers/all-MiniLM-L6-v2 (384 dimensions)" },
  { label: "Vector database", value: "Qdrant, local storage, collection “knowledge_base”" },
  { label: "Passages per question", value: "Top 5 by cosine similarity" },
  {
    label: "Language model",
    value: "Gemma 4 E4B (GGUF, Q4_0) run inside the backend with llama.cpp",
  },
];
