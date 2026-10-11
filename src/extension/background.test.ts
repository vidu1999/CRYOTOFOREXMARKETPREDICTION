import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { memoryChrome, sender } from '../../tests/fixtures/chrome';
import { FIXTURE_NOW, fixtureResponse } from '../../tests/fixtures/live';
import { DEFAULT_PREFERENCES } from './catalog';
import { STORAGE_KEYS } from './storage';
import type { ExtensionMessage } from './types';

type Worker = typeof import('./background');
let memory: ReturnType<typeof memoryChrome>, worker: Worker;
let network: ReturnType<typeof vi.fn<(url: string) => Promise<Response>>>;
beforeEach(async () => {
  vi.resetModules();
  memory = memoryChrome();
  vi.stubGlobal('chrome', memory.api);
  vi.spyOn(Date, 'now').mockReturnValue(FIXTURE_NOW);
  network = vi.fn(async (url: string) => fixtureResponse(url));
  vi.stubGlobal('fetch', network);
  worker = await import('./background');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('private credentials and public extension protocol', () => {
  it('GET_STATE never returns the locally stored provider key', async () => {
    memory.local[STORAGE_KEYS.forexKey] = 'fixture-only-private-key';
    const reply = await worker.handleMessage({ type: 'GET_STATE' }, sender());
    expect(reply.ok).toBe(true);
    expect(JSON.stringify(reply)).not.toContain('fixture-only-private-key');
    if (reply.ok) expect(reply.state.settings.hasForexKey).toBe(true);
  });
  it('only the same-extension options page can read, save or test keys', async () => {
    memory.local[STORAGE_KEYS.forexKey] = 'fixture-only-private-key';
    const reply = await worker.handleMessage({ type: 'GET_OPTIONS' }, sender('options.html'));
    expect(reply.ok && reply.forexKey).toBe('fixture-only-private-key');
    for (const message of [
      { type: 'GET_OPTIONS' },
      { type: 'SAVE_FOREX_KEY', key: 'new' },
      { type: 'TEST_FOREX_KEY', key: 'new' },
    ] as ExtensionMessage[])
      for (const url of [
        sender().url,
        'https://example.invalid/options.html',
        'chrome-extension://wrong-extension/options.html',
        sender('panel.html').url,
      ])
        await expect(worker.handleMessage(message, { ...sender(), url })).rejects.toThrow(
          /options page/,
        );
    expect(network).not.toHaveBeenCalled();
  });
  it('rejects other extensions, invalid messages and unsupported commands', async () => {
    expect(
      await memory.dispatch({ type: 'GET_STATE' }, { ...sender(), id: 'other-extension' }),
    ).toBeUndefined();
    expect(await memory.dispatch(null)).toMatchObject({
      ok: false,
      error: 'Invalid extension request.',
    });
    expect(await memory.dispatch({ type: 'SEND_ORDER' })).toMatchObject({
      ok: false,
      error: 'Unsupported extension request.',
    });
  });
  it('removes keys locally, without placing them in session snapshots', async () => {
    await worker.handleMessage(
      { type: 'SAVE_FOREX_KEY', key: ' fixture-only-private-key ' },
      sender('options.html'),
    );
    expect(memory.local[STORAGE_KEYS.forexKey]).toBe('fixture-only-private-key');
    expect(JSON.stringify(memory.session)).not.toContain('fixture-only-private-key');
    await worker.handleMessage({ type: 'SAVE_FOREX_KEY', key: '' }, sender('options.html'));
    expect(memory.local[STORAGE_KEYS.forexKey]).toBe('');
  });
  it('validates key sizes before any storage or network operation', async () => {
    await expect(
      worker.handleMessage(
        { type: 'SAVE_FOREX_KEY', key: 'x'.repeat(257) },
        sender('options.html'),
      ),
    ).rejects.toThrow(/256/);
    await expect(
      worker.handleMessage({ type: 'TEST_FOREX_KEY', key: '' }, sender('options.html')),
    ).rejects.toThrow(/provider key/);
    expect(network).not.toHaveBeenCalled();
  });
  it('key-test error replies redact both stored and supplied keys', async () => {
    memory.local[STORAGE_KEYS.forexKey] = 'fixture-stored-secret';
    network.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            status: 'error',
            code: 401,
            message: 'apikey=fixture-supplied-secret echoed fixture-stored-secret',
          }),
        ),
    );
    const reply = await memory.dispatch(
      { type: 'TEST_FOREX_KEY', key: 'fixture-supplied-secret' },
      sender('options.html'),
    );
    expect(reply?.ok).toBe(false);
    expect(JSON.stringify(reply)).not.toContain('fixture-stored-secret');
    expect(JSON.stringify(reply)).not.toContain('fixture-supplied-secret');
  });
  it('tests a key with one provider request without persisting the form key', async () => {
    const reply = await worker.handleMessage(
      { type: 'TEST_FOREX_KEY', key: 'fixture-unsaved-key' },
      sender('options.html'),
    );
    expect(reply.ok).toBe(true);
    expect(network).toHaveBeenCalledTimes(1);
    expect(memory.local[STORAGE_KEYS.forexKey]).toBeUndefined();
  });
});

