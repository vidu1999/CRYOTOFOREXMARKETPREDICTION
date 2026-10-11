import { DEFAULT_PREFERENCES, normalizePreferences } from './catalog';
import type { FeedFailure, LiveSnapshot, Preferences, WorkspaceState } from './types';

export const STORAGE_KEYS = {
  preferences: 'vector.live.preferences',
  forexKey: 'vector.live.forex-key',
  snapshot: 'vector.live.snapshot',
  failure: 'vector.live.failure',
  requestTimes: 'vector.live.forex-requests',
} as const;
export async function getPreferences(): Promise<Preferences> {
  const values = await chrome.storage.local.get(STORAGE_KEYS.preferences);
  return normalizePreferences(values[STORAGE_KEYS.preferences] ?? DEFAULT_PREFERENCES);
}
export async function getForexKey(): Promise<string> {
  const values = await chrome.storage.local.get(STORAGE_KEYS.forexKey);
  const key = values[STORAGE_KEYS.forexKey];
  return typeof key === 'string' ? key : '';
}
export async function getWorkspaceState(): Promise<WorkspaceState> {
  const [preferences, key, session] = await Promise.all([
    getPreferences(),
    getForexKey(),
    chrome.storage.session.get<{
      'vector.live.snapshot'?: LiveSnapshot | null;
      'vector.live.failure'?: FeedFailure | null;
    }>([STORAGE_KEYS.snapshot, STORAGE_KEYS.failure]),
  ]);
  return {
    settings: { preferences, hasForexKey: !!key },
    snapshot: session[STORAGE_KEYS.snapshot] ?? null,
    failure: session[STORAGE_KEYS.failure] ?? null,
  };
}
