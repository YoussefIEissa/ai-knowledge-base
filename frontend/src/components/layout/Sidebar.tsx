import { FileText, MessageSquare, Plus, Settings, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { APP_NAME } from "../../config";
import { useChat } from "../../hooks/chatContext";
import type { BackendStatus } from "../../hooks/useBackendStatus";
import { cx } from "../../utils/format";
import { IconButton } from "../ui/Button";
import { Logo } from "../ui/Logo";
import { StatusIndicator } from "./StatusIndicator";

interface SidebarProps {
  status: BackendStatus;
  /** Called after any navigation, so the mobile drawer can close. */
  onNavigate?: () => void;
  /** Rendered next to the logo; used for the drawer's close button. */
  onClose?: () => void;
}

function NavItem({
  to,
  active,
  icon,
  children,
  onNavigate,
}: {
  to: string;
  active: boolean;
  icon: ReactNode;
  children: ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition duration-150",
        active ? "bg-raised text-fg" : "text-muted hover:bg-raised/60 hover:text-fg",
      )}
    >
      <span className={cx("shrink-0", active ? "text-accent" : "text-subtle")}>{icon}</span>
      {children}
    </Link>
  );
}

export function Sidebar({ status, onNavigate, onClose }: SidebarProps) {
  const { conversations, removeConversation } = useChat();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const onChat = pathname === "/" || pathname.startsWith("/chat/");
  const activeConversationId = pathname.startsWith("/chat/")
    ? decodeURIComponent(pathname.slice("/chat/".length))
    : null;

  const handleDelete = (conversationId: string) => {
    removeConversation(conversationId);
    if (conversationId === activeConversationId) navigate("/", { replace: true });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-4">
        <Logo />
        <span className="flex-1 text-[15px] font-semibold tracking-tight">{APP_NAME}</span>
        {onClose && (
          <IconButton label="Close navigation" onClick={onClose} autoFocus>
            <X className="size-4" aria-hidden="true" />
          </IconButton>
        )}
      </div>

      <div className="px-3">
        <Link
          to="/"
          onClick={onNavigate}
          className="flex h-10 items-center justify-center gap-2 rounded-lg border border-line-strong bg-raised text-sm font-medium transition duration-150 hover:border-accent/50 hover:bg-overlay"
        >
          <Plus className="size-4 text-accent" aria-hidden="true" />
          New chat
        </Link>
      </div>

      <nav aria-label="Main" className="mt-4 space-y-0.5 px-3">
        <NavItem
          to="/"
          active={onChat}
          icon={<MessageSquare className="size-4" aria-hidden="true" />}
          onNavigate={onNavigate}
        >
          Chat
        </NavItem>
        <NavItem
          to="/documents"
          active={pathname.startsWith("/documents")}
          icon={<FileText className="size-4" aria-hidden="true" />}
          onNavigate={onNavigate}
        >
          Documents
        </NavItem>
        <NavItem
          to="/settings"
          active={pathname.startsWith("/settings")}
          icon={<Settings className="size-4" aria-hidden="true" />}
          onNavigate={onNavigate}
        >
          Settings
        </NavItem>
      </nav>

      <div className="mt-6 flex min-h-0 flex-1 flex-col">
        <div className="flex items-baseline justify-between px-6 pb-2">
          <h2 className="text-[11px] font-semibold tracking-wider text-subtle uppercase">
            Recent chats
          </h2>
          <span className="text-[11px] text-subtle" title="Chats are saved in this browser's storage, not on the server.">
            This browser only
          </span>
        </div>

        {conversations.length === 0 ? (
          <p className="px-6 text-[13px] leading-relaxed text-subtle">
            Your chats will appear here.
          </p>
        ) : (
          <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-2">
            {conversations.map((conversation) => {
              const active = conversation.id === activeConversationId;
              return (
                <li key={conversation.id} className="group relative">
                  <Link
                    to={`/chat/${encodeURIComponent(conversation.id)}`}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "block truncate rounded-lg py-2 pr-9 pl-3 text-[13px] transition duration-150",
                      active ? "bg-raised text-fg" : "text-muted hover:bg-raised/60 hover:text-fg",
                    )}
                  >
                    {conversation.title}
                  </Link>
                  <button
                    type="button"
                    aria-label={`Delete chat: ${conversation.title}`}
                    title="Delete chat"
                    onClick={() => handleDelete(conversation.id)}
                    className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-subtle opacity-100 transition hover:bg-overlay hover:text-danger focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="shrink-0 space-y-3 border-t border-line p-3">
        <StatusIndicator status={status} />
        <p className="px-1 text-[11px] leading-relaxed text-subtle">
          Local retrieval-augmented generation over your own PDFs. FastAPI, Qdrant and llama.cpp.
        </p>
      </div>
    </div>
  );
}
