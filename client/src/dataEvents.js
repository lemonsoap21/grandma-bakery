import { useEffect, useRef } from 'react';

// Lets the chat tell whichever page is open that orders or the menu changed, so it reloads.
const EVENT = 'daniel:data-changed';

export const notifyDataChanged = () => window.dispatchEvent(new Event(EVENT));

export function useDataChanged(callback) {
  const latest = useRef(callback);
  latest.current = callback;
  useEffect(() => {
    const handler = () => latest.current();
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);
}
