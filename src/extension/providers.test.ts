import { describe, expect, it, vi } from 'vitest';
import {
  cryptoBars,
  cryptoTicker,
  FIXTURE_NOW,
  forexBars,
  forexQuote,
  fixtureResponse,
} from '../../tests/fixtures/live';
import {
  aggregateTwelveHours,
  DEFAULT_PREFERENCES,
  getLiveMarket,
  LIVE_TIMEFRAMES,
  liveCandleCloseTime,
  normalizePreferences,
} from './catalog';
import {
  BINANCE_ORIGIN,
  FeedError,
  fetchLiveHistory,
  FOREX_ORIGIN,
  parseBinanceCandles,
  parseBinanceTicker,
  parseForexCandles,
  parseForexQuote,
  parseProviderTime,
  providerJSON,
  quoteStatus,
  redactSecret,
} from './providers';
import { buildLiveSnapshot, feedFailure, reserveRequestWindow } from './service';

const crypto = getLiveMarket('BTCUSDT'),
  forex = getLiveMarket('EURUSD');
const fetcher = () => vi.fn(async (url: string) => fixtureResponse(url));

describe('live provider timestamps and validation', () => {
  it('accepts Unix seconds, milliseconds, and UTC ISO dates, not device-local time', () => {
    for (const value of [
      FIXTURE_NOW / 1000,
      String(FIXTURE_NOW / 1000),
      FIXTURE_NOW,
      new Date(FIXTURE_NOW).toISOString(),
      '2026-10-10 12:30:00',
      '2026-10-10T14:30:00+02:00',
    ])
      expect(parseProviderTime(value)).toBe(FIXTURE_NOW);
  });
  it.each([
    null,
    undefined,
    true,
    {},
    [],
    '',
    'yesterday',
    '2026-02-30 12:00:00',
    '2026-13-01',
    '2026-10-10 29:00:00',
    0,
    -1,
    Infinity,
    NaN,
  ])('rejects malformed or missing timestamps: %j', (value) => {
    expect(() => parseProviderTime(value)).toThrow(FeedError);
  });
  it.each([null, '', ' ', true, [], [1], { value: 10 }, 'NaN', 'Infinity', -1, 0])(
    'rejects invalid quote prices without coercing arbitrary JSON: %j',
    (lastPrice) => {
      expect(() => parseBinanceTicker({ ...cryptoTicker(), lastPrice }, 'BTCUSDT')).toThrow(
        FeedError,
      );
    },
  );
  it('rejects a wrong quote symbol', () => {
    expect(() => parseBinanceTicker(cryptoTicker(), 'ETHUSDT')).toThrow(/symbol/);
    expect(() => parseForexQuote(forexQuote(), 'GBP/USD')).toThrow(/symbol/);
  });
  it('retains unavailable forex volume as unused zero and supports nullable change', () => {
    expect(parseForexCandles(forexBars(), '1h', FIXTURE_NOW, 'EUR/USD')[0].volume).toBe(0);
    expect(
      parseForexQuote({ ...forexQuote(), percent_change: null }, 'EUR/USD').changePercent,
    ).toBeNull();
  });
  it('rejects incorrect metadata, duplicate bars and incoherent OHLC', () => {
    const bars = cryptoBars();
    expect(() => parseBinanceCandles([bars[0], bars[0]], FIXTURE_NOW, '1h')).toThrow(/duplicate/);
    expect(() =>
      parseBinanceCandles([[bars[0][0], 100, 90, 101, 102, 0, bars[0][6]]], FIXTURE_NOW, '1h'),
    ).toThrow(/OHLC/);
    expect(() =>
      parseForexCandles(forexBars(FIXTURE_NOW, '4h'), '1h', FIXTURE_NOW, 'EUR/USD'),
    ).toThrow(/timeframe/);
    expect(() => parseForexCandles(forexBars(), '1h', FIXTURE_NOW, 'GBP/USD')).toThrow(/symbol/);
  });
  it('rejects impossible close times and different native intervals', () => {
    const bars = cryptoBars();
    expect(() =>
      parseBinanceCandles(
        [[...bars[0].slice(0, 6), (bars[0][0] as number) - 1]],
        FIXTURE_NOW,
        '1h',
      ),
    ).toThrow(/timestamps/);
    expect(() => parseBinanceCandles(bars, FIXTURE_NOW, '4h')).toThrow(/timeframe/);
  });
});

