import { backtest } from '../lib/analytics';
import { getLiveMarket, normalizePreferences } from './catalog';
import { FOREX_ORIGIN, parseForexQuote, providerJSON, redactSecret } from './providers';
import { buildLiveSnapshot, feedFailure, reserveRequestWindow } from './service';
import { getForexKey, getPreferences, getWorkspaceState, STORAGE_KEYS } from './storage';
import type {
  ExtensionMessage,
  ExtensionReply,
  LiveSnapshot,
  Preferences,
  WorkspaceState,
} from './types';

const ALARM = 'vector.live.refresh';
const pending = new Map<string, Promise<WorkspaceState>>();
let budgetQueue: Promise<void> = Promise.resolve();
let preferencesQueue: Promise<void> = Promise.resolve();
let cacheRevision = 0;
function reserveForexRequests(count: number): Promise<void> {
  const work = budgetQueue
    .catch(() => undefined)
    .then(async () => {
      const [preferences, values] = await Promise.all([
        getPreferences(),
        chrome.storage.session.get(STORAGE_KEYS.requestTimes),
      ]);
      const stored = values[STORAGE_KEYS.requestTimes];
      const timestamps = Array.isArray(stored)
        ? stored.filter((t): t is number => typeof t === 'number' && Number.isFinite(t))
        : [];
      const next = reserveRequestWindow(
        timestamps,
        count,
        preferences.forexRequestsPerMinute,
        Date.now(),
      );
      await chrome.storage.session.set({ [STORAGE_KEYS.requestTimes]: next });
    });
  budgetQueue = work.catch(() => undefined);
  return work;
}
function selectionKey(preferences: Preferences) {
  return `${preferences.marketId}:${preferences.timeframe}`;
}
function repriceBacktest(snapshot: LiveSnapshot, preferences: Preferences): LiveSnapshot {
  const market = getLiveMarket(snapshot.marketId);
  return {
    ...snapshot,
    backtest: backtest(
      snapshot.candles,
      250,
      market.category === 'Crypto' ? preferences.cryptoFeeBps : preferences.forexFeeBps,
      10_000,
      market.quote === 'JPY' ? 'JPY' : 'USD',
    ),
  };
}
async function updateAlarm(): Promise<void> {
  const preferences = await getPreferences();
  await chrome.alarms.clear(ALARM);
  if (preferences.backgroundRefresh)
    await chrome.alarms.create(ALARM, {
      periodInMinutes: getLiveMarket(preferences.marketId).category === 'Crypto' ? 1 : 5,
    });
}
export async function refresh(force = false): Promise<WorkspaceState> {
  const preferences = await getPreferences();
  const key = selectionKey(preferences);
  const revision = cacheRevision;
  const slot = `${key}:${revision}`;
  if (pending.has(slot)) return pending.get(slot)!;
  const state = await getWorkspaceState();
  if (revision !== cacheRevision || selectionKey(state.settings.preferences) !== key)
    return refresh(force);
  // State reads yield: another caller may have acquired this slot meanwhile.
  if (pending.has(slot)) return pending.get(slot)!;
  if (
    state.failure?.marketId === preferences.marketId &&
    state.failure.timeframe === preferences.timeframe &&
    state.failure.code === 'RATE_LIMIT' &&
    state.failure.at + (state.failure.retryAfterSeconds ?? 60) * 1000 > Date.now()
  )
    return state;
  const market = getLiveMarket(preferences.marketId);
  const snapshot = state.snapshot;
  const maxAge = market.category === 'Crypto' ? 12_000 : 45_000;
  if (
    !force &&
    snapshot?.marketId === preferences.marketId &&
    snapshot.timeframe === preferences.timeframe &&
    Date.now() - snapshot.receivedAt < maxAge &&
    !state.failure
  )
    return state;
  const task = (async () => {
    const forexKey = await getForexKey();
    try {
      const data = await buildLiveSnapshot(preferences, {
        forexKey,
        reserveForex: reserveForexRequests,
      });
      const current = await getPreferences();
      // Never publish an old request after the user has switched symbol/timeframe.
      if (selectionKey(current) === key && revision === cacheRevision)
        await chrome.storage.session.set({
          [STORAGE_KEYS.snapshot]: repriceBacktest(data, current),
          [STORAGE_KEYS.failure]: null,
        });
    } catch (error) {
      const current = await getPreferences();
      if (selectionKey(current) === key && revision === cacheRevision)
        await chrome.storage.session.set({
          [STORAGE_KEYS.failure]: feedFailure(error, current, forexKey),
        });
    }
    return getWorkspaceState();
  })().finally(() => pending.delete(slot));
  pending.set(slot, task);
  return task;
}
async function privateOptionsOnly(sender: chrome.runtime.MessageSender): Promise<void> {
  if (!sender.url)
    throw new Error(
      'Private provider settings are available only from the extension options page.',
    );
  const actual = new URL(sender.url),
    expected = new URL(chrome.runtime.getURL('options.html'));
  if (
    sender.id !== chrome.runtime.id ||
    actual.protocol !== expected.protocol ||
    actual.host !== expected.host ||
    actual.pathname !== expected.pathname
  )
    throw new Error(
      'Private provider settings are available only from the extension options page.',
    );
}
export async function handleMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
): Promise<ExtensionReply> {
  if (sender.id !== chrome.runtime.id) throw new Error('Untrusted extension request.');
  if (!message || typeof message !== 'object' || typeof message.type !== 'string')
    throw new Error('Invalid extension request.');
  switch (message.type) {
    case 'GET_STATE':
      return { ok: true, state: await getWorkspaceState() };
    case 'REFRESH':
      return { ok: true, state: await refresh(message.force === true) };
    case 'UPDATE_PREFERENCES': {
      // Serialize read/merge/write so simultaneous popup + panel controls cannot lose changes.
      const work = preferencesQueue
        .catch(() => undefined)
        .then(async () => {
          const before = await getPreferences();
          const preferences = normalizePreferences({
            ...before,
            ...(message.preferences && typeof message.preferences === 'object'
              ? message.preferences
              : {}),
          });
          await chrome.storage.local.set({ [STORAGE_KEYS.preferences]: preferences });
          const changedSelection = selectionKey(before) !== selectionKey(preferences);
          if (changedSelection) cacheRevision++;
          const state = await getWorkspaceState();
          if (
            state.snapshot &&
            state.snapshot.marketId === preferences.marketId &&
            state.snapshot.timeframe === preferences.timeframe &&
            (before.cryptoFeeBps !== preferences.cryptoFeeBps ||
              before.forexFeeBps !== preferences.forexFeeBps)
          )
            await chrome.storage.session.set({
              [STORAGE_KEYS.snapshot]: repriceBacktest(state.snapshot, preferences),
            });
          if (changedSelection) await chrome.storage.session.set({ [STORAGE_KEYS.failure]: null });
          // Unrelated favorites/pause/fee changes must NOT erase a provider failure.
          await updateAlarm();
          return { ok: true, state: await getWorkspaceState() } satisfies ExtensionReply;
        });
      preferencesQueue = work.then(
        () => undefined,
        () => undefined,
      );
      return work;
    }
    case 'GET_OPTIONS': {
      await privateOptionsOnly(sender);
      return { ok: true, state: await getWorkspaceState(), forexKey: await getForexKey() };
    }
    case 'SAVE_FOREX_KEY': {
      await privateOptionsOnly(sender);
      if (typeof message.key !== 'string' || message.key.trim().length > 256)
        throw new Error('Provider key must be a string of at most 256 characters.');
      const key = message.key.trim();
      await chrome.storage.local.set({ [STORAGE_KEYS.forexKey]: key });
      cacheRevision++;
      const state = await getWorkspaceState();
      await chrome.storage.session.set({
        [STORAGE_KEYS.failure]: null,
        ...(state.snapshot && getLiveMarket(state.snapshot.marketId).category === 'Forex'
          ? { [STORAGE_KEYS.snapshot]: null }
          : {}),
      });
      return { ok: true, state: await getWorkspaceState() };
    }
    case 'TEST_FOREX_KEY': {
      await privateOptionsOnly(sender);
      if (typeof message.key !== 'string' || !message.key.trim() || message.key.length > 256)
        throw new Error('Enter a provider key privately in this settings page.');
      await reserveForexRequests(1);
      const key = message.key.trim();
      const url = `${FOREX_ORIGIN}/quote?${new URLSearchParams({ symbol: 'EUR/USD', apikey: key, timezone: 'UTC' })}`;
      const quote = parseForexQuote(await providerJSON(url, fetch, key), 'EUR/USD');
      return {
        ok: true,
        state: await getWorkspaceState(),
        testMessage: `Provider responded with a valid EUR/USD quote dated ${new Date(quote.asOf).toISOString()}. Your plan may provide delayed data.`,
      };
    }
    case 'CLEAR_CACHE': {
      cacheRevision++;
      await chrome.storage.session.remove([STORAGE_KEYS.snapshot, STORAGE_KEYS.failure]);
      // Do NOT erase the rate-limit budget; clearing data cannot bypass provider quotas.
      return { ok: true, state: await getWorkspaceState() };
    }
    default:
      throw new Error('Unsupported extension request.');
  }
}
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return false;
  void handleMessage(message, sender)
    .then(reply)
    .catch(async (error: unknown) => {
      const key = await getForexKey().catch(() => '');
      const suppliedKey =
        message?.type === 'TEST_FOREX_KEY' && typeof message.key === 'string' ? message.key : '';
      reply({
        ok: false,
        error: redactSecret(
          redactSecret(error instanceof Error ? error.message : 'Extension operation failed.', key),
          suppliedKey,
        ),
      } satisfies ExtensionReply);
    });
  return true;
});
chrome.runtime.onInstalled.addListener(() => {
  void (async () => {
    await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    await chrome.storage.local.set({ [STORAGE_KEYS.preferences]: await getPreferences() });
    await updateAlarm();
  })();
});
chrome.runtime.onStartup.addListener(() => {
  void updateAlarm();
});
export async function handleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
  if (alarm.name !== ALARM) return;
  const preferences = await getPreferences();
  if (preferences.backgroundRefresh) await refresh();
}
chrome.alarms.onAlarm.addListener((alarm) => {
  void handleAlarm(alarm).catch(() => undefined);
});
