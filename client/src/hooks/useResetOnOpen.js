import { useLayoutEffect, useRef } from 'react';

/**
 * Calls `init()` once each time `open` flips from false to true.
 * Prevents form values from being wiped by re-renders while a modal is open.
 */
export function useResetOnOpen(open, init) {
  const wasOpen = useRef(false);
  const initRef = useRef(init);
  initRef.current = init;
  // Layout effect: runs before paint, so the user can never type into a field that is about to be reset.
  useLayoutEffect(() => {
    if (open && !wasOpen.current) initRef.current();
    wasOpen.current = open;
  }, [open]);
}
