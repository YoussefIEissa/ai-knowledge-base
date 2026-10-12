import { Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { APP_NAME } from "../../config";
import { type BackendStatusApi, STATUS_LABELS, useBackendStatus } from "../../hooks/useBackendStatus";
import { IconButton } from "../ui/Button";
import { Logo } from "../ui/Logo";
import { Sidebar } from "./Sidebar";
import { StatusDot } from "./StatusIndicator";

export function AppShell() {
  const backend = useBackendStatus();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  const closeDrawer = () => setDrawerOpen(false);
  const outletContext: BackendStatusApi = backend;

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas text-fg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-overlay focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>

      <aside className="hidden w-[272px] shrink-0 border-r border-line bg-surface lg:block">
        <Sidebar status={backend.status} />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/65" onClick={closeDrawer} aria-hidden="true" />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="relative h-full w-[86%] max-w-[300px] animate-fade-in border-r border-line bg-surface shadow-panel"
          >
            <Sidebar status={backend.status} onNavigate={closeDrawer} onClose={closeDrawer} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-2 lg:hidden">
          <IconButton
            label="Open navigation"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <Menu className="size-5" aria-hidden="true" />
          </IconButton>
          <Logo size={24} />
          <span className="flex-1 text-sm font-semibold tracking-tight">{APP_NAME}</span>
          <span className="mr-2 flex items-center" title={STATUS_LABELS[backend.status.state]}>
            <StatusDot state={backend.status.state} />
            <span className="sr-only">{STATUS_LABELS[backend.status.state]}</span>
          </span>
        </header>

        <main id="main" className="min-h-0 flex-1">
          <Outlet context={outletContext} />
        </main>
      </div>
    </div>
  );
}
