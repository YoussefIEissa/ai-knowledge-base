import { CircleAlert, CircleCheck, CloudUpload, FileText, LoaderCircle, X } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import type { UploadItem } from "../../hooks/useUploadQueue";
import { cx, formatBytes, formatCount, plural } from "../../utils/format";
import { Button, IconButton } from "../ui/Button";

interface UploadZoneProps {
  items: UploadItem[];
  onFiles: (files: File[]) => void;
  onCancel: (id: string) => void;
  onDismiss: (id: string) => void;
}

function UploadRow({
  item,
  onCancel,
  onDismiss,
}: {
  item: UploadItem;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const percent = Math.round(item.progress * 100);
  const finished = item.phase === "done" || item.phase === "error" || item.phase === "cancelled";

  return (
    <li className="flex items-start gap-3 rounded-xl border border-line bg-surface px-3.5 py-3">
      <span className="mt-0.5 shrink-0">
        {item.phase === "done" && <CircleCheck className="size-4 text-success" aria-hidden="true" />}
        {item.phase === "error" && <CircleAlert className="size-4 text-danger" aria-hidden="true" />}
        {(item.phase === "uploading" || item.phase === "processing") && (
          <LoaderCircle className="size-4 animate-spin text-accent" aria-hidden="true" />
        )}
        {(item.phase === "queued" || item.phase === "cancelled") && (
          <FileText className="size-4 text-subtle" aria-hidden="true" />
        )}
      </span>

      <div className="min-w-0 flex-1 text-sm" role={item.phase === "error" ? "alert" : "status"}>
        <p className="truncate font-medium">{item.name}</p>

        {item.phase === "queued" && <p className="text-xs text-subtle">Waiting for the previous upload to finish.</p>}

        {item.phase === "uploading" && (
          <>
            <p className="text-xs text-muted">
              Sending file… {percent}% of {formatBytes(item.size)}
            </p>
            <div
              role="progressbar"
              aria-label={`Sending ${item.name}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="mt-2 h-1 overflow-hidden rounded-full bg-line-strong"
            >
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-200"
                style={{ width: `${percent}%` }}
              />
            </div>
          </>
        )}

        {item.phase === "processing" && (
          <>
            <p className="text-xs text-muted">
              File sent. The backend is converting, chunking and indexing it. This can take from
              seconds to several minutes and reports no progress.
            </p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-line-strong" aria-hidden="true">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
            </div>
          </>
        )}

        {item.phase === "done" && item.result && (
          <p className="text-xs text-muted">
            Indexed {plural(item.result.ingestion.chunks_indexed, "chunk")} from{" "}
            {formatCount(item.result.extracted_characters)} extracted characters (
            {formatBytes(item.result.size_bytes)}).
          </p>
        )}

        {item.phase === "error" && (
          <p className="text-xs break-words text-danger">{item.error ?? "The upload failed."}</p>
        )}

        {item.phase === "cancelled" && <p className="text-xs text-subtle">Cancelled. Nothing was added.</p>}
      </div>

      {(item.phase === "queued" || item.phase === "uploading") && (
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      )}
      {finished && (
        <IconButton label={`Dismiss ${item.name}`} onClick={onDismiss} className="-my-1.5 -mr-1.5">
          <X className="size-4" aria-hidden="true" />
        </IconButton>
      )}
    </li>
  );
}

export function UploadZone({ items, onFiles, onCancel, onDismiss }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  };

  return (
    <section aria-label="Upload PDFs">
      <div
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={handleDrop}
        className={cx(
          "flex flex-col items-center rounded-2xl border border-dashed px-6 py-9 text-center transition duration-150",
          dragging ? "border-accent bg-accent-soft" : "border-line-strong bg-surface",
        )}
      >
        <div
          className={cx(
            "mb-4 flex size-11 items-center justify-center rounded-xl border transition duration-150",
            dragging ? "border-accent/50 bg-accent-soft text-accent" : "border-line bg-raised text-muted",
          )}
        >
          <CloudUpload className="size-5" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium">{dragging ? "Drop to upload" : "Drag PDFs here"}</p>
        <p className="mt-1 text-[13px] text-muted">
          PDF only, up to 40 MB each. Each file is converted and indexed for questions.
        </p>
        <Button className="mt-4" onClick={() => inputRef.current?.click()}>
          Choose files
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            // Reset so choosing the same file again fires a change event.
            event.target.value = "";
            if (files.length > 0) onFiles(files);
          }}
        />
      </div>

      {items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <UploadRow
              key={item.id}
              item={item}
              onCancel={() => onCancel(item.id)}
              onDismiss={() => onDismiss(item.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
