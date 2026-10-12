import { ChevronDown, FileText, Library } from "lucide-react";
import type { ChatScope } from "../../types/chat";
import { cx } from "../../utils/format";

interface ScopePickerProps {
  scope: ChatScope | null;
  onChange: (scope: ChatScope | null) => void;
  /** Indexed documents from the library. */
  options: ChatScope[];
  disabled?: boolean;
}

/**
 * Chooses what the next question searches: every indexed passage, or one
 * document. A native select keeps it keyboard- and touch-friendly.
 */
export function ScopePicker({ scope, onChange, options, disabled }: ScopePickerProps) {
  const scoped = scope !== null;
  const scopeInLibrary = scope ? options.some((option) => option.documentId === scope.documentId) : true;
  const Icon = scoped ? FileText : Library;

  return (
    <label
      className={cx(
        "relative inline-flex h-8 max-w-full min-w-0 items-center gap-2 rounded-lg border pr-7 pl-2.5 text-[13px] transition duration-150",
        "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent",
        scoped
          ? "border-accent/40 bg-accent-soft text-fg"
          : "border-line-strong bg-raised text-muted hover:text-fg",
      )}
    >
      <Icon className={cx("size-3.5 shrink-0", scoped ? "text-accent" : "text-subtle")} aria-hidden="true" />
      <span className="shrink-0 text-subtle">Searching</span>
      <span className="truncate font-medium text-fg">{scope ? scope.label : "All indexed documents"}</span>
      <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-subtle" aria-hidden="true" />
      <select
        aria-label="Document scope for the next question"
        disabled={disabled}
        value={scope?.documentId ?? ""}
        onChange={(event) => {
          const id = event.target.value;
          if (!id) {
            onChange(null);
            return;
          }
          const match = options.find((option) => option.documentId === id);
          if (match) onChange(match);
        }}
        className="absolute inset-0 size-full cursor-pointer appearance-none bg-surface text-sm text-fg opacity-0 disabled:cursor-not-allowed"
      >
        <option value="">All indexed documents</option>
        {scope && !scopeInLibrary && (
          <option value={scope.documentId}>{scope.label} (no longer in the library)</option>
        )}
        {options.map((option) => (
          <option key={option.documentId} value={option.documentId}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
