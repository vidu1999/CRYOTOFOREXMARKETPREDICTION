import { vi } from 'vitest';
import type { ExtensionMessage, ExtensionReply } from '../../src/extension/types';
import { DEFAULT_PREFERENCES } from '../../src/extension/catalog';
import { STORAGE_KEYS } from '../../src/extension/storage';

export const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
export function sender(page = 'popup.html'): chrome.runtime.MessageSender {
  return { id: EXTENSION_ID, url: `chrome-extension://${EXTENSION_ID}/${page}` };
}
function event<T>() {
  const listeners: T[] = [];
  return {
    listeners,
    addListener: vi.fn((listener: T) => {
      listeners.push(listener);
    }),
    removeListener: vi.fn((listener: T) => {
      const i = listeners.indexOf(listener);
      if (i >= 0) listeners.splice(i, 1);
    }),
  };
}
export function memoryChrome() {
  const local: Record<string, unknown> = {
      [STORAGE_KEYS.preferences]: structuredClone(DEFAULT_PREFERENCES),
    },
    session: Record<string, unknown> = {};
  const changes =
    event<(changes: Record<string, chrome.storage.StorageChange>, area: string) => void>();
  const area = (values: Record<string, unknown>, name: string) => ({
    get: vi.fn(async (keys: string | string[] | null = null) =>
      Object.fromEntries(
        (keys === null ? Object.keys(values) : typeof keys === 'string' ? [keys] : keys)
          .filter((key) => key in values)
          .map((key) => [key, structuredClone(values[key])]),
      ),
    ),
    set: vi.fn(async (items: Record<string, unknown>) => {
      const updates: Record<string, chrome.storage.StorageChange> = {};
      for (const [key, value] of Object.entries(items)) {
        updates[key] = { oldValue: values[key], newValue: value };
        values[key] = structuredClone(value);
      }
      for (const listener of changes.listeners) listener(updates, name);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of typeof keys === 'string' ? [keys] : keys) delete values[key];
    }),
    setAccessLevel: vi.fn(async () => undefined),
  });
  const messages =
    event<
      (
        message: unknown,
        sender: chrome.runtime.MessageSender,
        reply: (reply: ExtensionReply) => void,
      ) => unknown
    >();
  const installed = event<() => void>(),
    startup = event<() => void>(),
    alarm = event<(alarm: chrome.alarms.Alarm) => void>();
  const api = {
    storage: { local: area(local, 'local'), session: area(session, 'session'), onChanged: changes },
    runtime: {
      id: EXTENSION_ID,
      getURL: (path: string) => `chrome-extension://${EXTENSION_ID}/${path}`,
      onMessage: messages,
      onInstalled: installed,
      onStartup: startup,
      openOptionsPage: vi.fn(async () => undefined),
      sendMessage: vi.fn(async (_message: ExtensionMessage): Promise<ExtensionReply> => ({
        ok: false,
        error: 'No test worker attached',
      })),
    },
    alarms: {
      clear: vi.fn(async () => true),
      create: vi.fn(async (_name: string, _options: chrome.alarms.AlarmCreateInfo) => undefined),
      onAlarm: alarm,
    },
    sidePanel: { open: vi.fn(async (_options: { windowId: number }) => undefined) },
    tabs: {
      create: vi.fn(async (_options: { url: string }) => ({ id: 1 })),
      query: vi.fn(async (_query: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> => [
        {
          id: 2,
          url: 'https://www.tradingview.com/chart/?symbol=BINANCE%3ABTCUSDT&interval=60',
        } as chrome.tabs.Tab,
      ]),
    },
    scripting: {
      executeScript: vi.fn(
        async (
          _options: chrome.scripting.ScriptInjection<[], unknown>,
        ): Promise<chrome.scripting.InjectionResult[]> => [
          {
            documentId: 'fixture-document',
            frameId: 0,
            result: {
              host: 'www.tradingview.com',
              title: 'BTCUSDT chart',
              symbols: ['BINANCE:BTCUSDT'],
              intervals: ['60'],
            },
          },
        ],
      ),
    },
  };
  const dispatch = (message: unknown, from = sender()): Promise<ExtensionReply | undefined> =>
    new Promise((resolve) => {
      if (!messages.listeners[0] || messages.listeners[0](message, from, resolve) !== true)
        resolve(undefined);
    });
  return { api, local, session, messages, installed, startup, alarm, changes, dispatch };
}
