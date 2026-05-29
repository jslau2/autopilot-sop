import { useSyncExternalStore } from 'react';

/**
 * Single source of truth for demo/live mode, backed by localStorage and shared
 * across the app. Any component using useDemoMode() re-renders when the mode
 * changes anywhere (including other tabs).
 */
const KEY = 'sop-demo-mode';
const EVENT = 'sop-demo-mode-change';

function read(): boolean {
  return localStorage.getItem(KEY) !== 'false';
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

export function setDemoMode(v: boolean): void {
  localStorage.setItem(KEY, String(v));
  window.dispatchEvent(new Event(EVENT));
}

export function useDemoMode(): [boolean, (v: boolean) => void] {
  const demo = useSyncExternalStore(subscribe, read, () => true);
  return [demo, setDemoMode];
}
