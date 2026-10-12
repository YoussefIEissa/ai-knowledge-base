import { ArrowLeft, FileQuestion, MessageSquare, Pencil, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { DeleteDocumentDialog } from "../components/documents/DeleteDocumentDialog";
import { EditDocumentDialog } from "../components/documents/EditDocumentDialog";
import { Markdown } from "../components/Markdown";
import { Button } from "../components/ui/Button";
import { Badge, EmptyState, ErrorNotice, Note, Spinner } from "../components/ui/Feedback";
import { useChat } from "../hooks/chatContext";
import { useToast } from "../hooks/toastContext";
import { useDocument } from "../hooks/useDocuments";
import { vectorDocumentId } from "../services/documents";
import { loadChunkCounts } from "../services/localStore";
import type { DocumentRecord } from "../types/api";
import { cx, formatCount, plural } from "../utils/format";

// Rendering very large markdown is slow, so long documents open as plain text.
const RENDER_LIMIT_CHARS = 150_000;

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="mt-1 text-sm break-words">{children}</dd>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/documents"
      className="mb-6 inline-flex items-center gap-1.5 rounded-md text-sm text-muted transition hover:text-fg"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Documents
    </Link>
  );
}

function DocumentDetail({ document, onChanged }: { document: DocumentRecord; onChanged: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { setScope } = useChat();
  const [chunkCounts] = useState(loadChunkCounts);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const tooLongToRender = document.content.length > RENDER_LIMIT_CHARS;
  const [view, setView] = useState<"rendered" | "plain">(tooLongToRender ? "plain" : "rendered");

  const vectorId = vectorDocumentId(document);
  const chunks = vectorId ? chunkCounts[vectorId] : undefined;

  const handleAsk = () => {
    if (!vectorId) return;
    setScope({ documentId: vectorId, label: document.title });
    navigate("/");
  };

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight break-words">{document.title}</h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Badge>{document.category}</Badge>
            {vectorId ? <Badge tone="success">Indexed PDF</Badge> : <Badge>Text only · not indexed</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {vectorId && (
            <Button
              variant="primary"
              onClick={handleAsk}
              icon={<MessageSquare className="size-4" aria-hidden="true" />}
            >
              Ask about this document
            </Button>
          )}
          <Button onClick={() => setEditing(true)} icon={<Pencil className="size-4" aria-hidden="true" />}>
            Edit
          </Button>
          <Button
            variant="danger"
            onClick={() => setDeleting(true)}
            icon={<Trash2 className="size-4" aria-hidden="true" />}
          >
            Delete
          </Button>
        </div>
      </header>

      <dl className="card mt-6 grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Record ID">#{document.id}</Fact>
        <Fact label="Original file">{document.source_filename ?? "None (created as text)"}</Fact>
        <Fact label="Extracted text">{formatCount(document.content.length)} characters</Fact>
        <Fact label="Indexed chunks">
          {chunks !== undefined ? (
            <span title="Reported by the backend when this file was uploaded from this browser.">
              {plural(chunks, "chunk")}
            </span>
          ) : vectorId ? (
            <span className="text-muted">Not reported by the API</span>
          ) : (
            <span className="text-muted">Not indexed</span>
          )}
        </Fact>
        {vectorId && (
          <div className="min-w-0 sm:col-span-2 lg:col-span-4">
            <dt className="text-xs text-subtle">Vector index ID</dt>
            <dd className="mt-1 font-mono text-[13px] break-all text-muted">{vectorId}</dd>
          </div>
        )}
      </dl>

      {!vectorId && (
        <Note className="mt-4">
          This record was created as text and was never added to the vector index, so the assistant
          cannot search it.
        </Note>
      )}

      <section aria-label="Content" className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{vectorId ? "Extracted content" : "Content"}</h2>
          {!tooLongToRender && (
            <div className="flex rounded-lg border border-line-strong p-0.5" role="group" aria-label="Content view">
              {(["rendered", "plain"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={view === option}
                  onClick={() => setView(option)}
                  className={cx(
                    "h-7 rounded-md px-2.5 text-xs font-medium transition duration-150",
                    view === option ? "bg-raised text-fg" : "text-muted hover:text-fg",
                  )}
                >
                  {option === "rendered" ? "Formatted" : "Plain text"}
                </button>
              ))}
            </div>
          )}
        </div>

        {tooLongToRender && (
          <Note className="mb-3">This document is long, so it is shown as plain text.</Note>
        )}

        <div className="card p-5 sm:p-6">
          {view === "rendered" ? (
            <Markdown content={document.content} />
          ) : (
            <pre dir="auto" className="font-mono text-[13px] leading-relaxed break-words whitespace-pre-wrap text-muted">
              {document.content}
            </pre>
          )}
        </div>
      </section>

      <EditDocumentDialog
        document={editing ? document : null}
        onClose={() => setEditing(false)}
        onSaved={(saved) => {
          setEditing(false);
          onChanged();
          toast.notify("success", `Saved changes to “${saved.title}”.`);
        }}
      />
      <DeleteDocumentDialog
        document={deleting ? document : null}
        onClose={() => setDeleting(false)}
        onDeleted={(removed) => {
          toast.notify("success", `Removed “${removed.title}” from the library.`);
          navigate("/documents", { replace: true });
        }}
      />
    </>
  );
}

function DocumentLoader({ id }: { id: number }) {
  const { data, error, loading, reload } = useDocument(id);

  if (error) {
    if (error.status === 404) {
      return (
        <EmptyState
          icon={<FileQuestion className="size-5" aria-hidden="true" />}
          title="Document not found"
        >
          Record #{id} does not exist. It may have been deleted.
        </EmptyState>
      );
    }
    return (
      <ErrorNotice
        title="The document could not be loaded"
        message={error.message}
        onRetry={reload}
      />
    );
  }

  if (!data) return <Spinner label="Loading document…" />;

  return (
    <div className={cx("transition-opacity duration-150", loading && "opacity-60")}>
      <DocumentDetail document={data} onChanged={reload} />
    </div>
  );
}

export function DocumentDetailPage() {
  const params = useParams();
  const id = /^\d+$/.test(params.documentId ?? "") ? Number(params.documentId) : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-8 sm:py-10">
        <BackLink />
        {id === null ? (
          <EmptyState
            icon={<FileQuestion className="size-5" aria-hidden="true" />}
            title="Document not found"
          >
            This address does not point to a document.
          </EmptyState>
        ) : (
          <DocumentLoader key={id} id={id} />
        )}
      </div>
    </div>
  );
}
