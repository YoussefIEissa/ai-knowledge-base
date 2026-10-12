# Knowledge AI frontend

A React interface for the AI Knowledge Base API in the parent directory. It lets you upload PDFs, manage the document library, and ask questions that are answered from your documents with the retrieved sources shown for every answer.

The frontend is a separate application. It does not change the backend, and it talks to it only through the existing HTTP API.

## Prerequisites

- Node.js 20.19 or newer (developed with Node 24)
- npm
- The FastAPI backend running on `http://127.0.0.1:8000`
- LM Studio serving the model on `http://localhost:1234`, needed only for asking questions

## Install

```bash
cd frontend
npm install
```

Dependencies are installed into `frontend/node_modules` only.

## Run in development

Start the backend in one terminal, from the project root:

```bash
uv run uvicorn app:app --reload
```

Start the frontend in a second terminal:

```bash
cd frontend
npm run dev
```

Open <http://localhost:5173>.

## Build for production

```bash
cd frontend
npm run build      # type-checks, then writes static files to frontend/dist
npm run preview    # serves the build on http://localhost:4173 with the same API proxy
```

Other checks:

```bash
npm run typecheck
npm run lint
```

## How the frontend reaches the API

The backend sends no CORS headers, so a browser page on another origin cannot call it directly. Instead:

1. The browser sends every API request to the frontend's own origin under `/api`, for example `/api/documents`.
2. The Vite server (both `npm run dev` and `npm run preview`) forwards `/api/*` to the backend and removes the `/api` prefix, so the backend receives `/documents`.

| Setting | Default | How to change it |
|---|---|---|
| Backend address the proxy forwards to | `http://127.0.0.1:8000` | `KNOWLEDGE_API_URL=http://host:port npm run dev` |
| API base path used by the browser | `/api` | `VITE_API_BASE_URL` at build time |

The proxy is configured in `vite.config.ts`. All requests are made in `src/services/`.

If you host the built files with something other than `vite preview`, that server must forward `/api/*` to the backend in the same way. Pointing `VITE_API_BASE_URL` straight at the backend from a different origin will not work unless the backend is changed to allow it.

No secrets are needed or stored by the frontend.

## Where data lives

| Data | Stored in | Notes |
|---|---|---|
| Documents, extracted text, uploaded PDFs, vector index | The backend (SQLite, `uploads/`, Qdrant) | Shared by every browser that uses this backend |
| Chats | This browser's `localStorage` | Not sent to the server, not visible in other browsers; up to 30 are kept |
| Chunk counts shown in the library | This browser's `localStorage` | The API reports the count only in the upload response, so it is known only for files uploaded from this browser |

The backend has no conversation memory. Each question is sent on its own, without earlier messages. Delete saved chats from **Settings**.

## Behaviour that follows from the backend

- **Asking about one document** sends the stored PDF filename as `document_id`, which is what the vector index uses. The frontend takes it from the last part of each document's `file_path`. Documents created as plain text have no stored PDF, were never indexed, and cannot be chosen as a scope.
- **Sources** show filename, section headings, similarity score and chunk ID. The API does not return the passage text, so it cannot be displayed.
- **Citation markers** such as `[Source 2]` in an answer are linked to the second returned source. This is reliable because the backend numbers passages in the prompt in the order it returns them. Markers with a number outside the returned range are left as plain text.
- **Answers arrive all at once.** The API does not stream, so the interface shows a waiting state with elapsed time. "Stop" ends the wait in the browser; the backend may still finish generating.
- **Deleting a document** removes its library record only. The backend leaves the PDF file and the indexed passages in place, so a deleted document can still appear as a source when searching all indexed documents.
- **Editing a document** updates the stored record only. Nothing is re-indexed, so answers keep reflecting the original PDF.
- **Uploads** show measured progress while the file is being sent, then an indeterminate state while the backend converts and indexes it. The backend cannot answer other requests during that time, so the status indicator may show "not responding" until it finishes.
- **Backend status** is checked with `GET /openapi.json`, because there is no health endpoint. It shows that FastAPI is answering, not that Qdrant or the language model are working.

## Common connection problems

| What you see | Likely cause | What to do |
|---|---|---|
| "Backend unreachable" and documents fail to load | FastAPI is not running, or it is on another address | Start it with `uv run uvicorn app:app --reload`, or set `KNOWLEDGE_API_URL` |
| "Backend not responding" during or after an upload | The backend is busy converting a PDF | Wait for the upload to finish |
| "Unable to generate an answer right now." | Retrieval or the language model failed | Check that LM Studio is running with the model loaded |
| "The RAG service is unavailable…" | The vector database or embedding model could not be opened | Check the backend log; make sure no other process has `qdrant_db/` open |
| The first question is slow | The backend loads the embedding model on first use | Wait; later questions are faster |
| Upload fails with "Only PDF files are supported" | The file is not a PDF | Upload a `.pdf` file of 40 MB or less |

## Project layout

```text
frontend/
├── index.html
├── vite.config.ts          Dev server, API proxy
├── public/favicon.svg
└── src/
    ├── main.tsx, App.tsx   Entry point and routes
    ├── config.ts           App name and backend limits shown in the UI
    ├── types/              API and chat types
    ├── services/           HTTP client, endpoint functions, localStorage
    ├── hooks/              Data loading, backend status, uploads, chat and toast contexts
    ├── utils/              Formatting, citation linking
    ├── components/         layout/, chat/, documents/, ui/, Markdown.tsx
    ├── pages/              Chat, Documents, Document detail, Settings
    └── styles/index.css    Design tokens and markdown styles
```
