import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Keeps a flat filter object in the URL query string so views are shareable and survive reloads. */
export function useUrlFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => Object.fromEntries(params.entries()), [params]);
  const setFilters = useCallback((next) => {
    const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    setParams(clean, { replace: true });
  }, [setParams]);
  return [filters, setFilters];
}
