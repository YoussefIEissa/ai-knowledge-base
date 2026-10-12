import { type BackendStatus, STATUS_HINTS, STATUS_LABELS } from "../../hooks/useBackendStatus";
import { cx } from "../../utils/format";

export function StatusDot({ state }: { state: BackendStatus["state"] }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "size-2 shrink-0 rounded-full",
        state === "online" && "bg-success shadow-[0_0_0_3px_rgb(74_210_149/0.15)]",
        state === "checking" && "animate-pulse bg-subtle",
        state === "unresponsive" && "bg-warning",
        state === "offline" && "bg-danger",
      )}
    />
  );
}

export function StatusIndicator({ status }: { status: BackendStatus }) {
  return (
    <div
      role="status"
      title={STATUS_HINTS[status.state]}
      className="flex items-center gap-2.5 rounded-lg border border-line bg-canvas/60 px-3 py-2 text-xs"
    >
      <StatusDot state={status.state} />
      <span className="min-w-0 flex-1 truncate text-muted">{STATUS_LABELS[status.state]}</span>
      {status.state === "online" && (
        <span className="font-mono text-[11px] text-subtle">v{status.version}</span>
      )}
    </div>
  );
}