describe('worker concurrency, caching, and provenance', () => {
  it('coalesces simultaneous popup/side-panel requests even across awaited state reads', async () => {
    const gate = deferred();
    network.mockImplementation(async (url) => {
      await gate.promise;
      return fixtureResponse(url);
    });
    const a = worker.refresh(true),
      b = worker.refresh(true),
      c = worker.refresh(true);
    await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(2));
    gate.resolve();
    const states = await Promise.all([a, b, c]);
    expect(states.every((s) => s.snapshot?.marketId === 'BTCUSDT')).toBe(true);
    expect(network).toHaveBeenCalledTimes(2);
  });
  it('reuses a recently retrieved snapshot and force refresh fetches new data', async () => {
    await worker.refresh();
    await worker.refresh();
    expect(network).toHaveBeenCalledTimes(2);
    await worker.refresh(true);
    expect(network).toHaveBeenCalledTimes(4);
  });
  it('does not publish responses from a previously selected market', async () => {
    const gate = deferred();
    network.mockImplementation(async (url) => {
      await gate.promise;
      return fixtureResponse(url);
    });
    const task = worker.refresh(true);
    await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(2));
    await worker.handleMessage(
      { type: 'UPDATE_PREFERENCES', preferences: { marketId: 'ETHUSDT' } },
      sender(),
    );
    gate.resolve();
    const state = await task;
    expect(state.settings.preferences.marketId).toBe('ETHUSDT');
    expect(state.snapshot).toBeNull();
  });
  it('clearing the cache invalidates in-flight data but not the quota budget', async () => {
    memory.session[STORAGE_KEYS.requestTimes] = [FIXTURE_NOW];
    const gate = deferred();
    network.mockImplementation(async (url) => {
      await gate.promise;
      return fixtureResponse(url);
    });
    const task = worker.refresh(true);
    await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(2));
    await worker.handleMessage({ type: 'CLEAR_CACHE' }, sender());
    gate.resolve();
    expect((await task).snapshot).toBeNull();
    expect(memory.session[STORAGE_KEYS.requestTimes]).toEqual([FIXTURE_NOW]);
  });
  it('changing forex keys invalidates a request started with the previous key', async () => {
    memory.local[STORAGE_KEYS.preferences] = { ...DEFAULT_PREFERENCES, marketId: 'EURUSD' };
    memory.local[STORAGE_KEYS.forexKey] = 'fixture-old-key';
    const gate = deferred();
    network.mockImplementation(async (url) => {
      await gate.promise;
      return fixtureResponse(url);
    });
    const task = worker.refresh(true);
    await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(2));
    await worker.handleMessage(
      { type: 'SAVE_FOREX_KEY', key: 'fixture-new-key' },
      sender('options.html'),
    );
    gate.resolve();
    expect((await task).snapshot).toBeNull();
    await worker.refresh(true);
    expect(
      network.mock.calls
        .slice(-2)
        .every(([url]) => new URL(url).searchParams.get('apikey') === 'fixture-new-key'),
    ).toBe(true);
  });
  it('preserves provider failures across unrelated favorite/pause/fee changes', async () => {
    await worker.refresh();
    network.mockRejectedValue(new Error('offline'));
    const failed = await worker.refresh(true);
    expect(failed.failure?.code).toBe('NETWORK');
    const reply = await worker.handleMessage(
      {
        type: 'UPDATE_PREFERENCES',
        preferences: { autoRefresh: false, cryptoFeeBps: 5, favorites: ['BTCUSDT'] },
      },
      sender(),
    );
    if (!reply.ok) throw new Error(reply.error);
    expect(reply.state.failure?.code).toBe('NETWORK');
    expect(reply.state.snapshot?.backtest.feeBps).toBe(5);
  });
  it('serializes concurrent preference merges instead of losing control changes', async () => {
    await Promise.all([
      worker.handleMessage(
        { type: 'UPDATE_PREFERENCES', preferences: { marketId: 'ETHUSDT' } },
        sender(),
      ),
      worker.handleMessage(
        { type: 'UPDATE_PREFERENCES', preferences: { autoRefresh: false } },
        sender(),
      ),
    ]);
    const reply = await worker.handleMessage({ type: 'GET_STATE' }, sender());
    if (!reply.ok) throw new Error(reply.error);
    expect(reply.state.settings.preferences.marketId).toBe('ETHUSDT');
    expect(reply.state.settings.preferences.autoRefresh).toBe(false);
  });
  it('provider cooldowns cannot be bypassed by forced refresh', async () => {
    network.mockImplementation(
      async () => new Response('', { status: 429, headers: { 'retry-after': '60' } }),
    );
    await worker.refresh(true);
    await worker.refresh(true);
    expect(network).toHaveBeenCalledTimes(2);
  });
  it('forex reservations are serialized across concurrent key tests and refreshes', async () => {
    memory.local[STORAGE_KEYS.preferences] = { ...DEFAULT_PREFERENCES, marketId: 'EURUSD' };
    memory.local[STORAGE_KEYS.forexKey] = 'fixture-only-key';
    await Promise.allSettled([
      worker.refresh(true),
      ...Array.from({ length: 6 }, () =>
        worker.handleMessage(
          { type: 'TEST_FOREX_KEY', key: 'fixture-only-key' },
          sender('options.html'),
        ),
      ),
    ]);
    expect(network.mock.calls.length).toBeLessThanOrEqual(6);
    expect((memory.session[STORAGE_KEYS.requestTimes] as unknown[]).length).toBe(6);
  });
});

