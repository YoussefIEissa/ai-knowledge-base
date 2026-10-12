import { CircleAlert, Info, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../utils/format";
import { Button } from "./Button";

export function Spinner({ label, className }: { label?: string; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 text-sm text-muted", className)} role="status">
      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      {label ?? <span className="sr-only">Loading</span>}
    </span>
  );
}

interface ErrorNoticeProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorNotice({ title, message, onRetry, retryLabel = "Try again" }: ErrorNoticeProps) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-xl border border-danger/30 bg-danger/[0.07] p-4 sm:flex-row sm:items-start"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">
        {title && <p className="font-medium text-fg">{title}</p>}
        <p className="break-words text-muted">{message}</p>
      </div>
      {onRetry && (
        <Button size="sm" onClick={onRetry} icon={<RefreshCw className="size-3.5" aria-hidden="true" />}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

interface NoteProps {
  tone?: "info" | "warning";
  children: ReactNode;
  className?: string;
}

/** A quiet inline explanation, used to state limits honestly. */
export function Note({ tone = "info", children, className }: NoteProps) {
  const Icon = tone === "warning" ? TriangleAlert : Info;
  return (
    <div
      className={cx(
        "flex gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] leading-relaxed",
        tone === "warning"
          ? "border-warning/25 bg-warning/[0.06] text-fg/90"
          : "border-line bg-raised/60 text-muted",
        className,
      )}
    >
      <Icon
        className={cx("mt-0.5 size-3.5 shrink-0", tone === "warning" ? "text-warning" : "text-subtle")}
        aria-hidden="true"
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon, title, children, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-xl border border-line bg-raised text-muted">
        {icon}
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {children && <div className="mt-1.5 max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "accent" | "success";
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none",
        tone === "neutral" && "border-line-strong bg-raised text-muted",
        tone === "accent" && "border-accent/30 bg-accent-soft text-accent",
        tone === "success" && "border-success/30 bg-success/10 text-success",
      )}
    >
      {children}
    </span>
  );
}
