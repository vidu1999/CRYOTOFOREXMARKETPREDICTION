// Deterministic test fixtures ONLY. Never imported by extension production code.
import { LIVE_TIMEFRAMES, liveCandleCloseTime } from '../../src/extension/catalog';
import type { LiveTimeframe } from '../../src/extension/types';

export const FIXTURE_NOW = Date.UTC(2026, 9, 10, 12, 30);
export function fixtureOpen(now: number, timeframe: LiveTimeframe): number {
  const date = new Date(now);
  if (timeframe === '1mo') return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  if (timeframe === '1w')
    return Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() - ((date.getUTCDay() + 6) % 7),
    );
  const duration = LIVE_TIMEFRAMES.find((t) => t.id === timeframe)!.duration;
  return Math.floor(now / duration) * duration;
}
export function cryptoBars(
  now = FIXTURE_NOW,
  timeframe: LiveTimeframe = '1h',
  count = 80,
  forming = false,
): unknown[][] {
  const latest = fixtureOpen(now, timeframe),
    duration = LIVE_TIMEFRAMES.find((t) => t.id === timeframe)!.duration,
    date = new Date(latest);
  return Array.from({ length: count + (forming ? 1 : 0) }, (_, i) => {
    const time =
      timeframe === '1mo'
        ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - count + i, 1)
        : latest - (count - i) * duration;
    const open = 100 + i * 0.1;
    return [
      time,
      String(open),
      String(open + 0.2),
      String(open - 0.1),
      String(open + 0.08),
      '1000',
      liveCandleCloseTime(time, timeframe) - 1,
    ];
  });
}
export function cryptoTicker(now = FIXTURE_NOW, symbol = 'BTCUSDT') {
  return { symbol, lastPrice: '108.123', priceChangePercent: '2.51', closeTime: now };
}
export function forexQuote(now = FIXTURE_NOW, symbol = 'EUR/USD') {
  return {
    symbol,
    close: symbol === 'USD/JPY' ? '150.10' : '1.101',
    percent_change: '.15',
    timestamp: now / 1000,
    is_market_open: true,
  };
}
export function forexBars(
  now = FIXTURE_NOW,
  timeframe: LiveTimeframe = '1h',
  symbol = 'EUR/USD',
  count = 80,
  forming = false,
) {
  const source = timeframe === '12h' ? '4h' : timeframe;
  const rows = cryptoBars(now, source, count, forming);
  return {
    meta: {
      symbol,
      interval: LIVE_TIMEFRAMES.find((t) => t.id === timeframe)!.forex,
      exchange_timezone: 'UTC',
    },
    values: rows.map((row) => ({
      datetime: new Date(row[0] as number).toISOString().slice(0, 19).replace('T', ' '),
      open: String((symbol === 'USD/JPY' ? 150 : 1.1) + (Number(row[1]) - 100) * 0.001),
      high: String((symbol === 'USD/JPY' ? 150 : 1.1) + (Number(row[2]) - 100) * 0.001),
      low: String((symbol === 'USD/JPY' ? 150 : 1.1) + (Number(row[3]) - 100) * 0.001),
      close: String((symbol === 'USD/JPY' ? 150 : 1.1) + (Number(row[4]) - 100) * 0.001),
      volume: null,
    })),
  };
}
export function fixtureResponse(input: string, now = FIXTURE_NOW): Response {
  const url = new URL(input),
    symbol = url.searchParams.get('symbol') ?? 'BTCUSDT';
  const tf =
    LIVE_TIMEFRAMES.find(
      (t) =>
        t.binance === url.searchParams.get('interval') ||
        t.forex === url.searchParams.get('interval'),
    )?.id ?? '1h';
  const body = url.pathname.endsWith('ticker/24hr')
    ? cryptoTicker(now, symbol)
    : url.pathname.endsWith('klines')
      ? cryptoBars(now, tf, 80, true)
      : url.pathname.endsWith('time_series')
        ? forexBars(now, tf, symbol)
        : forexQuote(now, symbol);
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}
