import { useState } from "react";
import { describeError } from "../../services/api";
import { deleteDocument, vectorDocumentId } from "../../services/documents";
import type { DocumentRecord } from "../../types/api";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { ErrorNotice, Note } from "../ui/Feedback";

interface DeleteDocumentDialogProps {
  /** Document to delete; null keeps the dialog closed. */
  document: DocumentRecord | null;
  onClose: () => void;
  onDeleted: (document: DocumentRecord) => void;
}

function DeleteConfirmation({
  document,
  onClose,
  onDeleted,
}: {
  document: DocumentRecord;
  onClose: () => void;
  onDeleted: (document: DocumentRecord) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const indexed = vectorDocumentId(document) !== null;

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteDocument(document.id);
      onDeleted(document);
    } catch (failure) {
      setError(describeError(failure));
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted">
        <span className="font-medium break-words text-fg">{document.title}</span> (record #
        {document.id}) will be removed from the library, along with its stored text. This cannot be
        undone.
      </p>

      {indexed && (
        <Note tone="warning">
          The backend deletes the library record only. This document's indexed passages and its PDF
          file stay on the server, so it can still appear as a source when you search all indexed
          documents.
        </Note>
      )}

      {error && <ErrorNotice title="The document was not deleted" message={error} />}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onClose} disabled={deleting} autoFocus>
          Cancel
        </Button>
        <Button variant="danger" onClick={handleDelete} loading={deleting}>
          Delete from library
        </Button>
      </div>
    </div>
  );
}

export function DeleteDocumentDialog({ document, onClose, onDeleted }: DeleteDocumentDialogProps) {
  return (
    <Dialog open={document !== null} onClose={onClose} title="Delete this document?">
      {document && (
        <DeleteConfirmation
          key={document.id}
          document={document}
          onClose={onClose}
          onDeleted={onDeleted}
        />
      )}
    </Dialog>
  );
}
