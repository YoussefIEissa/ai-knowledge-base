import { useCallback, useEffect, useState } from "react";
import { getDocument, listDocuments } from "../services/documents";
import type { DocumentFilters, DocumentRecord } from "../types/api";
import { type Resource, useResource } from "./useResource";

/** Documents from GET /documents, filtered by the backend's own parameters. */
export function useDocuments(
  filters: DocumentFilters = {},
  enabled = true,
): Resource<DocumentRecord[]> {
  const q = filters.q ?? "";
  const category = filters.category ?? "";
  const loader = useCallback(
    (signal: AbortSignal) => listDocuments({ q, category }, signal),
    [q, category],
  );
  return useResource(enabled ? loader : null);
}

/** One document from GET /documents/{id}. */
export function useDocument(id: number | null): Resource<DocumentRecord> {
  const loader = useCallback(
    (signal: AbortSignal) => getDocument(id ?? 0, signal),
    [id],
  );
  return useResource(id === null ? null : loader);
}

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
