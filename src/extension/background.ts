import { backtest } from '../lib/analytics';
import {
  currentCandleOpen,
  liveCandleCloseTime,
  getLiveMarket,
  normalizePreferences,
} from './catalog';
import { FOREX_ORIGIN, parseForexQuote, providerJSON, redactSecret } from './providers';
import { buildLiveSnapshot, feedFailure, reserveRequestWindow } from './service';
import {
  getForexKey,
  getPreferences,
  getPredictions,
  getWorkspaceState,
  STORAGE_KEYS,
} from './storage';
import { readActivePage, safePageHost } from './page-context';
import { evaluatePrediction, LEDGER_LIMIT, makePrediction, predictionKey } from './predictions';
import { fetchOutcomeBars } from './prediction-feed';
import type {
  ExtensionMessage,
  ExtensionReply,
  LiveSnapshot,
  Preferences,
  WorkspaceState,
} from './types';

const ALARM = 'vector.live.refresh';
const PREDICTION_ALARM = 'vector.live.predictions.check';
let ledgerQueue: Promise<void> = Promise.resolve();
let checking: Promise<WorkspaceState> | null = null;
function queueLedger<T>(work: () => Promise<T>): Promise<T> {
  const task = ledgerQueue.catch(() => undefined).then(work);
  ledgerQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}
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
  await updatePredictionAlarm();
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
async function updatePredictionAlarm(): Promise<void> {
  const [preferences, records] = await Promise.all([getPreferences(), getPredictions()]);
  await chrome.alarms.clear(PREDICTION_ALARM);
  if (preferences.predictionAutoCheck && records.some((p) => p.status === 'pending'))
    await chrome.alarms.create(PREDICTION_ALARM, { periodInMinutes: 1 });
}
export function recordPrediction(
  message: Extract<ExtensionMessage, { type: 'RECORD_PREDICTION' }>,
): Promise<ExtensionReply> {
  return queueLedger(async () => {
    if (message.confirmed !== true)
      throw new Error(
        'Confirm the selected market/timeframe and paper-trading assumptions before recording.',
      );
    if (!Number.isFinite(message.notional) || message.notional < 1 || message.notional > 1_000_000)
      throw new Error('Hypothetical notional must be between 1 and 1,000,000.');
    let preferences = await getPreferences();
    if (message.marketId !== preferences.marketId || message.timeframe !== preferences.timeframe)
      throw new Error('The selected market/timeframe changed. Confirm it again.');
    const records = await getPredictions();
    const expiry = liveCandleCloseTime(
      currentCandleOpen(Date.now(), preferences.timeframe),
      preferences.timeframe,
    );
    if (
      records.some(
        (p) => predictionKey(p) === `${preferences.marketId}:${preferences.timeframe}:${expiry}`,
      )
    )
      throw new Error(
        'One prediction per market/timeframe/expiry is allowed. The existing call cannot be replaced after price moves.',
      );
    if (records.length >= LEDGER_LIMIT)
      throw new Error(
        'The 500-record local ledger is full. Export and clear the entire ledger before starting a new evaluation period.',
      );
    const state = await refresh(true);
    preferences = state.settings.preferences;
    if (state.failure || !state.snapshot)
      throw new Error(state.failure?.message ?? 'Fetch a valid live market snapshot first.');
    if (preferences.marketId !== message.marketId || preferences.timeframe !== message.timeframe)
      throw new Error('The selected market/timeframe changed while fetching. Confirm it again.');
    const prediction = makePrediction(
      state.snapshot,
      preferences,
      message.notional,
      Date.now(),
      safePageHost(message.pageHost),
    );
    if (records.some((p) => predictionKey(p) === predictionKey(prediction)))
      throw new Error('This expiry window already has an immutable recorded prediction.');
    await chrome.storage.local.set({ [STORAGE_KEYS.predictions]: [...records, prediction] });
    await updatePredictionAlarm();
    return { ok: true, state: await getWorkspaceState(), prediction };
  });
}
export function checkPredictions(): Promise<WorkspaceState> {
  if (checking) return checking;
  checking = queueLedger(async () => {
    const records = await getPredictions(),
      now = Date.now(),
      forexKey = await getForexKey();
    const batch = records
      .filter((p) => p.status === 'pending')
      .sort((a, b) => (a.lastCheckedAt ?? 0) - (b.lastCheckedAt ?? 0) || a.createdAt - b.createdAt)
      .slice(0, 3);
    const cache = new Map<string, ReturnType<typeof fetchOutcomeBars>>();
    for (const prediction of batch) {
      let next = prediction;
      try {
        const key = `${prediction.marketId}:${prediction.nextBarAt}:${prediction.expiresAt}`;
        if (!cache.has(key))
          cache.set(
            key,
            fetchOutcomeBars(prediction.marketId, prediction.nextBarAt, prediction.expiresAt, {
              forexKey,
              reserveForex: reserveForexRequests,
            }),
          );
        const bars = await cache.get(key)!;
        next = evaluatePrediction(prediction, bars, now);
        if (next.status === 'pending' && !bars.length)
          next = {
            ...next,
            checkError:
              'Awaiting completed 1-minute history. Missing or delayed data is not counted as a loss.',
          };
      } catch (error) {
        next = {
          ...prediction,
          lastCheckedAt: now,
          checkError: feedFailure(
            error,
            {
              ...(await getPreferences()),
              marketId: prediction.marketId,
              timeframe: prediction.timeframe,
            },
            forexKey,
          ).message,
        };
      }
      const index = records.findIndex((p) => p.id === prediction.id);
      records[index] = next;
    }
    await chrome.storage.local.set({ [STORAGE_KEYS.predictions]: records });
    await updatePredictionAlarm();
    return getWorkspaceState();
  }).finally(() => {
    checking = null;
  });
  return checking;
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
    case 'READ_ACTIVE_PAGE':
      return { ok: true, state: await getWorkspaceState(), pageReading: await readActivePage() };
    case 'RECORD_PREDICTION':
      return recordPrediction(message);
    case 'CHECK_PREDICTIONS':
      return { ok: true, state: await checkPredictions() };
    case 'CLEAR_PREDICTIONS':
      return queueLedger(async () => {
        if (message.confirmed !== true)
          throw new Error(
            'Confirm clearing the entire ledger. Individual losing calls cannot be removed through this tool.',
          );
        await chrome.storage.local.set({ [STORAGE_KEYS.predictions]: [] });
        await updatePredictionAlarm();
        return { ok: true, state: await getWorkspaceState() };
      });
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
  if (alarm.name === PREDICTION_ALARM) {
    if ((await getPreferences()).predictionAutoCheck) await checkPredictions();
    return;
  }
  if (alarm.name !== ALARM) return;
  const preferences = await getPreferences();
  if (preferences.backgroundRefresh) await refresh();
}
chrome.alarms.onAlarm.addListener((alarm) => {
  void handleAlarm(alarm).catch(() => undefined);
});
