import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { DocumentRecord, Source } from "../../types/api";
import { cx, plural } from "../../utils/format";

export interface SourceFocus {
  /** 1-based source number. */
  number: number;
  /** Changes on every request so the same source can be focused again. */
  nonce: number;
}

interface SourceListProps {
  sources: Source[];
  /**
   * Library documents keyed by their vector-index id, or null while the
   * library has not loaded (then no claim is made about library membership).
   */
  library: Map<string, DocumentRecord> | null;
  /** Source to open and scroll to, set when a citation marker is clicked. */
  focus: SourceFocus | null;
}

function ScoreMeter({ score }: { score: number }) {
  const width = `${Math.round(Math.min(Math.max(score, 0), 1) * 100)}%`;
  return (
    <span className="flex shrink-0 items-center gap-2" title="Cosine similarity between the question and this passage">
      <span className="hidden h-1 w-12 overflow-hidden rounded-full bg-line-strong sm:block" aria-hidden="true">
        <span className="block h-full rounded-full bg-accent" style={{ width }} />
      </span>
      <span className="font-mono text-[11px] text-muted tabular-nums">{score.toFixed(2)}</span>
    </span>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[7.5rem_1fr] sm:gap-3">
      <dt className="text-subtle">{label}</dt>
      <dd className="min-w-0 text-muted">{children}</dd>
    </div>
  );
}

interface SourceCardProps {
  source: Source;
  number: number;
  open: boolean;
  highlighted: boolean;
  onToggle: () => void;
  library: Map<string, DocumentRecord> | null;
  cardRef: (element: HTMLLIElement | null) => void;
}

function SourceCard({ source, number, open, highlighted, onToggle, library, cardRef }: SourceCardProps) {
  const panelId = `source-${number}-${source.chunk_id ?? "details"}`;
  const libraryDocument = source.document_id ? (library?.get(source.document_id) ?? null) : null;

  return (
    <li
      ref={cardRef}
      className={cx(
        "overflow-hidden rounded-xl border bg-surface transition duration-200",
        highlighted ? "border-accent/70 shadow-[0_0_0_3px_var(--color-accent-soft)]" : "border-line",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition duration-150 hover:bg-raised/60"
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-accent/30 bg-accent-soft text-[11px] font-semibold text-accent">
          {number}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">
            {source.source_filename ?? "Unnamed source"}
          </span>
          {source.headings.length > 0 && (
            <span className="block truncate text-xs text-subtle">{source.headings.join(" › ")}</span>
          )}
        </span>
        {source.score !== null && <ScoreMeter score={source.score} />}
        <ChevronDown
          className={cx("size-4 shrink-0 text-subtle transition duration-200", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open && (
        <dl id={panelId} className="space-y-2 border-t border-line bg-canvas/40 px-3 py-3 text-xs">
          {source.headings.length > 0 && <Detail label="Section">{source.headings.join(" › ")}</Detail>}
          {source.score !== null && (
            <Detail label="Similarity">
              <span className="font-mono">{source.score.toFixed(4)}</span> cosine similarity to your
              question. Higher means closer in meaning; it is not a measure of correctness.
            </Detail>
          )}
          {source.document_id && (
            <Detail label="Document">
              {libraryDocument ? (
                <Link
                  to={`/documents/${libraryDocument.id}`}
                  className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
                >
                  {libraryDocument.title}
                </Link>
              ) : library ? (
                "Not in the document library. Its passages are still in the vector index."
              ) : (
                <span className="font-mono break-all">{source.document_id}</span>
              )}
            </Detail>
          )}
          {source.chunk_id && (
            <Detail label="Chunk ID">
              <span className="font-mono break-all">{source.chunk_id}</span>
            </Detail>
          )}
          <p className="pt-1 text-subtle">
            The API returns this passage's metadata but not its text.
            {libraryDocument && " Open the document to read the extracted content."}
          </p>
        </dl>
      )}
    </li>
  );
}

export function SourceList({ sources, library, focus }: SourceListProps) {
  const [openNumbers, setOpenNumbers] = useState<ReadonlySet<number>>(new Set());
  const [handledNonce, setHandledNonce] = useState<number | null>(null);
  const cards = useRef(new Map<number, HTMLLIElement>());

  // Open the cited source when a citation marker is clicked.
  if (focus && focus.nonce !== handledNonce) {
    setHandledNonce(focus.nonce);
    setOpenNumbers((current) => new Set(current).add(focus.number));
  }

  useEffect(() => {
    if (!focus) return;
    cards.current.get(focus.number)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focus]);

  const toggle = (number: number) => {
    setOpenNumbers((current) => {
      const next = new Set(current);
      if (!next.delete(number)) next.add(number);
      return next;
    });
  };

  if (sources.length === 0) {
    return (
      <p className="text-[13px] text-subtle">No passages were retrieved for this question.</p>
    );
  }

  return (
    <section aria-label="Sources">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-xs font-semibold tracking-wider text-subtle uppercase">
          Sources · {plural(sources.length, "retrieved passage")}
        </h3>
      </div>
      <ol className="space-y-1.5">
        {sources.map((source, index) => {
          const number = index + 1;
          return (
            <SourceCard
              key={`${number}-${source.chunk_id ?? ""}`}
              source={source}
              number={number}
              open={openNumbers.has(number)}
              highlighted={focus?.number === number}
              onToggle={() => toggle(number)}
              library={library}
              cardRef={(element) => {
                if (element) cards.current.set(number, element);
                else cards.current.delete(number);
              }}
            />
          );
        })}
      </ol>
      <p className="mt-2 text-xs leading-relaxed text-subtle">
        These are the passages retrieved for your question, in the order they were given to the
        model. A numbered marker in the answer points to the passage the model cited; passages
        without a marker were retrieved but may not have been used.
      </p>
    </section>
  );
}
