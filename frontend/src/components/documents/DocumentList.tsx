import { FileText, MessageSquare, Pencil, StickyNote, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { vectorDocumentId } from "../../services/documents";
import type { DocumentRecord } from "../../types/api";
import { formatCount, plural } from "../../utils/format";
import { IconButton } from "../ui/Button";
import { Badge } from "../ui/Feedback";

interface DocumentListProps {
  documents: DocumentRecord[];
  /** Chunk counts remembered in this browser, keyed by vector-index id. */
  chunkCounts: Record<string, number>;
  onAsk: (document: DocumentRecord) => void;
  onEdit: (document: DocumentRecord) => void;
  onDelete: (document: DocumentRecord) => void;
}

export function DocumentList({ documents, chunkCounts, onAsk, onEdit, onDelete }: DocumentListProps) {
  return (
    <ul className="space-y-2">
      {documents.map((document) => {
        const vectorId = vectorDocumentId(document);
        const chunks = vectorId ? chunkCounts[vectorId] : undefined;
        const Icon = vectorId ? FileText : StickyNote;

        return (
          <li
            key={document.id}
            className="card flex items-center gap-3 p-3 transition duration-150 hover:border-line-strong sm:gap-4 sm:p-4"
          >
            <div className="hidden size-10 shrink-0 items-center justify-center rounded-lg border border-line bg-raised text-muted sm:flex">
              <Icon className="size-[18px]" aria-hidden="true" />
            </div>

            <div className="min-w-0 flex-1">
              <Link
                to={`/documents/${document.id}`}
                className="block truncate text-sm font-medium hover:text-accent"
              >
                {document.title}
              </Link>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-subtle">
                <Badge>{document.category}</Badge>
                {vectorId ? <Badge tone="success">Indexed PDF</Badge> : <Badge>Text only · not indexed</Badge>}
                <span>{formatCount(document.content.length)} characters</span>
                {chunks !== undefined && (
                  <span title="Reported by the backend when this file was uploaded from this browser.">
                    {plural(chunks, "chunk")}
                  </span>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center">
              {vectorId && (
                <IconButton label={`Ask about ${document.title}`} onClick={() => onAsk(document)}>
                  <MessageSquare className="size-4" aria-hidden="true" />
                </IconButton>
              )}
              <IconButton label={`Edit ${document.title}`} onClick={() => onEdit(document)}>
                <Pencil className="size-4" aria-hidden="true" />
              </IconButton>
              <IconButton
                label={`Delete ${document.title}`}
                tone="danger"
                onClick={() => onDelete(document)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </IconButton>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
