import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { IconButton } from "./Button";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Wider layout for forms with long text. */
  wide?: boolean;
}

/**
 * Modal built on the native <dialog>, which provides the focus trap,
 * Escape to close and background inertness.
 */
export function Dialog({ open, onClose, title, children, wide = false }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // A click on the element itself is a click on the backdrop.
        if (event.target === ref.current) onClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] rounded-2xl border border-line-strong bg-surface p-0 text-fg shadow-panel backdrop:bg-black/65 backdrop:backdrop-blur-[2px] open:animate-fade-in ${
        wide ? "max-w-2xl" : "max-w-md"
      }`}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <h2 id={titleId} className="min-w-0 text-base font-semibold break-words">
              {title}
            </h2>
            <IconButton label="Close" onClick={onClose} className="-my-1.5 -mr-2">
              <X className="size-4" aria-hidden="true" />
            </IconButton>
          </header>
          <div className="min-h-0 overflow-y-auto px-5 py-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}
