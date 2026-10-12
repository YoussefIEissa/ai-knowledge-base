import { ArrowUp, Square } from "lucide-react";
import { type KeyboardEvent, type ReactNode, type RefObject, useLayoutEffect } from "react";
import { QUESTION_MAX_LENGTH } from "../../config";
import { cx, formatCount } from "../../utils/format";

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  /** Stop waiting for the pending answer. */
  onStop: () => void;
  pending: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** Scope picker, rendered in the composer's footer. */
  scopeControl: ReactNode;
}

const MAX_HEIGHT_PX = 220;

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  pending,
  textareaRef,
  scopeControl,
}: ComposerProps) {
  const length = value.trim().length;
  const tooLong = length > QUESTION_MAX_LENGTH;
  const canSend = !pending && length > 0 && !tooLong;

  // Grow with the text up to a limit, then scroll.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value, textareaRef]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter adds a line. Ignore Enter that confirms an
    // input-method composition (for example when typing Arabic or Japanese).
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (canSend) onSend();
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSend();
      }}
      className={cx(
        "rounded-2xl border bg-surface shadow-panel transition duration-150",
        "focus-within:border-accent/60 focus-within:shadow-[0_0_0_3px_var(--color-accent-soft),var(--shadow-panel)]",
        tooLong ? "border-danger/60" : "border-line-strong",
      )}
    >
      <label htmlFor="question" className="sr-only">
        Ask a question about your documents
      </label>
      <textarea
        id="question"
        ref={textareaRef}
        rows={1}
        dir="auto"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask a question about your documents…"
        aria-invalid={tooLong}
        aria-describedby="composer-hint"
        className="block w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-relaxed placeholder:text-subtle focus:outline-none"
      />

      <div className="flex items-end justify-between gap-3 px-2.5 pb-2.5">
        <div className="min-w-0">{scopeControl}</div>

        <div className="flex shrink-0 items-center gap-3">
          <span
            id="composer-hint"
            className={cx("text-[11px]", tooLong ? "text-danger" : "text-subtle")}
          >
            {tooLong || length > QUESTION_MAX_LENGTH * 0.8 ? (
              `${formatCount(length)} / ${formatCount(QUESTION_MAX_LENGTH)}`
            ) : (
              <span className="hidden sm:inline">Enter to send · Shift+Enter for a new line</span>
            )}
          </span>

          {pending ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop waiting for the answer"
              title="Stop waiting. The backend may still finish generating the answer."
              className="flex size-9 items-center justify-center rounded-xl border border-line-strong bg-raised text-fg transition duration-150 hover:bg-overlay"
            >
              <Square className="size-3.5 fill-current" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              aria-label="Send question"
              title="Send question"
              className="flex size-9 items-center justify-center rounded-xl bg-linear-to-b from-accent-strong to-indigo text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.16)] transition duration-150 hover:brightness-110 disabled:bg-none disabled:bg-raised disabled:text-subtle disabled:shadow-none"
            >
              <ArrowUp className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
