import { analyze, backtest } from '../lib/analytics';
import { getLiveMarket, liveCandleCloseTime } from './catalog';
import { FeedError, fetchLiveHistory, redactSecret, type FetchOptions } from './providers';
import type { FeedFailure, LiveSnapshot, Preferences } from './types';

export async function buildLiveSnapshot(
  preferences: Preferences,
  options: FetchOptions = {},
): Promise<LiveSnapshot> {
  const market = getLiveMarket(preferences.marketId);
  const data = await fetchLiveHistory(market, preferences.timeframe, options);
  const analysis = analyze(data.candles);
  if (
    analysis &&
    ![
      analysis.price,
      analysis.score,
      analysis.target,
      analysis.stop,
      ...Object.values(analysis.indicators),
    ].every(Number.isFinite)
  )
    throw new FeedError(
      'INVALID_DATA',
      'History produced nonfinite indicators; no signal can be trusted.',
    );
  const result = backtest(
    data.candles,
    250,
    market.category === 'Crypto' ? preferences.cryptoFeeBps : preferences.forexFeeBps,
    10_000,
    market.quote === 'JPY' ? 'JPY' : 'USD',
  );
  if (
    ![
      result.totalReturn,
      result.maxDrawdown,
      result.feesPaid,
      ...result.equity.map((p) => p.value),
    ].every(Number.isFinite)
  )
    throw new FeedError('INVALID_DATA', 'History exceeds the supported backtest numeric range.');
  return {
    ...data,
    marketId: market.id,
    timeframe: preferences.timeframe,
    analysis,
    candleCloseAt: data.candles.length
      ? liveCandleCloseTime(data.candles[data.candles.length - 1].time, preferences.timeframe)
      : null,
    backtest: result,
  };
}
export function feedFailure(error: unknown, preferences: Preferences, secret = ''): FeedFailure {
  return {
    code: error instanceof FeedError ? error.code : 'NETWORK',
    message: redactSecret(
      error instanceof FeedError
        ? error.message
        : 'The live feed failed. No new forecast was created.',
      secret,
    ),
    at: Date.now(),
    retryAfterSeconds: error instanceof FeedError ? error.retryAfterSeconds : undefined,
    marketId: preferences.marketId,
    timeframe: preferences.timeframe,
  };
}
/** Shared storage and the worker mutex make this survive worker restarts and concurrent views. */
export function reserveRequestWindow(
  times: number[],
  count: number,
  limit: number,
  now: number,
): number[] {
  if (
    ![count, limit, now].every(Number.isFinite) ||
    !Number.isInteger(count) ||
    !Number.isInteger(limit) ||
    count <= 0 ||
    limit < 1
  )
    throw new FeedError('INVALID_DATA', 'Invalid provider request-budget configuration.');
  const current = times
    .filter((time) => typeof time === 'number' && Number.isFinite(time) && time > now - 60_000)
    .sort((a, b) => a - b);
  if (current.length + count > limit) {
    const retry = Math.max(1, Math.ceil(((current[0] ?? now) + 60_000 - now) / 1000));
    throw new FeedError(
      'RATE_LIMIT',
      `Your forex request budget is cooling down. Try again in ${retry} seconds.`,
      retry,
    );
  }
  return [...current, ...Array.from({ length: count }, () => now)];
}
