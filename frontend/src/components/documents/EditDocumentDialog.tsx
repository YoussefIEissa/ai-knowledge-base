import { type FormEvent, useId, useState } from "react";
import { describeError } from "../../services/api";
import { patchDocument, vectorDocumentId } from "../../services/documents";
import type { DocumentPatch, DocumentRecord } from "../../types/api";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { ErrorNotice, Note } from "../ui/Feedback";

interface EditDocumentDialogProps {
  /** Document being edited; null keeps the dialog closed. */
  document: DocumentRecord | null;
  onClose: () => void;
  onSaved: (document: DocumentRecord) => void;
}

function EditForm({
  document,
  onClose,
  onSaved,
}: {
  document: DocumentRecord;
  onClose: () => void;
  onSaved: (document: DocumentRecord) => void;
}) {
  const formId = useId();
  const [title, setTitle] = useState(document.title);
  const [category, setCategory] = useState(document.category);
  const [content, setContent] = useState(document.content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // PATCH accepts any subset of fields, so send only what changed.
  const patch: DocumentPatch = {};
  if (title !== document.title) patch.title = title;
  if (category !== document.category) patch.category = category;
  if (content !== document.content) patch.content = content;

  const blank = {
    title: title.trim() === "",
    category: category.trim() === "",
    content: content.trim() === "",
  };
  const changed = Object.keys(patch).length > 0;
  const valid = !blank.title && !blank.category && !blank.content;
  const indexed = vectorDocumentId(document) !== null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!changed || !valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      onSaved(await patchDocument(document.id, patch));
    } catch (failure) {
      setError(describeError(failure));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {indexed && (
        <Note tone="warning">
          Edits change the stored record only. The backend does not re-index, so answers and
          source names keep reflecting the original PDF.
        </Note>
      )}

      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <div>
          <label htmlFor={`${formId}-title`} className="mb-1.5 block text-[13px] font-medium">
            Title
          </label>
          <input
            id={`${formId}-title`}
            className="field"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-invalid={blank.title}
            autoComplete="off"
          />
          {blank.title && <p className="mt-1 text-xs text-danger">Title cannot be empty.</p>}
        </div>
        <div>
          <label htmlFor={`${formId}-category`} className="mb-1.5 block text-[13px] font-medium">
            Category
          </label>
          <input
            id={`${formId}-category`}
            className="field"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            aria-invalid={blank.category}
            autoComplete="off"
          />
          {blank.category && <p className="mt-1 text-xs text-danger">Category cannot be empty.</p>}
        </div>
      </div>

      <div>
        <label htmlFor={`${formId}-content`} className="mb-1.5 block text-[13px] font-medium">
          Content
        </label>
        <textarea
          id={`${formId}-content`}
          className="field min-h-48 resize-y font-mono text-[13px] leading-relaxed"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          aria-invalid={blank.content}
          spellCheck={false}
        />
        {blank.content && <p className="mt-1 text-xs text-danger">Content cannot be empty.</p>}
      </div>

      {error && <ErrorNotice title="The changes were not saved" message={error} />}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={saving} disabled={!changed || !valid}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

export function EditDocumentDialog({ document, onClose, onSaved }: EditDocumentDialogProps) {
  return (
    <Dialog open={document !== null} onClose={onClose} title="Edit document" wide>
      {document && (
        <EditForm key={document.id} document={document} onClose={onClose} onSaved={onSaved} />
      )}
    </Dialog>
  );
}
