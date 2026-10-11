import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryChrome } from '../../tests/fixtures/chrome';
import { parsePageReading, parsePageTimeframe, readActivePage } from './page-context';

afterEach(() => vi.unstubAllGlobals());
const read = (title: string, symbols: string[] = [], intervals: string[] = []) =>
  parsePageReading({ host: 'www.tradingview.com', title, symbols, intervals }, 123);
describe('bounded explicit chart metadata parser', () => {
  it('detects supported spot and forex symbols without equating BTCUSD with BTCUSDT', () => {
    expect(read('BTCUSDT 68000', ['BINANCE:BTCUSDT'], ['60'])).toMatchObject({
      marketId: 'BTCUSDT',
      timeframe: '1h',
    });
    expect(read('EUR / USD chart', [], ['5'])).toMatchObject({
      marketId: 'EURUSD',
      timeframe: '5m',
    });
    expect(read('BTC/USD chart')).toMatchObject({ marketId: null, timeframe: null });
    expect(read('My XRP/USDT chart')).toMatchObject({ marketId: 'XRPUSDT' });
  });
  it('does not infer a unique chart from multiple symbols, unknown intervals, CFD/perpetual/futures hints', () => {
    for (const title of [
      'BTCUSDT and ETHUSDT',
      'BINANCE:BTCUSDT.P',
      'BTCUSDT perpetual',
      'EURUSD CFD',
      'BTCUSDT futures',
      'BTCUSDT_PERP',
    ])
      expect(read(title).marketId).toBeNull();
    expect(read('BTCUSDT', [], ['60', '240']).timeframe).toBeNull();
    expect(read('BTCUSDT', [], ['3m']).timeframe).toBeNull();
  });
  it('respects the monthly case distinction and supported timeframe aliases', () => {
    expect(read('BTCUSDT 4H chart').timeframe).toBe('4h');
    expect(read('BTCUSDT 1M chart').timeframe).toBe('1mo');
    expect(parsePageTimeframe('1M')).toBe('1mo');
    expect(parsePageTimeframe('1m')).toBe('1m');
    expect(parsePageTimeframe('1D')).toBe('1d');
    expect(parsePageTimeframe('12H')).toBe('12h');
    expect(parsePageTimeframe('5min')).toBe('5m');
    for (const value of ['__proto__', 'toString', 'constructor'])
      expect(parsePageTimeframe(value)).toBeNull();
  });
  it('bounds title and refuses non-host strings rather than persisting URL/query credentials', () => {
    const result = parsePageReading({
      host: 'https://example.com/?apikey=secret',
      title: 'x'.repeat(1000),
      symbols: [],
      intervals: [],
    });
    expect(result.host).toBe('');
    expect(result.title).toHaveLength(180);
  });
});
describe('temporary active-tab read', () => {
  it('injects only after an explicit request, on the top frame, and reads only approved metadata selectors', async () => {
    const m = memoryChrome();
    vi.stubGlobal('chrome', m.api);
    expect(m.api.scripting.executeScript).not.toHaveBeenCalled();
    const result = await readActivePage();
    expect(result).toMatchObject({
      marketId: 'BTCUSDT',
      timeframe: '1h',
      host: 'www.tradingview.com',
    });
    const injection = m.api.scripting.executeScript.mock.calls[0][0];
    expect(injection.target).toEqual({ tabId: 2 });
    const source = injection.func!.toString();
    expect(source).toContain('document.title');
    expect(source).toContain('header-toolbar-symbol-search');
    expect(source).not.toMatch(/innerHTML|document\.body|document\.cookie|localStorage|screenshot/);
  });
  it('cannot read restricted browser pages or tabs without permission; gives a manual-confirmation path', async () => {
    const m = memoryChrome();
    vi.stubGlobal('chrome', m.api);
    m.api.tabs.query.mockResolvedValue([{ id: 2, url: 'chrome://settings' } as chrome.tabs.Tab]);
    await expect(readActivePage()).rejects.toThrow(/normal chart/);
    expect(m.api.scripting.executeScript).not.toHaveBeenCalled();
    m.api.tabs.query.mockResolvedValue([{ id: 2, url: 'https://example.com' } as chrome.tabs.Tab]);
    m.api.scripting.executeScript.mockRejectedValue(new Error('not permitted'));
    await expect(readActivePage()).rejects.toThrow(/toolbar icon/);
  });
});
