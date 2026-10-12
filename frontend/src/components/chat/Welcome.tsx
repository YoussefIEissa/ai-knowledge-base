import { ArrowUpRight, FileUp } from "lucide-react";
import { Link } from "react-router-dom";
import { Note } from "../ui/Feedback";
import { Logo } from "../ui/Logo";

// Starting points that fit any document. They are prompts to edit, not
// claims about what the user's documents contain.
const SUGGESTIONS = [
  "Summarize the main points of this document.",
  "What topics does this document cover?",
  "List the key terms and how they are defined.",
  "What steps or procedures are described?",
];

interface WelcomeProps {
  /** Number of indexed documents in the library, or null while unknown. */
  indexedCount: number | null;
  onPick: (question: string) => void;
}

export function Welcome({ indexedCount, onPick }: WelcomeProps) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center pt-[8vh] text-center">
      <div className="rounded-2xl shadow-[0_12px_40px_-8px_rgb(106_90_224/0.55)]">
        <Logo size={52} />
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight sm:text-[28px]">
        Ask your documents
      </h1>
      <p className="mt-2.5 max-w-md text-[15px] leading-relaxed text-muted">
        Answers are written from passages retrieved from your indexed PDFs, and every answer shows
        the passages it was given.
      </p>

      {indexedCount === 0 && (
        <Note className="mt-6 w-full text-left">
          <p>
            Your library has no indexed PDFs yet.{" "}
            <Link
              to="/documents"
              className="inline-flex items-center gap-1 font-medium text-accent underline decoration-accent/40 underline-offset-2"
            >
              <FileUp className="size-3.5" aria-hidden="true" />
              Upload a PDF
            </Link>{" "}
            to get useful answers. You can still ask: the vector index may hold passages from
            documents that are not listed in the library.
          </p>
        </Note>
      )}

      <div className="mt-8 w-full text-left">
        <h2 className="mb-2 text-xs font-semibold tracking-wider text-subtle uppercase">
          Try asking
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                onClick={() => onPick(suggestion)}
                className="group flex h-full w-full items-start justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-left text-sm text-muted transition duration-150 hover:border-line-strong hover:bg-raised hover:text-fg"
              >
                {suggestion}
                <ArrowUpRight
                  className="mt-0.5 size-3.5 shrink-0 text-subtle transition duration-150 group-hover:text-accent"
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-subtle">
          Choosing one fills the message box so you can edit it before sending.
        </p>
      </div>
    </div>
  );
}
