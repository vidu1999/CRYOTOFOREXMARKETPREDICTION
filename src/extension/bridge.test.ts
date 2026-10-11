import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryChrome } from '../../tests/fixtures/chrome';
import { fixtureResponse } from '../../tests/fixtures/live';
import type { ExtensionReply } from './types';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.resetModules();
});

describe('public website preview privacy', () => {
  it('cannot read, save, test or persist a private forex credential', async () => {
    const network = vi.fn(async (url: string) => fixtureResponse(url));
    vi.stubGlobal('fetch', network);
    const bridge = await import('./bridge');
    expect(bridge.installedExtension()).toBe(false);
    for (const type of ['SAVE_FOREX_KEY', 'TEST_FOREX_KEY'] as const)
      expect((await bridge.extensionRequest({ type, key: 'fixture-private-value' })).ok).toBe(
        false,
      );
    const reply = await bridge.extensionRequest({ type: 'GET_OPTIONS' });
    expect(JSON.stringify(reply)).not.toContain('fixture-private-value');
    expect(network).not.toHaveBeenCalled();
  });
  it('does not treat injected Chrome-like APIs on a website as private extension context', async () => {
    const memory = memoryChrome();
    vi.stubGlobal('chrome', memory.api);
    vi.stubGlobal('location', { protocol: 'https:', hostname: 'example.invalid' });
    const bridge = await import('./bridge');
    expect(bridge.installedExtension()).toBe(false);
    expect(
      (await bridge.extensionRequest({ type: 'SAVE_FOREX_KEY', key: 'fixture-private-value' })).ok,
    ).toBe(false);
    expect(memory.api.runtime.sendMessage).not.toHaveBeenCalled();
  });
  it('forex selection requires private installed-extension setup with no fallback price', async () => {
    const bridge = await import('./bridge');
    await bridge.updatePreferences({ marketId: 'EURUSD' });
    const reply = await bridge.extensionRequest({ type: 'REFRESH' });
    if (!reply.ok) throw new Error(reply.error);
    expect(reply.state.failure?.code).toBe('SETUP_REQUIRED');
    expect(reply.state.snapshot).toBeNull();
  });
  it('coalesces concurrent public preview requests without duplicate provider traffic', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const network = vi.fn(async (url: string) => {
      await gate;
      return fixtureResponse(url);
    });
    vi.stubGlobal('fetch', network);
    const bridge = await import('./bridge');
    const a = bridge.extensionRequest({ type: 'REFRESH' }),
      b = bridge.extensionRequest({ type: 'REFRESH' });
    await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(2));
    release();
    await Promise.all([a, b]);
    expect(network).toHaveBeenCalledTimes(2);
  });
  it('emits preference changes and allows unsubscription', async () => {
    const bridge = await import('./bridge'),
      notify = vi.fn(),
      stop = bridge.subscribeWorkspace(notify);
    await bridge.updatePreferences({ timeframe: '4h' });
    expect(notify).toHaveBeenCalledTimes(1);
    stop();
    await bridge.updatePreferences({ timeframe: '1h' });
    expect(notify).toHaveBeenCalledTimes(1);
  });
});

describe('installed browser API bridge', () => {
  it('sends messages to the private worker and handles worker unavailability', async () => {
    const memory = memoryChrome();
    vi.stubGlobal('chrome', memory.api);
    vi.stubGlobal('location', { protocol: 'chrome-extension:', hostname: memory.api.runtime.id });
    const bridge = await import('./bridge');
    expect(bridge.installedExtension()).toBe(true);
    const response: ExtensionReply = { ok: false, error: 'fixture error' };
    memory.api.runtime.sendMessage.mockResolvedValue(response);
    expect(await bridge.extensionRequest({ type: 'GET_STATE' })).toEqual(response);
    memory.api.runtime.sendMessage.mockRejectedValue(new Error('worker unavailable'));
    expect(await bridge.extensionRequest({ type: 'GET_STATE' })).toMatchObject({
      ok: false,
      error: expect.stringContaining('Reload the extension'),
    });
  });
  it('opens private options and the native panel without broad tab permissions', async () => {
    const memory = memoryChrome();
    vi.stubGlobal('chrome', memory.api);
    vi.stubGlobal('location', { protocol: 'chrome-extension:', hostname: memory.api.runtime.id });
    vi.stubGlobal('document', { body: { dataset: { surface: 'panel' } } });
    const bridge = await import('./bridge');
    await bridge.openExtensionSettings();
    expect(memory.api.runtime.openOptionsPage).toHaveBeenCalled();
    await bridge.openExtensionPanel(7);
    expect(memory.api.sidePanel.open).toHaveBeenCalledWith({ windowId: 7 });
    expect(memory.api.tabs.create).not.toHaveBeenCalled();
  });
  it('falls back to an extension tab if a browser rejects the native side panel', async () => {
    const memory = memoryChrome();
    vi.stubGlobal('chrome', memory.api);
    vi.stubGlobal('location', { protocol: 'chrome-extension:', hostname: memory.api.runtime.id });
    memory.api.sidePanel.open.mockRejectedValue(new Error('unsupported'));
    const bridge = await import('./bridge');
    await bridge.openExtensionPanel(7);
    expect(memory.api.tabs.create).toHaveBeenCalledWith({
      url: memory.api.runtime.getURL('panel.html'),
    });
  });
});

describe('temporary public-preview forward ledger', () => {
  it('refuses page access in the public website preview', async () => {
    const bridge = await import('./bridge');
    const reply = await bridge.extensionRequest({ type: 'READ_ACTIVE_PAGE' });
    expect(reply).toMatchObject({
      ok: false,
      error: expect.stringContaining('installed extension'),
    });
  });
  it('serializes records and whole-ledger clears, leaves records through price-cache clears, and excludes credentials', async () => {
    const { FIXTURE_NOW } = await import('../../tests/fixtures/live');
    vi.spyOn(Date, 'now').mockReturnValue(FIXTURE_NOW);
    const network = vi.fn(async (url: string) => fixtureResponse(url));
    vi.stubGlobal('fetch', network);
    const bridge = await import('./bridge'),
      request = {
        type: 'RECORD_PREDICTION',
        marketId: 'BTCUSDT',
        timeframe: '1h',
        notional: 1000,
        confirmed: true,
      } as const;
    const result = await Promise.all([
      bridge.extensionRequest(request),
      bridge.extensionRequest(request),
    ]);
    expect(result.filter((r) => r.ok)).toHaveLength(1);
    const state = await bridge.extensionRequest({ type: 'CLEAR_CACHE' });
    expect(state.ok && state.state.predictions).toHaveLength(1);
    expect(JSON.stringify(state)).not.toMatch(/"forexKey"|apikey/i);
    const denied = await bridge.extensionRequest({ type: 'CLEAR_PREDICTIONS', confirmed: false });
    expect(denied.ok).toBe(false);
    const cleared = await bridge.extensionRequest({ type: 'CLEAR_PREDICTIONS', confirmed: true });
    expect(cleared.ok && cleared.state.predictions).toEqual([]);
  });
});
