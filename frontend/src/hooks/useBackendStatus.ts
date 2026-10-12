import { useCallback, useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { describeError, isAbortError } from "../services/api";
import { fetchApiInfo } from "../services/ask";

export type BackendStatus =
  | { state: "checking" }
  | { state: "online"; title: string; version: string; latencyMs: number }
  /** No answer within the time limit: busy (for example processing an upload) or hung. */
  | { state: "unresponsive" }
  | { state: "offline"; message: string };

export const STATUS_LABELS: Record<BackendStatus["state"], string> = {
  checking: "Checking backend…",
  online: "Backend online",
  unresponsive: "Backend not responding",
  offline: "Backend unreachable",
};

export const STATUS_HINTS: Record<BackendStatus["state"], string> = {
  checking: "Waiting for the first response from the API.",
  online: "The API is answering. This does not check the vector database or the language model.",
  unresponsive: "No answer in time. The backend may be busy processing an upload, or it may have stopped.",
  offline: "The API did not answer. Check that the FastAPI server is running.",
};

const CHECK_TIMEOUT_MS = 8000;
const CHECK_INTERVAL_MS = 20000;

export interface BackendStatusApi {
  status: BackendStatus;
  recheck: () => Promise<void>;
}

/**
 * Poll the backend through GET /openapi.json. This only shows that FastAPI
 * answers; it says nothing about the vector database or the language model.
 */
export function useBackendStatus(): BackendStatusApi {
  const [status, setStatus] = useState<BackendStatus>({ state: "checking" });
  const inFlight = useRef<AbortController | null>(null);

  const recheck = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, CHECK_TIMEOUT_MS);
    const startedAt = performance.now();

    try {
      const info = await fetchApiInfo(controller.signal);
      setStatus({
        state: "online",
        title: info.title,
        version: info.version,
        latencyMs: Math.round(performance.now() - startedAt),
      });
    } catch (error) {
      if (isAbortError(error)) {
        if (timedOut) setStatus({ state: "unresponsive" });
        return;
      }
      setStatus({ state: "offline", message: describeError(error) });
    } finally {
      window.clearTimeout(timer);
      if (inFlight.current === controller) inFlight.current = null;
    }
  }, []);

  useEffect(() => {
    const checkIfVisible = () => {
      if (document.visibilityState === "visible") void recheck();
    };
    checkIfVisible();
    const interval = window.setInterval(checkIfVisible, CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", checkIfVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", checkIfVisible);
      inFlight.current?.abort();
    };
  }, [recheck]);

  return { status, recheck };
}

/** Status shared by the app shell with the pages it renders. */
export function useShellStatus(): BackendStatusApi {
  return useOutletContext<BackendStatusApi>();
}
