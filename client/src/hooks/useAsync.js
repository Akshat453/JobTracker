import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../api/client.js';

/**
 * In-memory cache of page data for stale-while-revalidate: revisiting a page shows what was loaded
 * last time immediately, while fresh data loads in the background. Memory only (never written to
 * disk) and cleared on login/logout so one account's data can never appear for another.
 */
const cache = new Map();
export const clearAsyncCache = () => cache.clear();

/**
 * Runs `fn` whenever `deps` change and tracks { data, loading, error }.
 * `reload()` re-runs it; `setData` allows optimistic updates.
 * Pass `cacheKey` (unique per page + parameters) to show cached data instantly on revisits.
 * `loading` stays true while refreshing, so pages that render skeletons only when there's no data
 * (`loading && !data`) show the cached data instead of a spinner.
 */
export function useAsync(fn, deps = [], { keepPrevious = true, cacheKey } = {}) {
  const [state, setState] = useState(() => ({ data: cacheKey ? cache.get(cacheKey) : undefined, loading: true, error: null }));
  const callId = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const keyRef = useRef(cacheKey);
  keyRef.current = cacheKey;

  const run = useCallback(() => {
    const id = ++callId.current;
    const key = keyRef.current;
    setState((s) => ({ data: key && cache.has(key) ? cache.get(key) : keepPrevious ? s.data : undefined, loading: true, error: null }));
    return Promise.resolve(fnRef.current())
      .then((data) => {
        if (key) cache.set(key, data);
        if (id === callId.current) setState({ data, loading: false, error: null });
        return data;
      })
      .catch((err) => { if (id === callId.current) setState((s) => ({ ...s, loading: false, error: errorMessage(err) })); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { run(); }, [run]);

  const setData = useCallback((updater) => setState((s) => {
    const data = typeof updater === 'function' ? updater(s.data) : updater;
    if (keyRef.current) cache.set(keyRef.current, data); // keep optimistic edits when navigating back
    return { ...s, data };
  }), []);
  return { ...state, reload: run, setData };
}

export function useDebounce(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return v;
}
