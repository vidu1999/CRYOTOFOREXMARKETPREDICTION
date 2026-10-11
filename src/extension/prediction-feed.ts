import { getLiveMarket } from './catalog';
import { MINUTE } from './predictions';
import {
  BINANCE_ORIGIN,
  FOREX_ORIGIN,
  FeedError,
  parseBinanceCandles,
  parseForexCandles,
  providerJSON,
  type FetchOptions,
} from './providers';
import type { Candle } from '../lib/types';

/** Bounded historical window: one request, at most 500 closed minutes; no fabricated gap fills. */
export async function fetchOutcomeBars(
  marketId: string,
  from: number,
  end: number,
  options: FetchOptions = {},
): Promise<Candle[]> {
  const market = getLiveMarket(marketId),
    now = (options.now ?? Date.now)();
  const until = Math.min(end, Math.floor(now / MINUTE) * MINUTE, from + 500 * MINUTE);
  if (!Number.isFinite(from) || !Number.isFinite(end) || from % MINUTE !== 0 || end % MINUTE !== 0)
    throw new FeedError('INVALID_DATA', 'Invalid outcome-history window.');
  if (until <= from) return [];
  const fetcher = options.fetcher ?? fetch;
  let bars: Candle[];
  if (market.category === 'Crypto') {
    const url = `${BINANCE_ORIGIN}/api/v3/klines?${new URLSearchParams({ symbol: market.symbol, interval: '1m', startTime: String(from), endTime: String(until - 1), limit: '500', timeZone: '0' })}`;
    bars = parseBinanceCandles(await providerJSON(url, fetcher), now, '1m');
  } else {
    const key = options.forexKey?.trim();
    if (!key)
      throw new FeedError(
        'SETUP_REQUIRED',
        'Save a valid Twelve Data key in private settings to check forex outcomes. Pending predictions are not counted as losses.',
      );
    await options.reserveForex?.(1);
    const utc = (time: number) => new Date(time).toISOString().slice(0, 19).replace('T', ' ');
    const url = `${FOREX_ORIGIN}/time_series?${new URLSearchParams({ symbol: market.symbol, interval: '1min', apikey: key, timezone: 'UTC', order: 'asc', outputsize: '500', start_date: utc(from), end_date: utc(until - 1) })}`;
    bars = parseForexCandles(await providerJSON(url, fetcher, key), '1m', now, market.symbol);
  }
  return bars.filter((c) => c.time >= from && c.time + MINUTE <= until);
}