describe('completed candles and the advertised timeframes', () => {
  it.each(LIVE_TIMEFRAMES.map((tf) => [tf.id]))(
    'excludes the forming crypto candle for %s',
    (timeframe) => {
      const tf = timeframe as typeof DEFAULT_PREFERENCES.timeframe;
      const bars = parseBinanceCandles(cryptoBars(FIXTURE_NOW, tf, 80, true), FIXTURE_NOW, tf);
      expect(bars).toHaveLength(80);
      expect(liveCandleCloseTime(bars.at(-1)!.time, tf)).toBeLessThanOrEqual(FIXTURE_NOW);
    },
  );
  it('excludes forming forex candles and sorts vendor rows chronologically', () => {
    const history = forexBars(FIXTURE_NOW, '1h', 'EUR/USD', 80, true);
    history.values.reverse();
    const bars = parseForexCandles(history, '1h', FIXTURE_NOW, 'EUR/USD');
    expect(bars).toHaveLength(80);
    expect(bars[0].time).toBeLessThan(bars[79].time);
  });
  it('uses calendar-month closes rather than 30-day approximations', () => {
    expect(liveCandleCloseTime(Date.UTC(2024, 1, 1), '1mo')).toBe(Date.UTC(2024, 2, 1));
    expect(liveCandleCloseTime(Date.UTC(2026, 11, 1), '1mo')).toBe(Date.UTC(2027, 0, 1));
  });
  it('12H forex needs exactly three contiguous UTC-aligned completed 4H bars', () => {
    const bars = parseForexCandles(
      forexBars(FIXTURE_NOW, '12h', 'EUR/USD', 6, true),
      '12h',
      FIXTURE_NOW,
      'EUR/USD',
    );
    expect(bars).toHaveLength(2);
    expect(bars[0].time % 43_200_000).toBe(0);
    const source = parseForexCandles(
      forexBars(FIXTURE_NOW, '4h', 'EUR/USD', 6),
      '4h',
      FIXTURE_NOW,
      'EUR/USD',
    );
    expect(aggregateTwelveHours(source)).toHaveLength(2);
    expect(aggregateTwelveHours(source.filter((_, i) => i !== 1))).toHaveLength(1);
    expect(aggregateTwelveHours([...source, source[0]])).toHaveLength(1);
  });
});

