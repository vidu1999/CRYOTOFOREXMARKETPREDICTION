import type { Candle } from '../lib/types';
import {
  currentCandleOpen,
  getLiveMarket,
  LIVE_MARKETS,
  LIVE_TIMEFRAMES,
  liveCandleCloseTime,
} from './catalog';
import { quoteStatus } from './providers';
import { safePageHost } from './page-context';
import type { LiveSnapshot, PaperPrediction, PredictionOutcome, Preferences } from './types';

export const LEDGER_LIMIT = 500;
export const MINUTE = 60_000;
export function predictionKey(
  p: Pick<PaperPrediction, 'marketId' | 'timeframe' | 'expiresAt'>,
): string {
  return `${p.marketId}:${p.timeframe}:${p.expiresAt}`;
}
export function makePrediction(
  snapshot: LiveSnapshot,
  preferences: Preferences,
  notional: number,
  now: number,
  pageHost?: string,
): PaperPrediction {
  const market = getLiveMarket(preferences.marketId),
    a = snapshot.analysis;
  if (snapshot.marketId !== market.id || snapshot.timeframe !== preferences.timeframe)
    throw new Error('Market/timeframe changed. Confirm the selected chart again.');
  if (
    quoteStatus(snapshot, market, now) !== 'live' ||
    now - snapshot.quote.asOf > 30_000 ||
    now - snapshot.receivedAt > 30_000 ||
    snapshot.quote.asOf > now ||
    snapshot.receivedAt > now
  )
    throw new Error(
      'A paper prediction needs a fresh quote (at most 30s old), an open market, and a working feed. Delayed quotes are not recorded as a current entry.',
    );
  if (market.category === 'Forex' && snapshot.quote.marketOpen !== true)
    throw new Error(
      'The forex provider must confirm the market is open before a current paper entry is recorded.',
    );
  if (
    !a ||
    snapshot.candleCloseAt === null ||
    snapshot.candleCloseAt !== currentCandleOpen(now, snapshot.timeframe) ||
    snapshot.candleCloseAt > now
  )
    throw new Error(
      'Current completed history with at least 50 candles is required. No historical or guessed forecast is recorded.',
    );
  if (!Number.isFinite(notional) || notional < 1 || notional > 1_000_000)
    throw new Error(
      'Hypothetical notional must be between 1 and 1,000,000. This is not an exchange balance.',
    );
  const action = a.direction === 'bullish' ? 'BUY' : a.direction === 'bearish' ? 'SELL' : 'WAIT';
  const entry = snapshot.quote.price,
    atr = a.indicators.atr,
    sign = action === 'SELL' ? -1 : 1;
  const stop = action === 'WAIT' ? null : entry - sign * atr * 1.2,
    target = action === 'WAIT' ? null : entry + sign * atr * 2.4;
  if (
    ![entry, atr, ...(stop === null ? [] : [stop, target!])].every(Number.isFinite) ||
    entry <= 0 ||
    (action !== 'WAIT' && (atr <= 0 || stop! <= 0 || target! <= 0))
  )
    throw new Error(
      'Positive, finite stop/target references are unavailable; no directional trade is fabricated.',
    );
  const units = action === 'WAIT' ? 0 : market.quote === 'JPY' ? notional : notional / entry;
  if (
    !Number.isFinite(units) ||
    !Number.isFinite(a.strength) ||
    (action === 'BUY' && !(stop! < entry && target! > entry)) ||
    (action === 'SELL' && !(target! < entry && stop! > entry))
  )
    throw new Error('The entry or levels exceed the supported precision.');
  return {
    schema: 1,
    id: crypto.randomUUID(),
    model: 'technical-v1',
    marketId: market.id,
    timeframe: preferences.timeframe,
    provider: snapshot.provider,
    action,
    strength: a.strength,
    createdAt: now,
    entryAsOf: snapshot.quote.asOf,
    basisClosedAt: snapshot.candleCloseAt,
    entry,
    atr,
    stop,
    target,
    expiresAt: liveCandleCloseTime(
      currentCandleOpen(now, preferences.timeframe),
      preferences.timeframe,
    ),
    notional: action === 'WAIT' ? 0 : notional,
    units,
    accountCurrency: market.category === 'Crypto' ? 'USDT' : 'USD',
    feeBps: market.category === 'Crypto' ? preferences.cryptoFeeBps : preferences.forexFeeBps,
    pageHost: safePageHost(pageHost) || null,
    status: action === 'WAIT' ? 'abstained' : 'pending',
    nextBarAt: Math.floor(now / MINUTE) * MINUTE,
    lastCheckedAt: null,
    checkError: null,
    outcome: null,
  };
}
function ambiguous(
  p: PaperPrediction,
  reason: PredictionOutcome['reason'],
  bar: Candle,
  now: number,
): PaperPrediction {
  return {
    ...p,
    status: 'ambiguous',
    lastCheckedAt: now,
    checkError: null,
    outcome: {
      reason,
      assessedAt: now,
      barStart: bar.time,
      barEnd: bar.time + MINUTE,
      exitPrice: null,
      grossPnl: null,
      fees: null,
      netPnl: null,
      returnPercent: null,
    },
  };
}
function settle(
  p: PaperPrediction,
  price: number,
  reason: PredictionOutcome['reason'],
  bar: Candle,
  now: number,
): PaperPrediction {
  const jpy = getLiveMarket(p.marketId).quote === 'JPY',
    sign = p.action === 'BUY' ? 1 : -1;
  const grossPnl = (sign * p.units * (price - p.entry)) / (jpy ? price : 1);
  const fees = (p.feeBps / 10_000) * (jpy ? p.notional * 2 : p.units * (p.entry + price));
  const netPnl = grossPnl - fees,
    returnPercent = (netPnl / p.notional) * 100;
  if (![grossPnl, fees, netPnl, returnPercent].every(Number.isFinite))
    throw new Error('Outcome arithmetic exceeds the supported numeric range.');
  return {
    ...p,
    status: netPnl > 0 ? 'win' : netPnl < 0 ? 'loss' : 'flat',
    lastCheckedAt: now,
    checkError: null,
    outcome: {
      reason,
      assessedAt: now,
      barStart: bar.time,
      barEnd: bar.time + MINUTE,
      exitPrice: price,
      grossPnl,
      fees,
      netPnl,
      returnPercent,
    },
  };
}
/** Only subsequently CLOSED 1m bars. Never retrofit a current prediction onto a backtest. */
export function evaluatePrediction(
  prediction: PaperPrediction,
  candles: Candle[],
  now: number,
): PaperPrediction {
  if (prediction.status !== 'pending' || prediction.action === 'WAIT') return prediction;
  let p = { ...prediction, lastCheckedAt: now, checkError: null };
  const seen = new Set<number>();
  const data = candles
    .filter((c) => c.time >= p.nextBarAt && c.time < p.expiresAt && c.time + MINUTE <= now)
    .sort((a, b) => a.time - b.time);
  for (const c of data) {
    if (
      seen.has(c.time) ||
      ![c.time, c.open, c.high, c.low, c.close].every(Number.isFinite) ||
      c.time % MINUTE !== 0 ||
      Math.min(c.open, c.high, c.low, c.close) <= 0 ||
      c.low > Math.min(c.open, c.close) ||
      c.high < Math.max(c.open, c.close)
    )
      throw new Error('Outcome history is malformed or duplicated; prediction remains pending.');
    seen.add(c.time);
    if (c.time !== p.nextBarAt) return ambiguous(p, 'missing_history', c, now);
    const stopHit = p.action === 'BUY' ? c.low <= p.stop! : c.high >= p.stop!;
    const targetHit = p.action === 'BUY' ? c.high >= p.target! : c.low <= p.target!;
    if (c.time < p.createdAt) {
      if (stopHit || targetHit) return ambiguous(p, 'entry_minute', c, now); // May have happened before the recommendation.
    } else {
      const stopGap = p.action === 'BUY' ? c.open <= p.stop! : c.open >= p.stop!;
      const targetGap = p.action === 'BUY' ? c.open >= p.target! : c.open <= p.target!;
      if (stopGap) return settle(p, c.open, 'stop_gap', c, now);
      if (targetGap) return settle(p, c.open, 'target_gap', c, now);
      if (stopHit && targetHit) return ambiguous(p, 'both_levels', c, now);
      if (stopHit) return settle(p, p.stop!, 'stop', c, now);
      if (targetHit) return settle(p, p.target!, 'target', c, now);
    }
    if (c.time + MINUTE === p.expiresAt) return settle(p, c.close, 'expiry', c, now);
    p = { ...p, nextBarAt: c.time + MINUTE };
  }
  return p;
}
export function predictionStats(records: PaperPrediction[]) {
  const wins = records.filter((p) => p.status === 'win').length,
    losses = records.filter((p) => p.status === 'loss').length,
    flat = records.filter((p) => p.status === 'flat').length;
  const scored = wins + losses + flat;
  return {
    wins,
    losses,
    flat,
    scored,
    winRate: scored ? (wins / scored) * 100 : null,
    pending: records.filter((p) => p.status === 'pending').length,
    ambiguous: records.filter((p) => p.status === 'ambiguous').length,
    waits: records.filter((p) => p.status === 'abstained').length,
    netUSDT: records
      .filter((p) => p.accountCurrency === 'USDT')
      .reduce((sum, p) => sum + (p.outcome?.netPnl ?? 0), 0),
    netUSD: records
      .filter((p) => p.accountCurrency === 'USD')
      .reduce((sum, p) => sum + (p.outcome?.netPnl ?? 0), 0),
  };
}
/** Strict migration boundary: unrelated/local-profile fields (including credentials) never escape. */
export function normalizePredictions(value: unknown): PaperPrediction[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>(),
    keys = new Set<string>();
  return value.slice(0, LEDGER_LIMIT).flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const p = raw as PaperPrediction;
    if (
      p.schema !== 1 ||
      p.model !== 'technical-v1' ||
      typeof p.id !== 'string' ||
      !LIVE_MARKETS.some((m) => m.id === p.marketId) ||
      !LIVE_TIMEFRAMES.some((t) => t.id === p.timeframe) ||
      !['BUY', 'SELL', 'WAIT'].includes(p.action) ||
      !['pending', 'win', 'loss', 'flat', 'ambiguous', 'abstained'].includes(p.status) ||
      ![
        p.createdAt,
        p.entryAsOf,
        p.basisClosedAt,
        p.entry,
        p.atr,
        p.expiresAt,
        p.notional,
        p.units,
        p.feeBps,
        p.nextBarAt,
        p.strength,
      ].every(Number.isFinite) ||
      p.entry <= 0 ||
      p.expiresAt <= p.createdAt
    )
      return [];
    const market = getLiveMarket(p.marketId);
    if (
      p.provider !== (market.category === 'Crypto' ? 'Binance market data' : 'Twelve Data') ||
      p.accountCurrency !== (market.category === 'Crypto' ? 'USDT' : 'USD') ||
      p.strength < 0 ||
      p.strength > 100 ||
      p.feeBps < 0 ||
      p.feeBps > 100 ||
      p.createdAt < 0 ||
      p.entryAsOf > p.createdAt ||
      p.basisClosedAt > p.createdAt ||
      p.nextBarAt % MINUTE !== 0 ||
      p.nextBarAt < Math.floor(p.createdAt / MINUTE) * MINUTE ||
      p.nextBarAt >= p.expiresAt ||
      p.expiresAt !==
        liveCandleCloseTime(currentCandleOpen(p.createdAt, p.timeframe), p.timeframe) ||
      ids.has(p.id.slice(0, 80)) ||
      keys.has(predictionKey(p))
    )
      return [];
    if (p.action === 'WAIT') {
      if (
        p.status !== 'abstained' ||
        p.stop !== null ||
        p.target !== null ||
        p.units !== 0 ||
        p.notional !== 0 ||
        p.outcome !== null
      )
        return [];
    } else if (
      p.status === 'abstained' ||
      p.notional < 1 ||
      p.notional > 1_000_000 ||
      p.units <= 0 ||
      typeof p.stop !== 'number' ||
      typeof p.target !== 'number' ||
      !Number.isFinite(p.stop) ||
      !Number.isFinite(p.target) ||
      p.stop <= 0 ||
      p.target <= 0 ||
      (p.action === 'BUY'
        ? !(p.stop < p.entry && p.entry < p.target)
        : !(p.target < p.entry && p.entry < p.stop))
    )
      return [];
    const {
      schema,
      id,
      model,
      marketId,
      timeframe,
      provider,
      action,
      strength,
      createdAt,
      entryAsOf,
      basisClosedAt,
      entry,
      atr,
      stop,
      target,
      expiresAt,
      notional,
      units,
      accountCurrency,
      feeBps,
      status,
      nextBarAt,
    } = p;
    let outcome: PredictionOutcome | null = null;
    if (p.outcome && typeof p.outcome === 'object') {
      const o = p.outcome;
      if (
        ![o.assessedAt, o.barStart, o.barEnd].every(Number.isFinite) ||
        ![
          'target',
          'stop',
          'target_gap',
          'stop_gap',
          'expiry',
          'both_levels',
          'entry_minute',
          'missing_history',
        ].includes(o.reason)
      )
        return [];
      const { reason, assessedAt, barStart, barEnd } = o;
      const nullable = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
      outcome = {
        reason,
        assessedAt,
        barStart,
        barEnd,
        exitPrice: nullable(o.exitPrice),
        grossPnl: nullable(o.grossPnl),
        fees: nullable(o.fees),
        netPnl: nullable(o.netPnl),
        returnPercent: nullable(o.returnPercent),
      };
    }
    if (p.status === 'pending' && outcome !== null) return [];
    if (['win', 'loss', 'flat', 'ambiguous'].includes(p.status)) {
      if (
        !outcome ||
        outcome.assessedAt < p.createdAt ||
        outcome.barEnd !== outcome.barStart + MINUTE ||
        outcome.assessedAt < outcome.barEnd ||
        outcome.barStart < Math.floor(p.createdAt / MINUTE) * MINUTE ||
        outcome.barEnd > p.expiresAt
      )
        return [];
      if (p.status === 'ambiguous') {
        if (
          !['both_levels', 'entry_minute', 'missing_history'].includes(outcome.reason) ||
          [
            outcome.exitPrice,
            outcome.grossPnl,
            outcome.fees,
            outcome.netPnl,
            outcome.returnPercent,
          ].some((v) => v !== null)
        )
          return [];
      } else {
        if (
          !['target', 'stop', 'target_gap', 'stop_gap', 'expiry'].includes(outcome.reason) ||
          outcome.exitPrice === null ||
          outcome.exitPrice <= 0 ||
          outcome.grossPnl === null ||
          outcome.fees === null ||
          outcome.fees < 0 ||
          outcome.netPnl === null ||
          outcome.returnPercent === null ||
          outcome.netPnl !== outcome.grossPnl - outcome.fees ||
          outcome.returnPercent !== (outcome.netPnl / p.notional) * 100 ||
          (p.status === 'win'
            ? outcome.netPnl <= 0
            : p.status === 'loss'
              ? outcome.netPnl >= 0
              : outcome.netPnl !== 0)
        )
          return [];
      }
    }
    ids.add(p.id.slice(0, 80));
    keys.add(predictionKey(p));
    return [
      {
        schema,
        id: id.slice(0, 80),
        model,
        marketId,
        timeframe,
        provider,
        action,
        strength,
        createdAt,
        entryAsOf,
        basisClosedAt,
        entry,
        atr,
        stop: typeof stop === 'number' && Number.isFinite(stop) ? stop : null,
        target: typeof target === 'number' && Number.isFinite(target) ? target : null,
        expiresAt,
        notional,
        units,
        accountCurrency,
        feeBps,
        pageHost: safePageHost(p.pageHost) || null,
        status,
        nextBarAt,
        lastCheckedAt:
          typeof p.lastCheckedAt === 'number' && Number.isFinite(p.lastCheckedAt)
            ? p.lastCheckedAt
            : null,
        checkError: typeof p.checkError === 'string' ? p.checkError.slice(0, 450) : null,
        outcome,
      },
    ];
  });
}
