import { DEFAULT_PREFERENCES, normalizePreferences } from './catalog';
import { buildLiveSnapshot, feedFailure } from './service';
import { STORAGE_KEYS } from './storage';
import type { ExtensionMessage, ExtensionReply, Preferences, WorkspaceState } from './types';

export function installedExtension(): boolean {
  return (
    typeof chrome !== 'undefined' &&
    typeof location !== 'undefined' &&
    location.protocol === 'chrome-extension:' &&
    location.hostname === chrome.runtime?.id &&
    !!chrome.storage?.local
  );
}
let browserState: WorkspaceState = {
  settings: { preferences: DEFAULT_PREFERENCES, hasForexKey: false },
  snapshot: null,
  failure: null,
};
const listeners = new Set<() => void>();
let browserRevision = 0;
const browserPending = new Map<string, Promise<ExtensionReply>>();
function emit() {
  for (const listener of listeners) listener();
}
export async function extensionRequest(message: ExtensionMessage): Promise<ExtensionReply> {
  if (installedExtension()) {
    try {
      return (await chrome.runtime.sendMessage(message)) as ExtensionReply;
    } catch {
      return {
        ok: false,
        error:
          'The extension worker is unavailable. Reload the extension from chrome://extensions or edge://extensions.',
      };
    }
  }
  // Optional browser preview supports PUBLIC crypto only. Never accepts/stores a forex key.
  switch (message.type) {
    case 'GET_STATE':
    case 'GET_OPTIONS':
      return { ok: true, state: browserState };
    case 'UPDATE_PREFERENCES':
      browserRevision++;
      browserState = {
        ...browserState,
        settings: {
          ...browserState.settings,
          preferences: normalizePreferences({
            ...browserState.settings.preferences,
            ...message.preferences,
          }),
        },
      };
      emit();
      return { ok: true, state: browserState };
    case 'CLEAR_CACHE':
      browserRevision++;
      browserState = { ...browserState, snapshot: null, failure: null };
      emit();
      return { ok: true, state: browserState };
    case 'REFRESH': {
      const preferences = { ...browserState.settings.preferences },
        revision = browserRevision;
      const slot = `${preferences.marketId}:${preferences.timeframe}:${revision}`;
      if (browserPending.has(slot)) return browserPending.get(slot)!;
      const task = (async (): Promise<ExtensionReply> => {
        try {
          const snapshot = await buildLiveSnapshot(preferences);
          if (browserRevision === revision)
            browserState = { ...browserState, snapshot, failure: null };
        } catch (error) {
          if (browserRevision === revision)
            browserState = { ...browserState, failure: feedFailure(error, preferences) };
        }
        emit();
        return { ok: true, state: browserState };
      })().finally(() => browserPending.delete(slot));
      browserPending.set(slot, task);
      return task;
    }
    case 'SAVE_FOREX_KEY':
    case 'TEST_FOREX_KEY':
      return {
        ok: false,
        error:
          'For privacy, forex credentials can only be entered in the installed extension, never in the website preview.',
      };
  }
}
export function subscribeWorkspace(listener: () => void): () => void {
  if (!installedExtension()) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
  const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (
      (area === 'local' && STORAGE_KEYS.preferences in changes) ||
      (area === 'session' && (STORAGE_KEYS.snapshot in changes || STORAGE_KEYS.failure in changes))
    )
      listener();
  };
  chrome.storage.onChanged.addListener(onChange);
  return () => chrome.storage.onChanged.removeListener(onChange);
}
export async function openExtensionSettings(): Promise<void> {
  if (installedExtension()) await chrome.runtime.openOptionsPage();
  else window.location.href = '/options.html';
}
export async function openExtensionPanel(windowId: number | null): Promise<void> {
  if (installedExtension()) {
    if (chrome.sidePanel?.open && windowId !== null) {
      try {
        await chrome.sidePanel.open({ windowId });
        if (document.body.dataset.surface === 'popup') window.close();
        return;
      } catch {
        /* Edge/older Chromium can fall back to a full extension tab. */
      }
    }
    await chrome.tabs.create({ url: chrome.runtime.getURL('panel.html') });
  } else window.open('/panel.html', '_blank', 'noopener,noreferrer');
}
export async function updatePreferences(
  preferences: Partial<Preferences>,
): Promise<ExtensionReply> {
  return extensionRequest({ type: 'UPDATE_PREFERENCES', preferences });
}
