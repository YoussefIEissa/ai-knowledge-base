import { ExternalLink, RefreshCw } from "lucide-react";
import { type ReactNode, useState } from "react";
import { StatusDot } from "../components/layout/StatusIndicator";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { Note } from "../components/ui/Feedback";
import { APP_NAME, BACKEND_PIPELINE } from "../config";
import { useChat } from "../hooks/chatContext";
import { useToast } from "../hooks/toastContext";
import { STATUS_HINTS, STATUS_LABELS, useShellStatus } from "../hooks/useBackendStatus";
import { API_BASE_URL } from "../services/api";
import { plural } from "../utils/format";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="card overflow-hidden">
      <header className="border-b border-line px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">{description}</p>
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-[13px] text-subtle">{label}</dt>
      <dd className="min-w-0 text-sm break-words">{children}</dd>
    </div>
  );
}

export function SettingsPage() {
  const { status, recheck } = useShellStatus();
  const { conversations, clearConversations } = useChat();
  const toast = useToast();
  const [testing, setTesting] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    await recheck();
    setTesting(false);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-8 sm:py-10">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
            How {APP_NAME} connects to your backend, and what is stored in this browser.
          </p>
        </header>

        <Section
          title="Backend connection"
          description="The browser sends API requests to this app's own address, and the Vite server forwards them to FastAPI."
        >
          <dl className="divide-y divide-line">
            <Row label="Status">
              <span className="flex items-center gap-2.5">
                <StatusDot state={status.state} />
                <span>{STATUS_LABELS[status.state]}</span>
                {status.state === "online" && (
                  <span className="font-mono text-xs text-subtle">{status.latencyMs} ms</span>
                )}
              </span>
              <p className="mt-1 text-[13px] text-muted">
                {status.state === "offline" ? status.message : STATUS_HINTS[status.state]}
              </p>
            </Row>
            {status.state === "online" && (
              <Row label="API">
                {status.title} <span className="font-mono text-[13px] text-muted">v{status.version}</span>
              </Row>
            )}
            <Row label="API base path">
              <code className="font-mono text-[13px]">{API_BASE_URL}</code>
            </Row>
            <Row label="Forwarded to">
              <code className="font-mono text-[13px]">{__BACKEND_TARGET__}</code>
              <p className="mt-1 text-[13px] text-muted">
                Set when the frontend server starts, with the KNOWLEDGE_API_URL environment
                variable.
              </p>
            </Row>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={handleTest}
              loading={testing}
              icon={<RefreshCw className="size-4" aria-hidden="true" />}
            >
              Test connection
            </Button>
            <a
              href={`${__BACKEND_TARGET__}/docs`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium text-muted transition duration-150 hover:bg-raised hover:text-fg"
            >
              Open API docs
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-subtle">
            The test requests the API description (GET /openapi.json), because the backend has no
            health endpoint. It shows that FastAPI is answering, not that the vector database or
            language model are working.
          </p>
        </Section>

        <Section
          title="Retrieval and model"
          description="How the backend is set up to answer questions."
        >
          <Note className="mb-2">
            These are the backend's default values, read from its source code when this
            interface was built. The API does not report them, so they are not checked live and
            will be out of date if the backend is configured differently, for example with a
            different model file.
          </Note>
          <dl className="divide-y divide-line">
            {BACKEND_PIPELINE.map((item) => (
              <Row key={item.label} label={item.label}>
                {item.value}
              </Row>
            ))}
            <Row label="Model status">
              <span className="text-muted">
                Unknown. The backend loads the model file when you ask the first question.
              </span>
            </Row>
          </dl>
        </Section>

        <Section
          title="Data in this browser"
          description="The backend stores documents and their index. Everything about chats stays in this browser."
        >
          <dl className="divide-y divide-line">
            <Row label="Saved chats">
              {plural(conversations.length, "chat")}
              <p className="mt-1 text-[13px] text-muted">
                Chats are kept in this browser's local storage. They are not sent to the server
                and are not available in other browsers or devices.
              </p>
            </Row>
            <Row label="Conversation memory">
              <span className="text-muted">
                None. Each question is sent on its own; earlier messages are not included.
              </span>
            </Row>
          </dl>
          <div className="mt-4">
            <Button
              variant="danger"
              disabled={conversations.length === 0}
              onClick={() => setConfirmingClear(true)}
            >
              Delete all saved chats
            </Button>
          </div>
        </Section>
      </div>

      <Dialog
        open={confirmingClear}
        onClose={() => setConfirmingClear(false)}
        title="Delete all saved chats?"
      >
        <p className="text-sm leading-relaxed text-muted">
          This removes {plural(conversations.length, "chat")} from this browser. Your documents on
          the server are not affected. This cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmingClear(false)} autoFocus>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              clearConversations();
              setConfirmingClear(false);
              toast.notify("success", "All saved chats were deleted from this browser.");
            }}
          >
            Delete chats
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
