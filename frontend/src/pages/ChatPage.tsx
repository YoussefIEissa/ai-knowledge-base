import { MessageSquare } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Composer } from "../components/chat/Composer";
import { ScopePicker } from "../components/chat/ScopePicker";
import { TurnView } from "../components/chat/TurnView";
import { Welcome } from "../components/chat/Welcome";
import { EmptyState } from "../components/ui/Feedback";
import { useChat } from "../hooks/chatContext";
import { useDocuments } from "../hooks/useDocuments";
import { vectorDocumentId } from "../services/documents";
import type { DocumentRecord } from "../types/api";
import type { ChatScope } from "../types/chat";

export function ChatPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { conversations, scope, setScope, ask, retry, stop } = useChat();
  const documents = useDocuments();

  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const conversation = conversationId
    ? (conversations.find((item) => item.id === conversationId) ?? null)
    : null;
  const turns = conversation?.turns ?? [];
  const pendingTurn = turns.find((turn) => turn.status === "pending") ?? null;
  const lastTurn = turns[turns.length - 1];

  // Indexed library documents, keyed by the id the vector index uses.
  const library = useMemo(() => {
    if (!documents.data) return null;
    const map = new Map<string, DocumentRecord>();
    for (const document of documents.data) {
      const id = vectorDocumentId(document);
      if (id) map.set(id, document);
    }
    return map;
  }, [documents.data]);

  const scopeOptions = useMemo<ChatScope[]>(
    () =>
      library
        ? Array.from(library, ([documentId, document]) => ({ documentId, label: document.title }))
        : [],
    [library],
  );

  // Focus the message box on arrival and whenever "New chat" is chosen.
  useEffect(() => {
    textareaRef.current?.focus();
  }, [location.key]);

  // Keep the newest question or answer in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns.length, lastTurn?.status]);

  const handleSend = () => {
    const question = draft.trim();
    if (!question) return;
    const id = ask(conversation?.id ?? null, question, scope);
    setDraft("");
    if (!conversation) navigate(`/chat/${encodeURIComponent(id)}`, { replace: true });
  };

  const handlePick = (question: string) => {
    setDraft(question);
    textareaRef.current?.focus();
  };

  if (conversationId && !conversation) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState
          icon={<MessageSquare className="size-5" aria-hidden="true" />}
          title="This chat is not available"
          action={
            <Link
              to="/"
              className="inline-flex h-10 items-center rounded-lg border border-line-strong bg-raised px-4 text-sm font-medium hover:bg-overlay"
            >
              Start a new chat
            </Link>
          }
        >
          Chats are saved in the browser where they were created. This one was deleted or belongs
          to another browser.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 pt-8 pb-6 sm:px-6">
          {turns.length === 0 ? (
            <Welcome indexedCount={library ? library.size : null} onPick={handlePick} />
          ) : (
            <div className="space-y-10" aria-live="polite">
              {turns.map((turn) => (
                <TurnView
                  key={turn.id}
                  turn={turn}
                  library={library}
                  onRetry={() => conversation && retry(conversation.id, turn)}
                />
              ))}
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="shrink-0 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <Composer
            value={draft}
            onChange={setDraft}
            onSend={handleSend}
            onStop={() => pendingTurn && stop(pendingTurn.id)}
            pending={pendingTurn !== null}
            textareaRef={textareaRef}
            scopeControl={
              <ScopePicker scope={scope} onChange={setScope} options={scopeOptions} />
            }
          />
          <p className="mt-2 px-1 text-center text-[11px] leading-relaxed text-subtle">
            {documents.error
              ? "The document list could not be loaded, so only “all indexed documents” is available. "
              : ""}
            Each question is answered on its own; earlier messages are not sent to the model. Chats
            are saved in this browser only.
          </p>
        </div>
      </div>
    </div>
  );
}
