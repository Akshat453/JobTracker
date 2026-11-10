import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../api/client.js';

/**
 * Runs `fn` whenever `deps` change and tracks { data, loading, error }.
 * `reload()` re-runs it; `setData` allows optimistic updates.
 */
export function useAsync(fn, deps = [], { keepPrevious = true } = {}) {
  const [state, setState] = useState({ data: undefined, loading: true, error: null });
  const callId = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(() => {
    const id = ++callId.current;
    setState((s) => ({ data: keepPrevious ? s.data : undefined, loading: true, error: null }));
    return Promise.resolve(fnRef.current())
      .then((data) => { if (id === callId.current) setState({ data, loading: false, error: null }); return data; })
      .catch((err) => { if (id === callId.current) setState((s) => ({ ...s, loading: false, error: errorMessage(err) })); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { run(); }, [run]);

  const setData = useCallback((updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })), []);
  return { ...state, reload: run, setData };
}

export function useDebounce(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return v;
}