describe('real feed protocol, never simulated substitution', () => {
  it('crypto calls only two public data endpoints and sends no credentials', async () => {
    const mock = fetcher();
    const data = await fetchLiveHistory(crypto, '1h', { fetcher: mock, now: () => FIXTURE_NOW });
    expect(data.candles).toHaveLength(80);
    expect(data.quote.asOf).toBe(FIXTURE_NOW);
    expect(mock).toHaveBeenCalledTimes(2);
    for (const [url, init] of mock.mock.calls as unknown as [string, RequestInit][]) {
      expect(new URL(url).origin).toBe(BINANCE_ORIGIN);
      expect(url).not.toContain('apikey');
      expect(init.credentials).toBe('omit');
      expect(init.referrerPolicy).toBe('no-referrer');
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });
  it('missing forex key makes no network request', async () => {
    const mock = fetcher();
    await expect(fetchLiveHistory(forex, '1h', { fetcher: mock })).rejects.toMatchObject({
      code: 'SETUP_REQUIRED',
    });
    expect(mock).not.toHaveBeenCalled();
  });
  it('forex reserves two requests and uses a privately supplied key only at its provider', async () => {
    const mock = fetcher(),
      reserveForex = vi.fn(async () => undefined);
    await fetchLiveHistory(forex, '1h', {
      fetcher: mock,
      forexKey: 'fixture-only-key',
      reserveForex,
      now: () => FIXTURE_NOW,
    });
    expect(reserveForex).toHaveBeenCalledWith(2);
    for (const [url] of mock.mock.calls) {
      expect(new URL(url).origin).toBe(FOREX_ORIGIN);
      expect(new URL(url).searchParams.get('apikey')).toBe('fixture-only-key');
      expect(new URL(url).searchParams.get('timezone')).toBe('UTC');
    }
  });
  it('12H requests 4H source bars instead of an unsupported 12h API interval', async () => {
    const mock = fetcher();
    await fetchLiveHistory(forex, '12h', {
      fetcher: mock,
      forexKey: 'fixture-only-key',
      now: () => FIXTURE_NOW,
    });
    const url = new URL(mock.mock.calls.find(([url]) => url.includes('time_series'))![0]);
    expect(url.searchParams.get('interval')).toBe('4h');
    expect(url.searchParams.get('outputsize')).toBe('1800');
  });
  it('valid data produces derived analysis, costs, sample counts and source close time', async () => {
    const snapshot = await buildLiveSnapshot(DEFAULT_PREFERENCES, {
      fetcher: fetcher(),
      now: () => FIXTURE_NOW,
    });
    expect(snapshot.analysis?.direction).toBe('bullish');
    expect(snapshot.backtest.observations).toBeGreaterThan(0);
    expect(snapshot.backtest.feeBps).toBe(10);
    expect(snapshot.candleCloseAt).toBe(Date.UTC(2026, 9, 10, 12));
    expect(snapshot.quote.price).toBe(108.123);
  });
  it('undersampled real history produces no guessed signal', async () => {
    const mock = vi.fn(async (url: string) =>
      url.includes('klines')
        ? new Response(JSON.stringify(cryptoBars(FIXTURE_NOW, '1h', 20)))
        : fixtureResponse(url),
    );
    const snapshot = await buildLiveSnapshot(DEFAULT_PREFERENCES, {
      fetcher: mock,
      now: () => FIXTURE_NOW,
    });
    expect(snapshot.analysis).toBeNull();
    expect(snapshot.backtest.observations).toBe(0);
  });
  it('network errors are explicit and do not return a fabricated price', async () => {
    await expect(
      fetchLiveHistory(crypto, '1h', {
        fetcher: async () => {
          throw new Error('offline');
        },
      }),
    ).rejects.toMatchObject({ code: 'NETWORK' });
  });
  it('HTTP errors and invalid JSON do not silently become live quotes', async () => {
    await expect(
      providerJSON(BINANCE_ORIGIN, async () => new Response('', { status: 451 })),
    ).rejects.toMatchObject({ code: 'PROVIDER' });
    await expect(
      providerJSON(BINANCE_ORIGIN, async () => new Response('not json')),
    ).rejects.toMatchObject({ code: 'INVALID_DATA' });
  });
  it('HTTP and body rate limits produce actionable cooldowns', async () => {
    await expect(
      providerJSON(
        BINANCE_ORIGIN,
        async () => new Response('', { status: 429, headers: { 'retry-after': '120' } }),
      ),
    ).rejects.toMatchObject({ code: 'RATE_LIMIT', retryAfterSeconds: 120 });
    await expect(
      providerJSON(
        FOREX_ORIGIN,
        async () => new Response(JSON.stringify({ status: 'error', code: 429, message: 'quota' })),
      ),
    ).rejects.toMatchObject({ code: 'RATE_LIMIT' });
  });
  it('redacts raw and URL-encoded keys and query-style API keys from provider errors', async () => {
    const key = 'fixture + secret';
    const message = `apikey=${encodeURIComponent(key)} echoed ${key}`;
    await expect(
      providerJSON(
        FOREX_ORIGIN,
        async () => new Response(JSON.stringify({ status: 'error', code: 401, message })),
        key,
      ),
    ).rejects.toMatchObject({ message: 'apikey=[redacted] echoed [redacted]' });
    expect(
      redactSecret('https://example.invalid/?apikey="random-private-key"&symbol=EUR'),
    ).not.toContain('random-private-key');
    expect(
      feedFailure(new FeedError('PROVIDER', message), DEFAULT_PREFERENCES, key).message,
    ).not.toContain('secret');
  });
  it('rejects future-clock quotes', async () => {
    const mock = vi.fn(async (url: string) =>
      url.includes('ticker')
        ? new Response(JSON.stringify(cryptoTicker(FIXTURE_NOW + 600_000)))
        : fixtureResponse(url),
    );
    await expect(
      fetchLiveHistory(crypto, '1h', { fetcher: mock, now: () => FIXTURE_NOW }),
    ).rejects.toMatchObject({ code: 'CLOCK_SKEW' });
  });
});

describe('freshness and conservative request budgets', () => {
  it('marks fresh, aged, market-closed, and disconnected quotes honestly', async () => {
    const history = await fetchLiveHistory(crypto, '1h', {
      fetcher: fetcher(),
      now: () => FIXTURE_NOW,
    });
    expect(quoteStatus(history, crypto, FIXTURE_NOW + 10_000)).toBe('live');
    expect(quoteStatus(history, crypto, FIXTURE_NOW + 100_000)).toBe('delayed');
    expect(
      quoteStatus(
        { ...history, quote: { ...history.quote, marketOpen: false } },
        forex,
        FIXTURE_NOW,
      ),
    ).toBe('closed');
    expect(quoteStatus(null, crypto)).toBe('disconnected');
    expect(
      quoteStatus(
        { ...history, quote: { ...history.quote, asOf: FIXTURE_NOW + 90_000 } },
        crypto,
        FIXTURE_NOW,
      ),
    ).toBe('delayed');
  });
  it('expires old requests but blocks over-budget calls', () => {
    expect(reserveRequestWindow([FIXTURE_NOW - 61_000], 2, 6, FIXTURE_NOW)).toEqual([
      FIXTURE_NOW,
      FIXTURE_NOW,
    ]);
    expect(() =>
      reserveRequestWindow(Array(5).fill(FIXTURE_NOW - 10_000), 2, 6, FIXTURE_NOW),
    ).toThrow(/50 seconds/);
  });
  it('does not reset quotas on clock rollback and validates malformed reservations', () => {
    expect(() =>
      reserveRequestWindow(Array(6).fill(FIXTURE_NOW + 1000), 1, 6, FIXTURE_NOW),
    ).toThrow(FeedError);
    expect(() => reserveRequestWindow([], NaN, 6, FIXTURE_NOW)).toThrow(FeedError);
    expect(() => reserveRequestWindow([], -2, 6, FIXTURE_NOW)).toThrow(FeedError);
  });
  it('normalizes selections and strips unknown/private fields from public preferences', () => {
    const p = normalizePreferences({
      marketId: 'UNKNOWN',
      timeframe: '1s',
      backgroundRefresh: 'yes',
      cryptoFeeBps: 1000,
      forexRequestsPerMinute: Infinity,
      favorites: ['BTCUSDT', 'BTCUSDT', 'UNKNOWN'],
      forexKey: 'do-not-export',
    });
    expect(p.marketId).toBe('BTCUSDT');
    expect(p.timeframe).toBe('1h');
    expect(p.backgroundRefresh).toBe(false);
    expect(p.cryptoFeeBps).toBe(100);
    expect(p.forexRequestsPerMinute).toBe(6);
    expect(p.favorites).toEqual(['BTCUSDT']);
    expect(JSON.stringify(p)).not.toContain('do-not-export');
  });
});
