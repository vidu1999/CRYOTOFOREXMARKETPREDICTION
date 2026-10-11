import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryChrome, sender } from '../../tests/fixtures/chrome';
import { FIXTURE_NOW, fixtureResponse } from '../../tests/fixtures/live';
import { paperRecord } from '../../tests/fixtures/predictions';
import { DEFAULT_PREFERENCES } from './catalog';
import { MINUTE, predictionStats } from './predictions';
import { STORAGE_KEYS } from './storage';
import type { ExtensionMessage } from './types';
let memory: ReturnType<typeof memoryChrome>, worker: typeof import('./background');
let network: ReturnType<typeof vi.fn<(url: string) => Promise<Response>>>;
const request: Extract<ExtensionMessage, { type: 'RECORD_PREDICTION' }> = {
  type: 'RECORD_PREDICTION',
  marketId: 'BTCUSDT',
  timeframe: '1h',
  notional: 1000,
  confirmed: true,
  pageHost: 'www.tradingview.com',
};
beforeEach(async () => {
  vi.resetModules();
  memory = memoryChrome();
  vi.stubGlobal('chrome', memory.api);
  vi.spyOn(Date, 'now').mockReturnValue(FIXTURE_NOW);
  network = vi.fn(async (url: string) => fixtureResponse(url, Date.now()));
  vi.stubGlobal('fetch', network);
  worker = await import('./background');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const targetResponse = (url: string, entry = 100, target = 102.4) => {
  const time = Number(new URL(url).searchParams.get('startTime'));
  return new Response(
    JSON.stringify([
      [
        time,
        String(entry),
        String(target + 0.1),
        String(entry - 0.1),
        String(entry),
        '0',
        time + MINUTE - 1,
      ],
    ]),
  );
};
describe('user-confirmed native forward recording', () => {
  it('records the provider model with immutable prices and provenance before future results exist', async () => {
    const reply = await worker.handleMessage(request, sender());
    expect(reply.ok).toBe(true);
    if (!reply.ok) throw new Error(reply.error);
    expect(reply.prediction).toMatchObject({
      action: 'BUY',
      status: 'pending',
      pageHost: 'www.tradingview.com',
      feeBps: 10,
    });
    expect(reply.state.predictions).toHaveLength(1);
    expect(network).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(memory.local)).not.toContain('BTCUSDT chart');
    expect(memory.session[STORAGE_KEYS.predictions]).toBeUndefined();
  });
  it('requires confirmation, valid notional and the exact currently selected market/timeframe before network use', async () => {
    for (const patch of [
      { confirmed: false },
      { marketId: 'BTCUSD' },
      { timeframe: '4h' },
      { notional: 0 },
      { notional: Infinity },
    ])
      await expect(
        worker.handleMessage({ ...request, ...patch } as typeof request, sender()),
      ).rejects.toThrow();
    expect(network).not.toHaveBeenCalled();
  });
  it('serializes simultaneous record requests, never replaces a forecast or inflates duplicates', async () => {
    const results = await Promise.allSettled([
      worker.handleMessage(request, sender()),
      worker.handleMessage(request, sender()),
    ]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
    expect(network).toHaveBeenCalledTimes(2);
    expect(memory.local[STORAGE_KEYS.predictions]).toHaveLength(1);
  });
  it('preserves ledger through worker restart, cost/selection changes and clearing price cache', async () => {
    await worker.handleMessage(request, sender());
    const original = structuredClone(memory.local[STORAGE_KEYS.predictions]);
    await worker.handleMessage(
      { type: 'UPDATE_PREFERENCES', preferences: { marketId: 'ETHUSDT', cryptoFeeBps: 50 } },
      sender(),
    );
    await worker.handleMessage({ type: 'CLEAR_CACHE' }, sender());
    expect(memory.local[STORAGE_KEYS.predictions]).toEqual(original);
    vi.resetModules();
    worker = await import('./background');
    const reply = await worker.handleMessage({ type: 'GET_STATE' }, sender());
    expect(reply.ok && reply.state.predictions).toEqual(original);
  });
  it('does not record a failure as a new signal or attach a mismatched selection during a slow feed', async () => {
    network.mockRejectedValueOnce(new Error('offline'));
    await expect(worker.handleMessage(request, sender())).rejects.toThrow();
    expect(memory.local[STORAGE_KEYS.predictions]).toBeUndefined();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    network.mockImplementation(async (url) => {
      await gate;
      return fixtureResponse(url);
    });
    const task = worker.handleMessage(request, sender());
    await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(4));
    await worker.handleMessage(
      { type: 'UPDATE_PREFERENCES', preferences: { marketId: 'ETHUSDT' } },
      sender(),
    );
    release();
    await expect(task).rejects.toThrow();
    expect(memory.local[STORAGE_KEYS.predictions]).toBeUndefined();
  });
  it('refuses a new call at the ledger limit without dropping old or pending calls', async () => {
    const records = Array.from({ length: 500 }, (_, i) => {
      const shift = (i + 1) * 60 * MINUTE;
      return paperRecord({
        id: String(i),
        createdAt: FIXTURE_NOW - shift,
        entryAsOf: FIXTURE_NOW - shift,
        basisClosedAt: FIXTURE_NOW - 30 * MINUTE - shift,
        nextBarAt: FIXTURE_NOW - shift,
        expiresAt: FIXTURE_NOW + 30 * MINUTE - shift,
      });
    });
    memory.local[STORAGE_KEYS.predictions] = records;
    await expect(worker.handleMessage(request, sender())).rejects.toThrow(/ledger is full/);
    expect(memory.local[STORAGE_KEYS.predictions]).toEqual(records);
    expect(network).not.toHaveBeenCalled();
  });
  it('reads page metadata only on READ_ACTIVE_PAGE and never sends it to a provider', async () => {
    await worker.handleMessage({ type: 'GET_STATE' }, sender());
    expect(memory.api.scripting.executeScript).not.toHaveBeenCalled();
    const reply = await worker.handleMessage({ type: 'READ_ACTIVE_PAGE' }, sender());
    expect(reply.ok && reply.pageReading).toMatchObject({ marketId: 'BTCUSDT', timeframe: '1h' });
    expect(network).not.toHaveBeenCalled();
  });
});
describe('persistent outcome coordinator, quotas and clearing', () => {
  it('checks later minute history, calculates paper P&L and does not reuse the old backtest score', async () => {
    const reply = await worker.handleMessage(request, sender());
    if (!reply.ok || !reply.prediction) throw new Error('fixture recording failed');
    const original = reply.prediction;
    vi.mocked(Date.now).mockReturnValue(FIXTURE_NOW + MINUTE);
    network.mockImplementation(async (url) =>
      targetResponse(url, original.entry, original.target!),
    );
    const state = await worker.checkPredictions(),
      p = state.predictions![0];
    expect(p.status).toBe('win');
    expect(p.outcome?.netPnl).toBeGreaterThan(0);
    expect(p.entry).toBe(original.entry);
    expect(p.stop).toBe(original.stop);
    expect(p.target).toBe(original.target);
    expect(network).toHaveBeenCalledTimes(3);
    expect(new URL(network.mock.calls[2][0]).searchParams.get('interval')).toBe('1m');
    expect(state.snapshot?.backtest).toEqual(reply.state.snapshot?.backtest);
  });
  it('coalesces simultaneous manual/alarm checks and preserves settled outcomes on later checks', async () => {
    memory.local[STORAGE_KEYS.predictions] = [paperRecord()];
    vi.mocked(Date.now).mockReturnValue(FIXTURE_NOW + MINUTE);
    network.mockImplementation(async (url) => targetResponse(url));
    await Promise.all([
      worker.checkPredictions(),
      worker.checkPredictions(),
      worker.checkPredictions(),
    ]);
    expect(network).toHaveBeenCalledTimes(1);
    const original = structuredClone(memory.local[STORAGE_KEYS.predictions]);
    await worker.checkPredictions();
    expect(network).toHaveBeenCalledTimes(1);
    expect(memory.local[STORAGE_KEYS.predictions]).toEqual(original);
  });
  it('keeps network failures pending and redacts forex keys from persisted/public errors', async () => {
    memory.local[STORAGE_KEYS.forexKey] = 'fixture-secret';
    memory.local[STORAGE_KEYS.predictions] = [
      paperRecord({
        marketId: 'EURUSD',
        provider: 'Twelve Data',
        entry: 1.1,
        stop: 1.0988,
        target: 1.1024,
        accountCurrency: 'USD',
        feeBps: 1,
      }),
    ];
    vi.mocked(Date.now).mockReturnValue(FIXTURE_NOW + MINUTE);
    network.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            status: 'error',
            code: 401,
            message: 'apikey=fixture-secret echoed fixture-secret',
          }),
        ),
    );
    const state = await worker.checkPredictions();
    expect(state.predictions?.[0].status).toBe('pending');
    expect(state.predictions?.[0].checkError).toContain('[redacted]');
    expect(JSON.stringify(state)).not.toContain('fixture-secret');
    expect(predictionStats(state.predictions!).losses).toBe(0);
  });
  it('shares forex budget with refresh/tests and never bypasses it through checks', async () => {
    memory.local[STORAGE_KEYS.forexKey] = 'fixture-secret';
    memory.local[STORAGE_KEYS.predictions] = [
      paperRecord({
        marketId: 'EURUSD',
        provider: 'Twelve Data',
        entry: 1.1,
        stop: 1.0988,
        target: 1.1024,
        accountCurrency: 'USD',
      }),
    ];
    vi.mocked(Date.now).mockReturnValue(FIXTURE_NOW + MINUTE);
    memory.session[STORAGE_KEYS.requestTimes] = Array(6).fill(Date.now());
    const state = await worker.checkPredictions();
    expect(network).not.toHaveBeenCalled();
    expect(state.predictions?.[0]).toMatchObject({
      status: 'pending',
      checkError: expect.stringContaining('budget'),
    });
  });
  it('limits each check to three pending calls and does not delete unresolved records to make room', async () => {
    memory.local[STORAGE_KEYS.predictions] = Array.from({ length: 5 }, (_, i) =>
      paperRecord({
        id: String(i),
        marketId: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'][i],
      }),
    );
    vi.mocked(Date.now).mockReturnValue(FIXTURE_NOW + MINUTE);
    network.mockRejectedValue(new Error('offline'));
    const state = await worker.checkPredictions();
    expect(network).toHaveBeenCalledTimes(3);
    expect(state.predictions).toHaveLength(5);
    expect(state.predictions!.filter((p) => p.lastCheckedAt !== null)).toHaveLength(3);
  });
  it('keeps outcome alarms off without opt-in and stops after the last pending call settles', async () => {
    memory.local[STORAGE_KEYS.predictions] = [paperRecord()];
    vi.mocked(Date.now).mockReturnValue(FIXTURE_NOW + MINUTE);
    await worker.handleAlarm({
      name: 'vector.live.predictions.check',
      scheduledTime: Date.now(),
      persistAcrossSessions: false,
    });
    expect(network).not.toHaveBeenCalled();
    await worker.handleMessage(
      { type: 'UPDATE_PREFERENCES', preferences: { predictionAutoCheck: true } },
      sender(),
    );
    expect(memory.api.alarms.create).toHaveBeenCalledWith('vector.live.predictions.check', {
      periodInMinutes: 1,
    });
    network.mockImplementation(async (url) => targetResponse(url));
    memory.api.alarms.create.mockClear();
    await worker.handleAlarm({
      name: 'vector.live.predictions.check',
      scheduledTime: Date.now(),
      persistAcrossSessions: false,
    });
    expect(network).toHaveBeenCalledTimes(1);
    expect(memory.api.alarms.create).not.toHaveBeenCalled();
  });
  it('clears only the whole ledger after explicit confirmation and cannot resurrect an in-flight check', async () => {
    memory.local[STORAGE_KEYS.predictions] = [paperRecord()];
    await expect(
      worker.handleMessage({ type: 'CLEAR_PREDICTIONS', confirmed: false }, sender()),
    ).rejects.toThrow(/Confirm/);
    vi.mocked(Date.now).mockReturnValue(FIXTURE_NOW + MINUTE);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    network.mockImplementation(async (url) => {
      await gate;
      return targetResponse(url);
    });
    const check = worker.checkPredictions();
    await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(1));
    const clear = worker.handleMessage({ type: 'CLEAR_PREDICTIONS', confirmed: true }, sender());
    release();
    await Promise.all([check, clear]);
    expect(memory.local[STORAGE_KEYS.predictions]).toEqual([]);
    expect(memory.local[STORAGE_KEYS.preferences]).toEqual(DEFAULT_PREFERENCES);
  });
});
