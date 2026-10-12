import { FileSearch, FileText, Search, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DeleteDocumentDialog } from "../components/documents/DeleteDocumentDialog";
import { DocumentList } from "../components/documents/DocumentList";
import { EditDocumentDialog } from "../components/documents/EditDocumentDialog";
import { UploadZone } from "../components/documents/UploadZone";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorNotice, Spinner } from "../components/ui/Feedback";
import { useChat } from "../hooks/chatContext";
import { useToast } from "../hooks/toastContext";
import { useDebouncedValue, useDocuments } from "../hooks/useDocuments";
import { useUploadQueue } from "../hooks/useUploadQueue";
import { vectorDocumentId } from "../services/documents";
import { loadChunkCounts, saveChunkCounts } from "../services/localStore";
import type { DocumentRecord, UploadResponse } from "../types/api";
import { cx, plural } from "../utils/format";

export function DocumentsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { setScope } = useChat();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const query = useDebouncedValue(search.trim(), 300);
  const filtering = query !== "" || category !== null;

  // The unfiltered list supplies the category choices; the filtered list is
  // fetched with the backend's own `q` and `category` parameters.
  const all = useDocuments();
  const filtered = useDocuments({ q: query, category: category ?? "" }, filtering);
  const view = filtering ? filtered : all;
  const reloadAll = all.reload;
  const reloadFiltered = filtered.reload;

  const reload = useCallback(() => {
    reloadAll();
    reloadFiltered();
  }, [reloadAll, reloadFiltered]);

  const [chunkCounts, setChunkCounts] = useState(loadChunkCounts);
  const [editing, setEditing] = useState<DocumentRecord | null>(null);
  const [deleting, setDeleting] = useState<DocumentRecord | null>(null);

  const handleUploaded = useCallback(
    (result: UploadResponse) => {
      const next = { ...loadChunkCounts(), [result.filename]: result.ingestion.chunks_indexed };
      saveChunkCounts(next);
      setChunkCounts(next);
      reload();
    },
    [reload],
  );
  const uploads = useUploadQueue(handleUploaded);

  const categories = useMemo(
    () => Array.from(new Set((all.data ?? []).map((document) => document.category))).sort(),
    [all.data],
  );

  const handleAsk = (document: DocumentRecord) => {
    const documentId = vectorDocumentId(document);
    if (!documentId) return;
    setScope({ documentId, label: document.title });
    navigate("/");
  };

  const clearFilters = () => {
    setSearch("");
    setCategory(null);
  };

  // While a new filter is loading, the previous result stays on screen, but
  // a previous "no matches" result would be wrong to show, so wait instead.
  const documents = view.loading && view.data?.length === 0 ? null : view.data;
  const total = all.data?.length ?? null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-8 sm:py-10">
        <header className="mb-7">
          <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
          <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted">
            Upload PDFs to make them searchable by the assistant. Each file is converted to text,
            split into chunks and added to the vector index.
          </p>
        </header>

        <UploadZone
          items={uploads.items}
          onFiles={uploads.enqueue}
          onCancel={uploads.cancel}
          onDismiss={uploads.dismiss}
        />

        <section aria-label="Document library" className="mt-10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">
              Library
              {total !== null && (
                <span className="ml-2 text-sm font-normal text-subtle">
                  {plural(total, "document")}
                </span>
              )}
            </h2>
            {view.loading && documents !== null && <Spinner label="Updating…" />}
          </div>

          <div className="mb-4 space-y-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search titles and content…"
                aria-label="Search documents by title or content"
                className="field h-10 pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                  className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-subtle hover:text-fg"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              )}
            </div>

            {categories.length > 1 && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
                {[null, ...categories].map((option) => {
                  const selected = category === option;
                  return (
                    <button
                      key={option ?? "__all"}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setCategory(option)}
                      className={cx(
                        "h-7 rounded-full border px-3 text-xs font-medium transition duration-150",
                        selected
                          ? "border-accent/50 bg-accent-soft text-fg"
                          : "border-line-strong text-muted hover:bg-raised hover:text-fg",
                      )}
                    >
                      {option ?? "All categories"}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {view.error ? (
            <ErrorNotice
              title="The documents could not be loaded"
              message={view.error.message}
              onRetry={reload}
            />
          ) : documents === null ? (
            <div className="space-y-2" aria-busy="true">
              <span className="sr-only" role="status">
                Loading documents
              </span>
              {[0, 1, 2].map((row) => (
                <div key={row} className="card h-[74px] animate-pulse bg-raised/40" />
              ))}
            </div>
          ) : documents.length > 0 ? (
            <div className={cx("transition-opacity duration-150", view.loading && "opacity-60")}>
              <DocumentList
                documents={documents}
                chunkCounts={chunkCounts}
                onAsk={handleAsk}
                onEdit={setEditing}
                onDelete={setDeleting}
              />
            </div>
          ) : filtering ? (
            <EmptyState
              icon={<FileSearch className="size-5" aria-hidden="true" />}
              title="No documents match"
              action={<Button onClick={clearFilters}>Clear search and filters</Button>}
            >
              Search looks for your exact text in titles and extracted content.
            </EmptyState>
          ) : (
            <EmptyState
              icon={<FileText className="size-5" aria-hidden="true" />}
              title="No documents yet"
            >
              Upload a PDF above to start asking questions about it.
            </EmptyState>
          )}
        </section>
      </div>

      <EditDocumentDialog
        document={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          setEditing(null);
          reload();
          toast.notify("success", `Saved changes to “${saved.title}”.`);
        }}
      />
      <DeleteDocumentDialog
        document={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={(removed) => {
          setDeleting(null);
          reload();
          toast.notify("success", `Removed “${removed.title}” from the library.`);
        }}
      />
    </div>
  );
}
