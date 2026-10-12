import { useCallback, useEffect, useState } from "react";
import { type ApiError, isAbortError, toApiError } from "../services/api";

type Loader<T> = (signal: AbortSignal) => Promise<T>;

interface Settled<T> {
  loader: Loader<T>;
  token: number;
  data: T | null;
  error: ApiError | null;
}

export interface Resource<T> {
  /** Latest loaded value. Kept on screen while a newer request is running. */
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Load data with a memoised loader. A new loader identity or a call to
 * `reload` starts a new request and aborts the previous one. Pass null to
 * skip loading.
 */
export function useResource<T>(loader: Loader<T> | null): Resource<T> {
  const [token, setToken] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  useEffect(() => {
    if (!loader) return;
    const controller = new AbortController();

    loader(controller.signal).then(
      (data) => setSettled({ loader, token, data, error: null }),
      (error: unknown) => {
        if (isAbortError(error)) return;
        setSettled((previous) => ({
          loader,
          token,
          data: previous?.data ?? null,
          error: toApiError(error),
        }));
      },
    );

    return () => controller.abort();
  }, [loader, token]);

  const reload = useCallback(() => setToken((value) => value + 1), []);
  const isCurrent = settled !== null && settled.loader === loader && settled.token === token;

  return {
    data: settled?.data ?? null,
    error: isCurrent ? settled.error : null,
    loading: loader !== null && !isCurrent,
    reload,
  };
}