describe('opt-in background polling', () => {
  it('does not request data for a stale alarm when background refresh is off', async () => {
    await worker.handleAlarm({
      name: 'vector.live.refresh',
      scheduledTime: FIXTURE_NOW,
      persistAcrossSessions: false,
    });
    expect(network).not.toHaveBeenCalled();
  });
  it('creates one-minute crypto / five-minute forex alarms only with explicit opt-in', async () => {
    await worker.handleMessage(
      { type: 'UPDATE_PREFERENCES', preferences: { backgroundRefresh: true } },
      sender(),
    );
    expect(memory.api.alarms.create).toHaveBeenLastCalledWith('vector.live.refresh', {
      periodInMinutes: 1,
    });
    await worker.handleMessage(
      { type: 'UPDATE_PREFERENCES', preferences: { marketId: 'EURUSD' } },
      sender(),
    );
    expect(memory.api.alarms.create).toHaveBeenLastCalledWith('vector.live.refresh', {
      periodInMinutes: 5,
    });
    memory.api.alarms.create.mockClear();
    await worker.handleMessage(
      { type: 'UPDATE_PREFERENCES', preferences: { backgroundRefresh: false } },
      sender(),
    );
    expect(memory.api.alarms.create).not.toHaveBeenCalled();
  });
  it('refreshes on its own alarm only, without creating synthetic prices', async () => {
    memory.local[STORAGE_KEYS.preferences] = { ...DEFAULT_PREFERENCES, backgroundRefresh: true };
    await worker.handleAlarm({
      name: 'unrelated',
      scheduledTime: FIXTURE_NOW,
      persistAcrossSessions: false,
    });
    expect(network).not.toHaveBeenCalled();
    await worker.handleAlarm({
      name: 'vector.live.refresh',
      scheduledTime: FIXTURE_NOW,
      persistAcrossSessions: false,
    });
    expect(network).toHaveBeenCalledTimes(2);
    expect(memory.session[STORAGE_KEYS.snapshot]).toBeTruthy();
  });
  it('limits local credential storage to trusted extension contexts at install', async () => {
    memory.installed.listeners[0]();
    await vi.waitFor(() =>
      expect(memory.api.storage.local.setAccessLevel).toHaveBeenCalledWith({
        accessLevel: 'TRUSTED_CONTEXTS',
      }),
    );
  });
});

// Native Chrome/Edge runtime APIs are additionally covered by the packaged smoke test.
// These unit tests use in-memory storage and provider fixtures, not real market data.
