<div align="center">

# Knowledge AI

### A local-first, full-stack document intelligence platform

*Upload PDFs, build a searchable knowledge base, and ask questions that are answered from your own documents, with the retrieved passages cited for every answer.*

![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-API-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![Qdrant](https://img.shields.io/badge/Qdrant-vector_search-DC244C)
![SQLite](https://img.shields.io/badge/SQLite-metadata-003B57?logo=sqlite&logoColor=white)

</div>

---

Language models answer confidently about documents they have never seen. Knowledge AI closes that gap with retrieval-augmented generation (RAG): it converts your PDFs into structured text, indexes them as vectors, retrieves the passages most relevant to each question, and asks a language model to answer **only from that evidence**, citing the passages it used.

The whole pipeline runs on your machine. Documents are parsed with Docling, embedded with a local Sentence Transformers model, stored in an embedded Qdrant database, and answered by Gemma served through LM Studio. Nothing is sent to a hosted AI API.

This is a learning and portfolio project built to show how the parts of a RAG system fit together end to end. It is not hardened for production; the [limitations](#limitations) are documented as carefully as the features.

## Table of contents

- [Highlights](#highlights)
- [Product preview](#product-preview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [API reference](#api-reference)
- [How RAG works here](#how-rag-works-here)
- [Testing and evaluation](#testing-and-evaluation)
- [Project structure](#project-structure)
- [Limitations](#limitations)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## Highlights

- **A complete RAG loop, not just a chat box.** Ingestion, structure-aware chunking, embedding, vector search, grounded generation, and source attribution are all implemented and visible in the code.
- **Citations you can check.** The model is told to cite `[Source N]`, and the API returns the matching source list in the same order, so the UI can link every marker to the passage's file, section headings, and similarity score.
- **Defensive ingestion.** Uploads are validated four ways, streamed to disk with a size cap, and rolled back from SQLite and disk if conversion or indexing fails.
- **Tested API contract.** 25 backend tests cover CRUD, upload validation, and the question-answering endpoint, with the model and vector database replaced by fakes so the suite needs no external services.
- **Measured retrieval.** A small evaluation script reports Recall@5, Precision@5, and reciprocal rank against a labelled question set, and states its own limits.

## Product preview

### The workflow

1. **Upload a PDF** from the Documents page (drag and drop, several files at once, 40 MB each at most).
2. **Validation and conversion.** The backend checks the file and Docling converts it into a structured document, which is also exported as Markdown.
3. **Chunking and embedding.** Docling's `HybridChunker` splits the document along its structure, and each chunk becomes a 384-dimensional vector.
4. **Indexing.** Vectors and chunk text are stored in a persistent local Qdrant collection.
5. **Ask a question** in the chat, across all indexed documents or scoped to one.
6. **Retrieval.** The question is embedded and the five most similar passages are fetched.
7. **Grounded answer.** Gemma answers from those passages and cites them. The UI shows each source's filename, section headings, and similarity score.

### Screenshots

> [!NOTE]
> No screenshots are committed to the repository yet. The four below would show the product best. A `docs/screenshots/` folder is a suggested location; it does not exist yet.

| Suggested capture | What it should show |
|---|---|
| Chat with a cited answer | An answer containing citation markers, with the source list expanded to show headings and similarity scores |
| Document library | Uploaded PDFs, the search box, category filters, and an upload in progress |
| Document detail | Extracted Markdown for one PDF, its metadata, and the "Ask about this document" action |
| Settings | Backend connection status and the pipeline configuration summary |

## Features

### Ingestion

| Feature | What it does | Why it matters |
|---|---|---|
| PDF upload and validation | Checks the content type, the `.pdf` extension, a 40 MB limit while streaming, and the `%PDF-` file signature | Rejects wrong or oversized files before any expensive processing starts |
| Docling conversion | Converts the PDF into a structured document and exports Markdown for storage and display | Keeps headings and layout that naive text extraction loses |
| Structure-aware chunking | `HybridChunker` splits along document structure and sizes chunks with the embedding model's own tokenizer | Chunks stay coherent and fit the model that embeds them |
| Local embeddings | `all-MiniLM-L6-v2` produces normalized 384-dimensional vectors | Small enough to run on a CPU; no external embedding API |
| Persistent vector index | Chunks are upserted into an on-disk Qdrant collection using cosine distance | The index survives restarts without running a separate database server |
| Failure rollback | If conversion or indexing fails, the SQLite row, the saved file, and any partially indexed vectors are removed | A failed upload does not leave half-ingested data behind |

### Question answering

| Feature | What it does | Why it matters |
|---|---|---|
| Semantic retrieval | Embeds the question and returns the top 5 passages by cosine similarity | Finds passages by meaning rather than exact keywords |
| Document-scoped questions | An optional `document_id` filters retrieval to a single PDF | Avoids cross-document noise when you know where the answer lives |
| Grounded generation | The prompt supplies numbered passages and instructs the model to answer from them, admit when they are insufficient, and treat them as evidence rather than instructions | Reduces hallucination and blunts prompt injection from document text |
| Source citations | Every answer returns the filename, headings, chunk ID, and similarity score of each retrieved passage | Answers can be traced back to where they came from |

### Frontend

| Feature | What it does |
|---|---|
| Chat interface | Markdown answers, clickable citation markers, a per-answer source list, copy, retry, and stop |
| Scope picker | Ask across all indexed documents or limit the next question to one |
| Document library | Server-side search over titles and content, category filters, and a sequential upload queue with progress |
| Document detail and editing | View extracted content and metadata; edit title, category, and content; delete with confirmation |
| Local chat history | Up to 30 conversations saved in the browser's `localStorage` |
| Backend status | A live indicator that polls the API, plus a Settings page summarizing the pipeline configuration |

## Architecture

```mermaid
flowchart TD
    user([User])

    subgraph browser["Browser"]
        ui["React SPA<br/>Chat, Library, Settings"]
        ls[("localStorage<br/>chats and chunk counts")]
    end

    proxy["Vite server<br/>forwards /api/* and strips the prefix"]

    subgraph backend["FastAPI process: app.py"]
        crud["Document CRUD<br/>/documents"]

        subgraph ingest["Ingestion: POST /documents/upload"]
            validate["Validate PDF<br/>type, extension, size, signature"]
            convert["Docling DocumentConverter"]
            chunk["HybridChunker"]
            embedDocs["Embed chunks<br/>all-MiniLM-L6-v2"]
            validate --> convert --> chunk --> embedDocs
        end

        subgraph answer["Question answering: POST /ask"]
            embedQ["Embed question<br/>all-MiniLM-L6-v2"]
            search["Top-5 cosine search<br/>optional document_id filter"]
            prompt["Build prompt with<br/>numbered passages"]
            respond["Answer and source metadata"]
            embedQ --> search --> prompt
        end
    end

    subgraph storage["Local storage on disk"]
        sqlite[("SQLite: knowledge.db<br/>titles, categories, Markdown")]
        files[("uploads/<br/>original PDFs")]
        qdrant[("Qdrant: qdrant_db/<br/>vectors and chunk payloads")]
    end

    llm["Gemma in LM Studio<br/>OpenAI-compatible API on port 1234"]

    user --> ui
    ui <--> ls
    ui --> proxy
    proxy --> crud
    proxy --> validate
    proxy --> embedQ

    crud <--> sqlite
    validate -- "save file" --> files
    convert -- "Markdown export" --> sqlite
    embedDocs -- "upsert points" --> qdrant
    search <--> qdrant
    prompt -- "chat completion" --> llm
    llm --> respond
    respond -- "JSON response" --> ui
```

**In plain English:**

- **Frontend.** A React single-page app. The browser only ever talks to its own origin under `/api`; the Vite server forwards those requests to FastAPI and removes the prefix. This is required because the backend sends no CORS headers.
- **API.** A single FastAPI application (`app.py`) exposes document CRUD, PDF upload, and question answering. The RAG service is created lazily on the first upload or question and then reused, so CRUD-only use never loads the embedding model.
- **Ingestion.** An upload is validated, saved under a random filename, converted by Docling, stored in SQLite as Markdown, then chunked, embedded, and upserted into Qdrant. Chunking runs on Docling's structured document, not on the flattened Markdown.
- **Storage.** Three local stores with different jobs: SQLite holds document records and extracted text, `uploads/` holds the original PDFs, and Qdrant holds vectors plus each chunk's text and metadata.
- **Retrieval and generation.** A question is embedded with the same model used for the chunks, Qdrant returns the nearest passages, and those passages are sent to Gemma through LM Studio's OpenAI-compatible endpoint.
- **What runs where.** FastAPI, the embedding model, Docling, SQLite, and Qdrant (embedded mode) all run inside the backend process. Only two things are started separately: **LM Studio** and the **Vite server**.

## Tech stack

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | React 19, TypeScript, React Router | Single-page interface for chat, library, and settings |
| Frontend tooling | Vite 8, Tailwind CSS 4, ESLint | Dev server, API proxy, styling, linting |
| Answer rendering | react-markdown, remark-gfm | Markdown answers with linked citation markers |
| API | FastAPI, Pydantic, Uvicorn | HTTP endpoints, request validation, OpenAPI docs |
| PDF processing | Docling `DocumentConverter` | PDF to structured document and Markdown |
| Chunking | Docling `HybridChunker` | Structure-aware, tokenizer-aligned passage segmentation |
| Embeddings | Sentence Transformers `all-MiniLM-L6-v2` | 384-dimensional normalized vectors for chunks and questions |
| Vector database | Qdrant (embedded, on-disk) | Cosine similarity search with payload filtering |
| Metadata store | SQLite (standard library `sqlite3`) | Document records and extracted Markdown |
| LLM | Gemma via LM Studio, called with the `openai` client | Grounded answer generation |
| Testing | pytest, FastAPI `TestClient` | API tests with faked RAG and Docling |
| Packaging | uv (backend), npm (frontend) | Dependency management and virtual environment |

## Getting started

### Prerequisites

| Requirement | Notes |
|---|---|
| [uv](https://docs.astral.sh/uv/) | Manages Python and the virtual environment. The project requires Python 3.13.15 or newer (pinned in `.python-version`); uv installs it if needed. |
| Node.js 20.19+ and npm | For the frontend. Developed with Node 24. |
| [LM Studio](https://lmstudio.ai/) | Serves the language model locally. Needed only for asking questions. |
| Internet access on first run | Docling and Sentence Transformers download their model weights the first time they are used. |

### 1. Clone and install the backend

```bash
git clone https://github.com/YoussefIEissa/ai-knowledge-base.git
cd ai-knowledge-base
uv sync
```

### 2. Create the Qdrant collection (first run only)

The backend expects the `qdrant_db/` directory and its `knowledge_base` collection to exist already; it does not create them on startup. Local data is git-ignored, so a fresh clone has neither. Create them once from the project root:

```bash
uv run python - <<'EOF'
from qdrant_client import QdrantClient, models

client = QdrantClient(path="qdrant_db")
if not client.collection_exists("knowledge_base"):
    client.create_collection(
        "knowledge_base",
        vectors_config=models.VectorParams(size=384, distance=models.Distance.COSINE),
    )
client.close()
EOF
```

Without this step, uploads and questions return `503` with "The RAG service is unavailable."

### 3. Start LM Studio

1. Download and load the model whose identifier is `google/gemma-4-e4b`.
2. Start LM Studio's local server on its default address, `http://localhost:1234`.

The model identifier and server address are constants in `app_services/rag.py`. To use a different model, change `LLM_MODEL` there.

### 4. Start the backend

```bash
uv run uvicorn app:app --reload
```

The API listens on `http://127.0.0.1:8000`. The SQLite database (`knowledge.db`) and its table are created automatically on startup.

### 5. Start the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

### 6. Open the app

| What | URL |
|---|---|
| Application | <http://localhost:5173> |
| Interactive API docs (Swagger UI) | <http://127.0.0.1:8000/docs> |
| Alternative API docs (ReDoc) | <http://127.0.0.1:8000/redoc> |

Upload a PDF on the Documents page, then ask a question in the chat. The first upload and the first question are slower than later ones because the models are loaded on first use.

<details>
<summary><strong>Troubleshooting</strong></summary>

| Symptom | Likely cause | Fix |
|---|---|---|
| `503` "The RAG service is unavailable." | `qdrant_db/` or the collection is missing, or another process has the Qdrant directory open | Run step 2; stop other scripts using `qdrant_db/` |
| `502` "Unable to generate an answer right now." | Retrieval or the model call failed | Check that LM Studio's server is running with the model loaded |
| "Backend unreachable" in the UI | FastAPI is not running or is on another address | Start it, or set `KNOWLEDGE_API_URL` (see [Configuration](#configuration)) |
| "Backend not responding" during an upload | The backend is busy converting a PDF | Wait for the upload to finish |
| `415` or `400` on upload | The file is not a real PDF | Upload a `.pdf` file of 40 MB or less |

</details>

## Configuration

The backend reads **no environment variables** and needs no `.env` file or API keys. Its settings are module-level constants:

| Setting | Value | Defined in |
|---|---|---|
| Maximum upload size | 40 MB | `MAX_FILE_SIZE` in `app.py` |
| SQLite database path | `knowledge.db` in the project root | `DATABASE_PATH` in `app.py` |
| Upload directory | `uploads/` in the project root | `UPLOAD_DIR` in `app.py` |
| Qdrant path and collection | `qdrant_db/`, `knowledge_base` | `QDRANT_PATH`, `COLLECTION_NAME` in `app_services/rag.py` |
| Embedding model | `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions) | `EMBEDDING_MODEL`, `VECTOR_SIZE` in `app_services/rag.py` |
| Passages retrieved per question | 5 | `TOP_K` in `app_services/rag.py` |
| LLM endpoint | `http://localhost:1234/v1` | `LM_STUDIO_BASE_URL` in `app_services/rag.py` |
| LLM model | `google/gemma-4-e4b`, temperature 0.2 | `LLM_MODEL` in `app_services/rag.py` |

The frontend has two optional settings:

| Variable | Default | Purpose |
|---|---|---|
| `KNOWLEDGE_API_URL` | `http://127.0.0.1:8000` | Backend address the Vite proxy forwards to. Set it when starting Vite, for example `KNOWLEDGE_API_URL=http://host:8000 npm run dev`. |
| `VITE_API_BASE_URL` | `/api` | Base path the browser uses for API calls. Read at build time. |

See [`frontend/README.md`](frontend/README.md) for frontend build, preview, and hosting details.

## API reference

Base URL for local development: `http://127.0.0.1:8000`. Interactive documentation is generated by FastAPI at `/docs`.

| Method | Path | Purpose | Request | Success response |
|---|---|---|---|---|
| `POST` | `/documents` | Create a plain-text document record (not indexed for retrieval) | JSON `title`, `content`, `category`, all required and non-blank | `201` with the created record |
| `GET` | `/documents` | List documents | Optional query `category` (exact match) and `q` (substring of title or content) | `200` with an array of records |
| `GET` | `/documents/{document_id}` | Fetch one document | Integer path ID | `200` with the record |
| `PUT` | `/documents/{document_id}` | Replace title, content, and category | JSON with all three fields | `200` with the updated record |
| `PATCH` | `/documents/{document_id}` | Update some fields | JSON with at least one of `title`, `content`, `category`; unknown fields are rejected | `200` with the updated record |
| `DELETE` | `/documents/{document_id}` | Delete the document record | Integer path ID | `204` with no body |
| `POST` | `/documents/upload` | Upload, convert, and index a PDF | `multipart/form-data` with a `file` part of type `application/pdf` | `201` with an ingestion summary |
| `POST` | `/ask` | Answer a question from indexed passages | JSON `question` (1 to 2000 characters), optional `document_id` | `200` with `question`, `answer`, `sources` |

A document record has the fields `id`, `title`, `content`, `category`, `source_filename`, and `file_path`. The last two are `null` for records created as plain text.

### Upload a PDF

```bash
curl -X POST http://127.0.0.1:8000/documents/upload \
  -F "file=@handbook.pdf;type=application/pdf"
```

Response shape (values are illustrative):

```json
{
  "id": 1,
  "message": "PDF uploaded and indexed successfully",
  "source_filename": "handbook.pdf",
  "filename": "3f2a9c0d6b1e4f7a8c5d2e9b0a1f6c3d.pdf",
  "size_bytes": 482113,
  "extracted_characters": 35120,
  "category": "uploaded",
  "ingestion": {
    "chunks_indexed": 42,
    "vector_size": 384,
    "collection": "knowledge_base"
  }
}
```

`id` is the SQLite document ID. `filename` is the stored name, and it is also the `document_id` to use when scoping a question to this PDF.

Upload errors: `415` wrong content type, `400` wrong extension or missing PDF signature, `413` over 40 MB, `422` no extractable text, `503` RAG service unavailable, `500` conversion or indexing failure.

### Ask a question

Across every indexed document:

```bash
curl -X POST http://127.0.0.1:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the refund policy?"}'
```

Scoped to one PDF, using the `filename` from its upload response:

```bash
curl -X POST http://127.0.0.1:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the refund policy?", "document_id": "3f2a9c0d6b1e4f7a8c5d2e9b0a1f6c3d.pdf"}'
```

Response shape (values are illustrative):

```json
{
  "question": "What is the refund policy?",
  "answer": "Refunds are available within 14 days of purchase [Source 1].",
  "sources": [
    {
      "document_id": "3f2a9c0d6b1e4f7a8c5d2e9b0a1f6c3d.pdf",
      "source_filename": "handbook.pdf",
      "headings": ["Refunds"],
      "chunk_id": "9b1c...",
      "score": 0.71
    }
  ]
}
```

`sources[N - 1]` is the passage the model saw as `[Source N]`. Passage text is not included in the response. Errors: `422` invalid body, `503` RAG service unavailable, `502` retrieval or generation failed.

### List and search documents

```bash
curl "http://127.0.0.1:8000/documents?q=refund&category=uploaded"
```

## How RAG works here

**Embeddings.** An embedding is a list of numbers that represents the meaning of a piece of text, so that texts about similar things land close together. This project uses `all-MiniLM-L6-v2`, which maps text to 384 numbers. Vectors are normalized and compared with cosine similarity.

**Chunking.** A whole document is too long and too mixed in topic to embed as one vector, so it is split into passages. Chunk quality sets the ceiling for everything downstream: a chunk that cuts a section in half or blends two topics is hard to retrieve and hard to answer from. `HybridChunker` splits along the document structure Docling detected, merges small neighbouring pieces, and measures size with the embedding model's tokenizer. Each chunk keeps the headings it sits under.

**Retrieval.** The question is embedded with the same model, and Qdrant returns the five nearest chunks, optionally restricted to one document with a payload filter on `document_id`. There is no minimum-similarity threshold and no reranking step: the top five are always used, however weak the match.

**Generation.** The retrieved chunks are placed in the prompt as numbered blocks, each with its filename, heading path, and text. The system prompt tells the model to answer from that context, not to invent facts, to say so when the context is insufficient, to cite `[Source N]`, and to treat the passages as evidence rather than instructions. If retrieval returns nothing, the API skips the model and returns a fixed "couldn't find relevant information" answer.

**Sources.** The response lists the retrieved passages in prompt order with their filename, headings, chunk ID, and similarity score. The list contains everything that was retrieved, whether or not the model cited it.

**Why answers can still be wrong.** The model only sees what retrieval hands it. If the right passage is not in the top five, because the question is phrased very differently from the text, the answer spans many sections, or the PDF converted poorly, the model cannot answer well, however capable it is. Grounding instructions reduce hallucination; they do not guarantee its absence.

### Two kinds of document ID

| ID | Example | Used for |
|---|---|---|
| SQLite ID (integer) | `7` | `/documents/{document_id}` paths |
| Vector document ID (string) | `3f2a...6c3d.pdf` | The `document_id` field of `/ask` and of each source |

The vector document ID is the random filename the PDF was stored under. It is returned as `filename` by the upload endpoint and is the last segment of a record's `file_path`. The two IDs are not interchangeable: sending a SQLite ID to `/ask` matches no vectors.

### What persists

| Data | Location | Survives a restart |
|---|---|---|
| Document records and extracted Markdown | `knowledge.db` | Yes |
| Original PDFs | `uploads/` | Yes |
| Vectors, chunk text, chunk metadata | `qdrant_db/` | Yes |
| Chat conversations (up to 30) | Browser `localStorage` | Yes, in that browser only |
| Conversation context on the server | Not stored | Each question is answered independently |

## Testing and evaluation

### Backend tests

```bash
uv run python -m pytest
```

Use `python -m pytest` rather than bare `pytest`: the tests import `app` from the project root, which `python -m` adds to the import path.

The suite has 25 tests in two files:

| File | Covers |
|---|---|
| `tests/test_documents.py` | Create, list, get, replace, patch, and delete; `404` handling; validation of missing and blank fields; category filter and text search; upload success, rejection of non-PDF content types and invalid signatures, and storage of extracted Markdown |
| `tests/test_rag_api.py` | `/ask` response shape, request validation, rejection of extra fields, `502` on failure without leaking internals, reuse of a single RAG service, and `document_id` passthrough |

Every test uses a temporary SQLite database. Docling and the RAG service are replaced with fakes, so the suite runs without Qdrant, the embedding model, or LM Studio. The corollary is that real conversion, chunking, embedding, retrieval, and generation are not covered by automated tests.

### Frontend checks

The frontend has no unit tests. It has static checks:

```bash
cd frontend
npm run typecheck
npm run lint
```

### Retrieval evaluation

```bash
uv run python evaluation/evaluate_retrieval.py
```

The script loads `evaluation/questions.json`, retrieves the top 5 chunks for each question (scoped to the question's `document_id`), and prints the retrieved chunks alongside these metrics:

| Metric | How it is calculated |
|---|---|
| Recall@5 | Share of a question's expected section names found in the retrieved chunks. The summary reports it across all expected sections. |
| Precision@5 | Share of the retrieved chunks that match at least one expected section name. Reported per question. |
| Reciprocal rank | 1 divided by the rank of the first matching chunk, or 0 if none match. The summary reports the mean (MRR). |

Prerequisites and scope:

- It evaluates **retrieval only**. The language model is never called, so LM Studio is not needed and answer quality is not measured.
- It needs an existing `qdrant_db/` containing the documents the questions refer to. The committed question set points at a PDF in the author's local index, so to run it yourself, upload your own PDF and replace the `document_id`, questions, and `relevant_headings` in `questions.json`.
- Stop the backend first. Embedded Qdrant allows one process to open the directory at a time.
- Relevance is decided by literal, case-insensitive matching of expected section names against chunk headings and text. A match does not prove the chunk answers the question.
- Questions labelled unanswerable have no expected sections and are skipped, so the script does not measure whether the system correctly declines to answer.
- The committed set has five questions. Treat results as a debugging aid for one document, not as a benchmark.

## Project structure

```text
.
├── app.py                        FastAPI app: models, CRUD, upload, /ask
├── app_services/
│   ├── rag.py                    RAGApplication: index, retrieve, generate, ask
│   ├── ingestion.py              Standalone ingest function (not called by the API)
│   ├── chunking.py               Script: PDF to chunks.json
│   ├── embed.py                  Script: chunks.json to embedded_chunks.json
│   ├── vector_db.py              Script: embedded chunks into Qdrant
│   ├── retrieve.py               Script: interactive semantic search in the terminal
│   └── inspect_chunks.py         Script: chunk size and quality report
├── evaluation/
│   ├── evaluate_retrieval.py     Retrieval metrics over a labelled question set
│   └── questions.json            Evaluation questions and expected sections
├── tests/
│   ├── test_documents.py         CRUD and upload endpoint tests
│   └── test_rag_api.py           /ask endpoint tests
├── frontend/
│   ├── README.md                 Frontend-specific documentation
│   ├── package.json
│   ├── vite.config.ts            Dev server and /api proxy
│   └── src/
│       ├── App.tsx, main.tsx     Routes and entry point
│       ├── config.ts             App name and limits mirrored from the backend
│       ├── pages/                Chat, Documents, Document detail, Settings
│       ├── components/           chat/, documents/, layout/, ui/, Markdown.tsx
│       ├── hooks/                Data loading, backend status, upload queue, contexts
│       ├── services/             HTTP client, endpoint functions, localStorage
│       ├── types/                API and chat types
│       ├── utils/                Formatting and citation linking
│       └── styles/index.css      Design tokens and Markdown styles
├── migrate_db.py                 Adds columns missing from older databases
├── parse_pdf.py                  Script: convert one PDF to Markdown
├── pyproject.toml                Backend dependencies
└── uv.lock
```

- **`app.py`** is the HTTP layer and owns SQLite access.
- **`app_services/rag.py`** is the RAG core used by the API. It also runs as a terminal chat: `uv run python app_services/rag.py`.
- **The other scripts in `app_services/`** are the pipeline built one stage at a time (chunk, embed, index, search) before it was integrated into the API. They are kept as a readable record of each stage. `chunking.py` and `parse_pdf.py` point at a hard-coded local PDF and need their path edited before they will run.
- **`frontend/`** is a separate application that reaches the backend only through its HTTP API.

Generated at runtime and git-ignored: `knowledge.db`, `uploads/`, `qdrant_db/`, `output/`, `.venv/`, `frontend/node_modules/`, `frontend/dist/`.

## Limitations

These reflect the code as it stands.

**Data consistency**

- **Deleting a document leaves its vectors and file behind.** `DELETE /documents/{id}` removes only the SQLite row. The PDF stays in `uploads/` and its chunks stay in Qdrant, so a deleted document can still be retrieved and cited when asking across all documents.
- **Edits are not re-indexed.** `PUT` and `PATCH` change the SQLite record only. Retrieval and answers keep reflecting the originally uploaded PDF.
- **Plain-text documents are never indexed.** Records created with `POST /documents` are stored but cannot be retrieved by `/ask`.
- **No deduplication.** Uploading the same PDF twice indexes it twice under two IDs.

**Retrieval and generation**

- Fixed top-5 dense retrieval with no similarity threshold, keyword or hybrid search, or reranking.
- Source metadata does not include passage text or page numbers, so the UI cannot show the quoted passage.
- Each question stands alone. Earlier turns of a conversation are not sent to the model.
- Answers are returned whole; there is no streaming.

**Operations**

- **No authentication or authorization.** Anyone who can reach the API can read, upload, edit, and delete. It is meant for local, single-user use.
- **Uploads block the server.** Conversion and indexing run inside the request, and the API cannot serve other requests until they finish.
- **Embedded Qdrant is single-process**, and its collection must be created manually on first run.
- Configuration is hard-coded in source rather than read from the environment.
- No CORS headers, health endpoint, containerization, or deployment setup. The frontend's status indicator polls `/openapi.json`, which shows that FastAPI is answering, not that Qdrant or the model are working.
- Chat history lives in one browser's `localStorage` and is not synced or backed up.

## Roadmap

Potential improvements, in rough priority order. None of these exist today.

1. **Keep the stores consistent.** Delete a document's Qdrant points and stored PDF when its record is deleted, and re-chunk and re-embed when its content is edited.
2. **Initialize the vector store automatically.** Create the collection on startup and store the vector document ID as a column in SQLite instead of deriving it from `file_path`.
3. **Move ingestion off the request path.** Run conversion and indexing in a background task with a status endpoint so the API stays responsive.
4. **Externalize configuration.** Read the model name, endpoints, and paths from environment variables.
5. **Improve retrieval quality.** Add a similarity threshold, hybrid search, and reranking, and return passage text and page references with each source.
6. **Strengthen evaluation.** Label relevance at chunk level, grow the question set, evaluate answer faithfulness, and test that unanswerable questions are declined.
7. **Add integration tests** that exercise real chunking, embedding, and retrieval against a small fixture PDF.
8. **Add observability.** Record ingestion and query latency, retrieval scores, and model failures, and add a health endpoint that checks Qdrant and the model.
9. **Add streaming and conversation context** to the question-answering endpoint.
10. **Prepare for shared use.** Add authentication, switch to a Qdrant server, and document deployment behind a reverse proxy.

## Contributing

Issues and pull requests are welcome, especially for items on the roadmap.

1. Fork the repository and create a branch for your change.
2. Follow [Getting started](#getting-started) to run the project locally.
3. Before opening a pull request, run the checks:

   ```bash
   uv run python -m pytest
   cd frontend && npm run typecheck && npm run lint
   ```

4. Describe what changed and why, and add or update tests when you change API behaviour.

For larger changes, open an issue first to discuss the approach.

## License

No license has been specified for this repository yet. Until one is added, the code is published for reading and evaluation, and reuse permissions should be confirmed with the maintainer.

---

<div align="center">

Built by [Youssef Ibrahim](https://github.com/YoussefIEissa) as a hands-on study of retrieval-augmented generation, from PDF to cited answer.

</div>
