import { useSyncExternalStore, useCallback } from 'react';

/**
 * Active planning entity (plant grouping / region) + the editable entity list,
 * shared across the app via localStorage. "All" means no scoping.
 */
const ACTIVE_KEY = 'sop-entity';
const LIST_KEY = 'sop-entities';
const EVENT = 'sop-entity-change';
const DEFAULT_ENTITIES = ['SPL & SBMB Plan', 'China Region Plan', 'Regional Consolidated'];

export const ALL_ENTITIES = 'All';

function emit() { window.dispatchEvent(new Event(EVENT)); }
function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener('storage', cb); };
}
function readActive(): string { return localStorage.getItem(ACTIVE_KEY) || ALL_ENTITIES; }
function readListRaw(): string { return localStorage.getItem(LIST_KEY) || ''; }
function parseList(raw: string): string[] {
  try { const v = raw ? JSON.parse(raw) : null; if (Array.isArray(v) && v.length) return v; } catch { /* ignore */ }
  return DEFAULT_ENTITIES;
}

export function setActiveEntity(e: string) { localStorage.setItem(ACTIVE_KEY, e); emit(); }
export function addEntity(name: string) {
  const n = name.trim();
  if (!n) return;
  const list = parseList(readListRaw());
  if (!list.includes(n)) localStorage.setItem(LIST_KEY, JSON.stringify([...list, n]));
  setActiveEntity(n);
}
/** Read the active entity outside React (for launch payloads). */
export function getActiveEntity(): string { return readActive(); }

export function useEntity() {
  const active = useSyncExternalStore(subscribe, readActive, () => ALL_ENTITIES);
  const listRaw = useSyncExternalStore(subscribe, readListRaw, () => '');
  const entities = parseList(listRaw);
  const setActive = useCallback((e: string) => setActiveEntity(e), []);
  const add = useCallback((n: string) => addEntity(n), []);
  return { active, entities, setActive, addEntity: add };
}
