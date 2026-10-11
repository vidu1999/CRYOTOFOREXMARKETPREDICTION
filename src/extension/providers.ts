import type { Candle } from '../lib/types';
import { aggregateTwelveHours, LIVE_TIMEFRAMES, liveCandleCloseTime } from './catalog';
import type { FeedFailureCode, FeedHistory, LiveMarket, LiveTimeframe, Quote } from './types';

export const BINANCE_ORIGIN = 'https://data-api.binance.vision';
export const FOREX_ORIGIN = 'https://api.twelvedata.com';
export class FeedError extends Error {
  constructor(
    public code: FeedFailureCode,
    message: string,
    public retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'FeedError';
  }
}
export function redactSecret(message: string, secret = ''): string {
  let safe = secret ? message.split(secret).join('[redacted]') : message;
  if (secret) {
    try {
      safe = safe.split(encodeURIComponent(secret)).join('[redacted]');
    } catch {
      /* Malformed Unicode is never an API key. */
    }
  }
  return safe.replace(/apikey["']?\s*[=:]\s*["']?[^&\s"'<>]+/gi, 'apikey=[redacted]').slice(0, 450);
}
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new FeedError(
      'INVALID_DATA',
      'The provider returned an unexpected response. No forecast was created.',
    );
  return value as Record<string, unknown>;
};
function number(value: unknown, label: string, positive = false): number {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && !value.trim())
  )
    throw new FeedError('INVALID_DATA', `The feed is missing or has invalid ${label}.`);
  const n = Number(value);
  if (!Number.isFinite(n) || (positive && n <= 0))
    throw new FeedError('INVALID_DATA', `The feed returned invalid ${label}.`);
  return n;
}
export function parseProviderTime(value: unknown): number {
  if (typeof value === 'number' || (typeof value === 'string' && /^\d{9,13}$/.test(value))) {
    const n = Number(value),
      time = n < 100_000_000_000 ? n * 1000 : n;
    if (
      !Number.isFinite(time) ||
      time <= 0 ||
      time > 8_640_000_000_000_000 ||
      !Number.isInteger(time)
    )
      throw new FeedError('INVALID_DATA', 'The provider returned an invalid timestamp.');
    return time;
  }
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(
      value,
    )
  )
    throw new FeedError('INVALID_DATA', 'The provider did not supply a valid ISO/UTC timestamp.');
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (
    year < 1970 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > new Date(Date.UTC(year, month, 0)).getUTCDate()
  )
    throw new FeedError('INVALID_DATA', 'The provider returned an impossible calendar date.');
  const normalized = value.replace(' ', 'T');
  const utc =
    /[T]/.test(normalized) && !/(Z|[+-]\d{2}:\d{2})$/.test(normalized)
      ? normalized + 'Z'
      : normalized;
  const time = Date.parse(utc);
  if (!Number.isFinite(time) || time <= 0)
    throw new FeedError('INVALID_DATA', 'The provider returned an invalid timestamp.');
  return time;
}
function candle(c: Candle): Candle {
  if (
    ![c.time, c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite) ||
    !Number.isInteger(c.time) ||
    c.time <= 0 ||
    Math.min(c.open, c.high, c.low, c.close) <= 0 ||
    c.low > Math.min(c.open, c.close) ||
    c.high < Math.max(c.open, c.close) ||
    c.low > c.high ||
    c.volume < 0
  )
    throw new FeedError('INVALID_DATA', 'Invalid OHLCV data: no signal was generated.');
  return c;
}
function sortedUnique(candles: Candle[]): Candle[] {
  const sorted = candles.sort((a, b) => a.time - b.time);
  if (sorted.some((c, i) => i > 0 && c.time === sorted[i - 1].time))
    throw new FeedError('INVALID_DATA', 'The provider returned duplicate candle timestamps.');
  return sorted;
}
export function parseBinanceTicker(value: unknown, symbol: string): Quote {
  const r = record(value);
  if (r.symbol !== symbol)
    throw new FeedError('INVALID_DATA', 'The quote symbol does not match the selected market.');
  const asOf = number(r.closeTime, 'timestamp', true);
  if (!Number.isInteger(asOf))
    throw new FeedError('INVALID_DATA', 'The crypto quote timestamp is malformed.');
  return {
    price: number(r.lastPrice, 'price', true),
    changePercent: number(r.priceChangePercent, '24-hour change'),
    asOf,
    marketOpen: true,
  };
}
export function parseBinanceCandles(
  value: unknown,
  asOf: number,
  timeframe?: LiveTimeframe,
): Candle[] {
  if (!Array.isArray(value) || value.length > 1000)
    throw new FeedError('INVALID_DATA', 'The crypto feed did not return candles.');
  const closed: Candle[] = [];
  for (const row of value) {
    if (!Array.isArray(row) || row.length < 7)
      throw new FeedError('INVALID_DATA', 'The crypto feed returned malformed candles.');
    const openTime = number(row[0], 'opening timestamp', true),
      closeTime = number(row[6], 'candle close timestamp', true);
    if (
      !Number.isInteger(openTime) ||
      !Number.isInteger(closeTime) ||
      closeTime < openTime ||
      (timeframe && closeTime + 1 !== liveCandleCloseTime(openTime, timeframe))
    )
      throw new FeedError(
        'INVALID_DATA',
        'Crypto candle timestamps do not match the requested timeframe.',
      );
    if (closeTime + 1 > asOf) continue;
    closed.push(
      candle({
        time: openTime,
        open: number(row[1], 'open', true),
        high: number(row[2], 'high', true),
        low: number(row[3], 'low', true),
        close: number(row[4], 'close', true),
        volume: number(row[5], 'volume'),
      }),
    );
  }
  return sortedUnique(closed).slice(-600);
}
export function parseForexQuote(value: unknown, symbol: string): Quote {
  const r = record(value);
  if (r.symbol !== symbol)
    throw new FeedError('INVALID_DATA', 'The forex quote symbol does not match your selection.');
  const percentage = r.percent_change;
  return {
    price: number(r.close, 'quote price', true),
    changePercent:
      percentage === undefined || percentage === null ? null : number(percentage, 'session change'),
    asOf: parseProviderTime(r.timestamp ?? r.datetime),
    marketOpen: typeof r.is_market_open === 'boolean' ? r.is_market_open : null,
  };
}
export function parseForexCandles(
  value: unknown,
  timeframe: LiveTimeframe,
  asOf: number,
  symbol: string,
): Candle[] {
  const r = record(value);
  if (!Array.isArray(r.values) || r.values.length > 5000)
    throw new FeedError(
      'INVALID_DATA',
      'The forex provider did not return OHLC history. Check your plan and selected timeframe.',
    );
  const meta = record(r.meta);
  if (
    meta.symbol !== symbol ||
    meta.interval !== LIVE_TIMEFRAMES.find((t) => t.id === timeframe)!.forex
  )
    throw new FeedError(
      'INVALID_DATA',
      'The forex history does not match the requested symbol/timeframe.',
    );
  const sourceTf = timeframe === '12h' ? '4h' : timeframe;
  const parsed = r.values
    .map((value) => {
      const c = record(value);
      return candle({
        time: parseProviderTime(c.datetime),
        open: number(c.open, 'open', true),
        high: number(c.high, 'high', true),
        low: number(c.low, 'low', true),
        close: number(c.close, 'close', true),
        volume: c.volume === undefined || c.volume === null ? 0 : number(c.volume, 'volume'),
      });
    })
    .filter((c) => liveCandleCloseTime(c.time, sourceTf) <= asOf);
  const sorted = sortedUnique(parsed);
  return (timeframe === '12h' ? aggregateTwelveHours(sorted) : sorted).slice(-600);
}
export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
export async function providerJSON(url: string, fetcher: Fetcher, secret = ''): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, {
      signal: AbortSignal.timeout(12_000),
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    throw new FeedError(
      'NETWORK',
      'Cannot reach the market-data provider. Check your connection or provider availability. No demo prices are substituted.',
    );
  }
  if (response.status === 429 || response.status === 418) {
    const retry = Math.min(3600, Math.max(30, Number(response.headers.get('retry-after')) || 60));
    throw new FeedError(
      'RATE_LIMIT',
      'Provider rate limit reached. Wait before refreshing or adjust your plan/refresh settings.',
      retry,
    );
  }
  if (!response.ok)
    throw new FeedError(
      'PROVIDER',
      `Market-data provider returned HTTP ${response.status}. Check access, regional availability, or your API plan.`,
    );
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new FeedError('INVALID_DATA', 'The provider response was not valid JSON.');
  }
  if (json && !Array.isArray(json) && typeof json === 'object') {
    const r = json as Record<string, unknown>;
    if (r.status === 'error' || (typeof r.code === 'number' && r.code < 0)) {
      const code = Number(r.code) === 429 ? 'RATE_LIMIT' : 'PROVIDER';
      throw new FeedError(
        code,
        redactSecret(
          typeof r.message === 'string'
            ? r.message
            : typeof r.msg === 'string'
              ? r.msg
              : 'The provider rejected this request.',
          secret,
        ),
        code === 'RATE_LIMIT' ? 60 : undefined,
      );
    }
  }
  return json;
}
export interface FetchOptions {
  fetcher?: Fetcher;
  forexKey?: string;
  now?: () => number;
  reserveForex?: (requests: number) => Promise<void>;
}
export async function fetchLiveHistory(
  market: LiveMarket,
  timeframe: LiveTimeframe,
  options: FetchOptions = {},
): Promise<FeedHistory> {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const tf = LIVE_TIMEFRAMES.find((t) => t.id === timeframe)!;
  let quote: Quote;
  let candles: Candle[];
  if (market.category === 'Crypto') {
    const quoteURL = `${BINANCE_ORIGIN}/api/v3/ticker/24hr?${new URLSearchParams({ symbol: market.symbol })}`;
    const barsURL = `${BINANCE_ORIGIN}/api/v3/klines?${new URLSearchParams({ symbol: market.symbol, interval: tf.binance, limit: '600', timeZone: '0' })}`;
    const [ticker, bars] = await Promise.all([
      providerJSON(quoteURL, fetcher),
      providerJSON(barsURL, fetcher),
    ]);
    quote = parseBinanceTicker(ticker, market.symbol);
    candles = parseBinanceCandles(bars, Math.min(now(), quote.asOf), timeframe);
  } else {
    const key = options.forexKey?.trim();
    if (!key)
      throw new FeedError(
        'SETUP_REQUIRED',
        'Connect Twelve Data in extension settings to get forex prices. Your key stays in this browser.',
      );
    await options.reserveForex?.(2);
    const params = { symbol: market.symbol, apikey: key, timezone: 'UTC' };
    const quoteURL = `${FOREX_ORIGIN}/quote?${new URLSearchParams(params)}`;
    const barsURL = `${FOREX_ORIGIN}/time_series?${new URLSearchParams({ ...params, interval: tf.forex, outputsize: timeframe === '12h' ? '1800' : '600', order: 'asc' })}`;
    const [ticker, bars] = await Promise.all([
      providerJSON(quoteURL, fetcher, key),
      providerJSON(barsURL, fetcher, key),
    ]);
    quote = parseForexQuote(ticker, market.symbol);
    // Use wall-clock closure for history: a quote's last tick can precede a closed Friday bar.
    candles = parseForexCandles(bars, timeframe, now(), market.symbol);
  }
  if (quote.asOf > now() + 300_000)
    throw new FeedError(
      'CLOCK_SKEW',
      'The feed timestamp is ahead of this device. Check your system clock before relying on freshness.',
    );
  if (candles.some((c) => !Number.isFinite(c.high + c.low + c.close)))
    throw new FeedError('INVALID_DATA', 'Prices exceed the supported numeric range.');
  return {
    quote,
    candles,
    provider: market.category === 'Crypto' ? 'Binance market data' : 'Twelve Data',
    receivedAt: now(),
    candleNote:
      timeframe === '12h' && market.category === 'Forex'
        ? '12H aggregated from three complete 4H bars; gaps omitted.'
        : 'Native provider candles · closed bars only',
  };
}
export function quoteStatus(
  history: FeedHistory | null,
  market: LiveMarket,
  now = Date.now(),
): 'live' | 'closed' | 'delayed' | 'disconnected' {
  if (!history) return 'disconnected';
  if (history.quote.marketOpen === false) return 'closed';
  const tolerance = market.category === 'Crypto' ? 90_000 : 180_000;
  return now - history.quote.asOf >= -5000 &&
    now - history.receivedAt >= -5000 &&
    now - history.quote.asOf <= tolerance &&
    now - history.receivedAt <= tolerance
    ? 'live'
    : 'delayed';
}
