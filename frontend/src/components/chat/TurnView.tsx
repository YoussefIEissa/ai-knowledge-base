import { Check, Copy, FileText, Library, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { DocumentRecord } from "../../types/api";
import type { ChatTurn } from "../../types/chat";
import { Markdown } from "../Markdown";
import { Button } from "../ui/Button";
import { ErrorNotice } from "../ui/Feedback";
import { Logo } from "../ui/Logo";
import { type SourceFocus, SourceList } from "./SourceList";

interface TurnViewProps {
  turn: ChatTurn;
  library: Map<string, DocumentRecord> | null;
  onRetry: () => void;
}

function ScopeLine({ turn }: { turn: ChatTurn }) {
  const Icon = turn.scope ? FileText : Library;
  return (
    <p className="mb-2 flex min-w-0 items-center gap-1.5 text-xs text-subtle">
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="shrink-0">Searched</span>
      <span className="truncate font-medium text-muted">
        {turn.scope ? turn.scope.label : "all indexed documents"}
      </span>
    </p>
  );
}

/** Honest waiting state: the backend returns the whole answer at once. */
function Pending({ askedAt }: { askedAt: number }) {
  const [now, setNow] = useState(askedAt);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const seconds = Math.max(0, Math.floor((now - askedAt) / 1000));

  return (
    <div role="status" className="space-y-2">
      <div className="flex items-center gap-3 text-sm text-muted">
        <span className="flex gap-1" aria-hidden="true">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="size-1.5 animate-pulse-dot rounded-full bg-accent"
              style={{ animationDelay: `${dot * 0.16}s` }}
            />
          ))}
        </span>
        <span>Retrieving passages and generating an answer…</span>
        <span className="font-mono text-xs text-subtle tabular-nums">{seconds}s</span>
      </div>
      {seconds >= 12 && (
        <p className="text-xs text-subtle">
          The answer arrives all at once when the model finishes. The first question after the
          backend starts takes longer while the embedding model loads.
        </p>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard access can be denied; the text can still be selected by hand.
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={copy}
      icon={
        copied ? (
          <Check className="size-3.5 text-success" aria-hidden="true" />
        ) : (
          <Copy className="size-3.5" aria-hidden="true" />
        )
      }
    >
      {copied ? "Copied" : "Copy answer"}
    </Button>
  );
}

export function TurnView({ turn, library, onRetry }: TurnViewProps) {
  const [focus, setFocus] = useState<SourceFocus | null>(null);
  const sources = turn.sources ?? [];

  const handleCitation = useCallback((number: number) => {
    setFocus((current) => ({ number, nonce: (current?.nonce ?? 0) + 1 }));
  }, []);

  return (
    <article className="animate-fade-in space-y-5">
      <div className="flex justify-end">
        <div dir="auto" className="max-w-[88%] rounded-2xl rounded-br-md border border-line-strong bg-raised px-4 py-2.5 text-[15px] leading-relaxed break-words whitespace-pre-wrap">
          <span className="sr-only">You asked: </span>
          {turn.question}
        </div>
      </div>

      <div className="flex gap-3">
        <div className="mt-0.5 hidden sm:block">
          <Logo size={26} />
        </div>
        <div className="min-w-0 flex-1">
          <ScopeLine turn={turn} />

          {turn.status === "pending" && <Pending askedAt={turn.askedAt} />}

          {turn.status === "done" && (
            <div className="space-y-4">
              <div>
                <span className="sr-only">Answer: </span>
                <Markdown
                  content={turn.answer ?? ""}
                  sourceCount={sources.length}
                  onCitationClick={handleCitation}
                />
              </div>
              <div className="-ml-2.5">
                <CopyButton text={turn.answer ?? ""} />
              </div>
              <SourceList sources={sources} library={library} focus={focus} />
            </div>
          )}

          {turn.status === "error" && (
            <ErrorNotice
              title="No answer was returned"
              message={turn.error ?? "The request failed."}
              onRetry={onRetry}
              retryLabel="Ask again"
            />
          )}

          {turn.status === "stopped" && (
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
              <span>You stopped waiting for this answer.</span>
              <Button
                size="sm"
                onClick={onRetry}
                icon={<RefreshCw className="size-3.5" aria-hidden="true" />}
              >
                Ask again
              </Button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
