import { useCallback, useEffect, useRef, useState } from "react";
import { UPLOAD_MAX_BYTES } from "../config";
import { describeError, isAbortError } from "../services/api";
import { uploadPdf } from "../services/documents";
import { createId } from "../services/localStore";
import type { UploadResponse } from "../types/api";
import { formatBytes } from "../utils/format";

export type UploadPhase =
  | "queued"
  /** File bytes are being sent; progress is measured. */
  | "uploading"
  /** The backend is converting and indexing; no progress is available. */
  | "processing"
  | "done"
  | "error"
  | "cancelled";

export interface UploadItem {
  id: string;
  name: string;
  size: number;
  phase: UploadPhase;
  /** Fraction (0–1) of the file sent. Only meaningful while uploading. */
  progress: number;
  result?: UploadResponse;
  error?: string;
}

/** Catch files the backend is certain to reject, using its own rules and wording. */
function rejectReason(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".pdf")) return "Only PDF files are supported.";
  if (file.size > UPLOAD_MAX_BYTES) {
    return `PDF must be 40 MB or smaller. This file is ${formatBytes(file.size)}.`;
  }
  return null;
}

/**
 * Upload PDFs one at a time. The backend processes an upload inside the
 * request and cannot serve other requests meanwhile, so sending files in
 * parallel would gain nothing.
 */
export function useUploadQueue(onUploaded: (result: UploadResponse) => void) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const waiting = useRef<Array<{ id: string; file: File }>>([]);
  const running = useRef(false);
  const current = useRef<{ id: string; controller: AbortController } | null>(null);
  const onUploadedRef = useRef(onUploaded);

  useEffect(() => {
    onUploadedRef.current = onUploaded;
  }, [onUploaded]);

  const patch = useCallback((id: string, changes: Partial<UploadItem>) => {
    setItems((list) => list.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }, []);

  const drain = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      for (let next = waiting.current.shift(); next; next = waiting.current.shift()) {
        const { id, file } = next;
        const controller = new AbortController();
        current.current = { id, controller };
        patch(id, { phase: "uploading", progress: 0 });
        try {
          const result = await uploadPdf(file, {
            signal: controller.signal,
            onProgress: (fraction) => patch(id, { progress: fraction }),
            onSent: () => patch(id, { phase: "processing" }),
          });
          patch(id, { phase: "done", result });
          onUploadedRef.current(result);
        } catch (error) {
          patch(
            id,
            isAbortError(error)
              ? { phase: "cancelled" }
              : { phase: "error", error: describeError(error) },
          );
        } finally {
          current.current = null;
        }
      }
    } finally {
      running.current = false;
    }
  }, [patch]);

  const enqueue = useCallback(
    (files: File[]) => {
      const added: UploadItem[] = files.map((file) => {
        const id = createId();
        const reason = rejectReason(file);
        if (!reason) waiting.current.push({ id, file });
        return {
          id,
          name: file.name,
          size: file.size,
          phase: reason ? "error" : "queued",
          progress: 0,
          error: reason ?? undefined,
        };
      });
      setItems((list) => [...added, ...list]);
      void drain();
    },
    [drain],
  );

  /**
   * Cancel a queued file, or one whose bytes are still being sent. Once the
   * backend is processing a file it cannot be cancelled from here.
   */
  const cancel = useCallback(
    (id: string) => {
      const before = waiting.current.length;
      waiting.current = waiting.current.filter((entry) => entry.id !== id);
      if (waiting.current.length !== before) {
        patch(id, { phase: "cancelled" });
        return;
      }
      if (current.current?.id === id) current.current.controller.abort();
    },
    [patch],
  );

  const dismiss = useCallback((id: string) => {
    setItems((list) => list.filter((item) => item.id !== id));
  }, []);

  const busy = items.some(
    (item) => item.phase === "queued" || item.phase === "uploading" || item.phase === "processing",
  );

  return { items, enqueue, cancel, dismiss, busy };
}
