import { describe, expect, it } from 'vitest';
import { FIXTURE_NOW, fixtureResponse } from '../../tests/fixtures/live';
import { DEFAULT_PREFERENCES, currentCandleOpen, liveCandleCloseTime } from './catalog';
import { buildLiveSnapshot } from './service';
import {
  evaluatePrediction,
  LEDGER_LIMIT,
  makePrediction,
  MINUTE,
  normalizePredictions,
  predictionStats,
} from './predictions';
import type { Candle } from '../lib/types';
import type { LiveTimeframe, PaperPrediction } from './types';
import { paperRecord } from '../../tests/fixtures/predictions';

const start = FIXTURE_NOW;
const bar = (time = start, values: Partial<Candle> = {}): Candle => ({
  time,
  open: 100,
  high: 100.5,
  low: 99.5,
  close: 100.1,
  volume: 0,
  ...values,
});
const check = (p: PaperPrediction, bars: Candle[]) =>
  evaluatePrediction(p, bars, start + 60 * MINUTE);

describe('fresh future paper predictions', () => {
  it('derives action from causal analysis and freezes entry, levels, times and costs', async () => {
    const prefs = { ...DEFAULT_PREFERENCES },
      snapshot = await buildLiveSnapshot(prefs, {
        fetcher: async (url) => fixtureResponse(url),
        now: () => start,
      });
    const p = makePrediction(snapshot, prefs, 1000, start, 'www.tradingview.com');
    expect(p.action).toBe('BUY');
    expect(p.entry).toBe(snapshot.quote.price);
    expect(p.stop).toBeCloseTo(p.entry - p.atr * 1.2);
    expect(p.target).toBeCloseTo(p.entry + p.atr * 2.4);
    expect(p.expiresAt).toBe(Date.UTC(2026, 9, 10, 13));
    expect(p.entryAsOf).toBe(start);
    expect(p.basisClosedAt).toBe(snapshot.candleCloseAt);
    expect(p.feeBps).toBe(10);
    prefs.cryptoFeeBps = 100;
    expect(p.feeBps).toBe(10);
    expect(normalizePredictions([p])).toEqual([p]);
  });
  it('SELL and WAIT are model-derived, not caller-supplied trade directions', async () => {
    const s = await buildLiveSnapshot(DEFAULT_PREFERENCES, {
      fetcher: async (url) => fixtureResponse(url),
      now: () => start,
    });
    const sell = makePrediction(
      { ...s, analysis: { ...s.analysis!, direction: 'bearish' } },
      DEFAULT_PREFERENCES,
      1000,
      start,
    );
    expect(sell.action).toBe('SELL');
    expect(sell.stop).toBeGreaterThan(sell.entry);
    expect(sell.target).toBeLessThan(sell.entry);
    const wait = makePrediction(
      { ...s, analysis: { ...s.analysis!, direction: 'neutral' } },
      DEFAULT_PREFERENCES,
      1000,
      start,
    );
    expect(wait).toMatchObject({
      action: 'WAIT',
      status: 'abstained',
      notional: 0,
      units: 0,
      stop: null,
      target: null,
    });
    expect(normalizePredictions([wait])).toEqual([wait]);
  });
  it('rejects stale/closed/future quotes, wrong selection, missing or old completed history and invalid notional', async () => {
    const s = await buildLiveSnapshot(DEFAULT_PREFERENCES, {
      fetcher: async (url) => fixtureResponse(url),
      now: () => start,
    });
    for (const changed of [
      { quote: { ...s.quote, asOf: start - 30_001 } },
      { quote: { ...s.quote, marketOpen: false } },
      { quote: { ...s.quote, asOf: start + 1 } },
      { receivedAt: start - 30_001 },
      { analysis: null },
      { candleCloseAt: start - 60 * MINUTE },
      { marketId: 'ETHUSDT' },
    ])
      expect(() =>
        makePrediction({ ...s, ...changed }, DEFAULT_PREFERENCES, 1000, start),
      ).toThrow();
    for (const n of [0, -1, NaN, Infinity, 1_000_001])
      expect(() => makePrediction(s, DEFAULT_PREFERENCES, n, start)).toThrow(/notional/);
  });
  it('requires provider-confirmed open forex markets and sizes USDJPY in base USD', async () => {
    const prefs = { ...DEFAULT_PREFERENCES, marketId: 'USDJPY' },
      s = await buildLiveSnapshot(prefs, {
        forexKey: 'fixture-private-only',
        fetcher: async (url) => fixtureResponse(url),
        now: () => start,
      });
    expect(makePrediction(s, prefs, 1000, start)).toMatchObject({
      units: 1000,
      accountCurrency: 'USD',
      provider: 'Twelve Data',
    });
    expect(() =>
      makePrediction({ ...s, quote: { ...s.quote, marketOpen: null } }, prefs, 1000, start),
    ).toThrow(/confirm the market is open/);
  });
  it('expires at real UTC calendar boundaries, not a full interval measured from click', () => {
    for (const [tf, time, expiry] of [
      ['1m', Date.UTC(2026, 9, 11, 12, 15, 40), Date.UTC(2026, 9, 11, 12, 16)],
      ['1w', Date.UTC(2026, 9, 11, 12), Date.UTC(2026, 9, 12)],
      ['1mo', Date.UTC(2028, 1, 20), Date.UTC(2028, 2, 1)],
    ] as [LiveTimeframe, number, number][])
      expect(liveCandleCloseTime(currentCandleOpen(time, tf), tf)).toBe(expiry);
  });
});
describe('causal 1-minute stop/target/expiry evaluator', () => {
  it('scores a BUY target win after both-side costs and leaves original fields untouched', () => {
    const p = paperRecord(),
      original = structuredClone(p),
      result = check(p, [bar(start, { high: 103, close: 102 })]);
    expect(normalizePredictions([result])).toEqual([result]);
    expect(p).toEqual(original);
    expect(result.status).toBe('win');
    expect(result.outcome?.reason).toBe('target');
    expect(result.outcome?.exitPrice).toBe(102.4);
    expect(result.outcome?.grossPnl).toBeCloseTo(24);
    expect(result.outcome?.fees).toBeCloseTo(2.024);
    expect(result.outcome?.netPnl).toBeCloseTo(21.976);
  });
  it('scores a BUY stop loss and a SELL target/stop with the correct sign', () => {
    expect(check(paperRecord(), [bar(start, { low: 98 })]).status).toBe('loss');
    const sell = paperRecord({ action: 'SELL', stop: 101.2, target: 97.6 });
    expect(check(sell, [bar(start, { low: 97 })]).outcome?.grossPnl).toBeCloseTo(24);
    expect(check(sell, [bar(start, { high: 102 })]).status).toBe('loss');
  });
  it('cannot convert a favorable direction into a net win if costs consume the gain', () => {
    const p = paperRecord({ target: 100.1, feeBps: 100 });
    const r = check(p, [bar(start, { high: 100.2 })]);
    expect(r.outcome?.reason).toBe('target');
    expect(r.status).toBe('loss');
  });
  it('marks both-level bars ambiguous rather than picking the profitable order', () => {
    const r = check(paperRecord(), [bar(start, { low: 98, high: 103 })]);
    expect(normalizePredictions([r])).toEqual([r]);
    expect(r.status).toBe('ambiguous');
    expect(r.outcome).toMatchObject({ reason: 'both_levels', exitPrice: null, netPnl: null });
  });
  it('marks touches in a partially elapsed entry minute ambiguous, even if only target is touched', () => {
    const p = paperRecord({ createdAt: start + 20_000 });
    expect(check(p, [bar(start, { high: 103 })])).toMatchObject({
      status: 'ambiguous',
      outcome: { reason: 'entry_minute' },
    });
    expect(check(p, [bar(start, { low: 98, high: 103 })]).outcome?.reason).toBe('entry_minute');
  });
  it('allows an untouched partial minute to advance, never evaluates pre-entry bars or forming bars', () => {
    const p = paperRecord({ createdAt: start + 30_000 });
    expect(
      evaluatePrediction(
        p,
        [bar(start - 60_000, { high: 200, low: 1 }), bar(start)],
        start + 59_999,
      ).status,
    ).toBe('pending');
    expect(check(p, [bar(start), bar(start + MINUTE, { high: 103 })]).status).toBe('win');
  });
  it('uses the first known open after entry for gaps, not a guaranteed stop price', () => {
    const stop = check(paperRecord(), [bar(start, { open: 97, high: 100, low: 96, close: 99 })]);
    expect(stop.outcome).toMatchObject({ reason: 'stop_gap', exitPrice: 97 });
    expect(stop.outcome?.grossPnl).toBe(-30);
    const target = check(paperRecord(), [
      bar(start, { open: 104, high: 105, low: 98, close: 100 }),
    ]);
    expect(target.outcome).toMatchObject({ reason: 'target_gap', exitPrice: 104 });
  });
  it('settles at expiry close only after complete contiguous history up to expiry', () => {
    const p = paperRecord({ expiresAt: start + 2 * MINUTE, feeBps: 0 });
    const r = check(p, [
      bar(start),
      bar(start + MINUTE, { close: 100.4 }),
      bar(start + 2 * MINUTE, { high: 200 }),
    ]);
    expect(r.outcome).toMatchObject({ reason: 'expiry', exitPrice: 100.4 });
    expect(r.outcome?.netPnl).toBeCloseTo(4);
    expect(check(p, [bar(start)]).status).toBe('pending');
  });
  it('flat gross exits become losses with costs, flat net exits stay flat with zero costs', () => {
    const p = paperRecord({ expiresAt: start + MINUTE });
    expect(check(p, [bar(start, { close: 100 })]).status).toBe('loss');
    expect(check({ ...p, feeBps: 0 }, [bar(start, { close: 100 })]).status).toBe('flat');
  });
  it('does not claim a win across missing bars and keeps completely unavailable history pending', () => {
    const p = paperRecord();
    expect(check(p, [bar(start + MINUTE, { high: 103 })])).toMatchObject({
      status: 'ambiguous',
      outcome: { reason: 'missing_history', netPnl: null },
    });
    expect(check(p, []).status).toBe('pending');
  });
  it('supports incremental checks and never revises an already resolved result', () => {
    const p = paperRecord(),
      one = check(p, [bar(start)]);
    expect(one.nextBarAt).toBe(start + MINUTE);
    expect(one.status).toBe('pending');
    const two = check(one, [bar(start), bar(start + MINUTE, { high: 103 })]);
    expect(two.status).toBe('win');
    expect(check(two, [bar(start, { low: 1 })])).toEqual(two);
  });
  it('advances long backlogs in bounded chunks while preserving the original recommendation', () => {
    const p = paperRecord({ timeframe: '1d', expiresAt: Date.UTC(2026, 9, 11) }),
      now = start + 600 * MINUTE;
    const first = evaluatePrediction(
      p,
      Array.from({ length: 500 }, (_, i) => bar(start + i * MINUTE)),
      now,
    );
    expect(first.nextBarAt).toBe(start + 500 * MINUTE);
    expect(first.status).toBe('pending');
    const second = evaluatePrediction(
      first,
      Array.from({ length: 51 }, (_, i) =>
        bar(start + (500 + i) * MINUTE, i === 50 ? { high: 103 } : {}),
      ),
      now,
    );
    expect(second.status).toBe('win');
    expect(second.createdAt).toBe(p.createdAt);
    expect(second.entry).toBe(p.entry);
    expect(normalizePredictions([second])).toEqual([second]);
  });
  it('converts USDJPY JPY P&L into USD at exit and does not conflate USD with USDT', () => {
    const p = paperRecord({
      marketId: 'USDJPY',
      provider: 'Twelve Data',
      entry: 150,
      stop: 148.8,
      target: 152.4,
      units: 1000,
      accountCurrency: 'USD',
      feeBps: 1,
    });
    const r = check(p, [bar(start, { open: 150, low: 149.5, high: 153, close: 152 })]);
    expect(r.outcome?.grossPnl).toBeCloseTo((1000 * 2.4) / 152.4);
    expect(r.outcome?.fees).toBeCloseTo(0.2);
    const s = predictionStats([r, check(paperRecord(), [bar(start, { high: 103 })])]);
    expect(s.netUSD).toBeCloseTo(r.outcome!.netPnl!);
    expect(s.netUSDT).toBeCloseTo(21.976);
  });
  it('rejects malformed OHLC rather than inventing a fill', () => {
    for (const row of [
      bar(start, { high: 90 }),
      bar(start, { low: 110 }),
      bar(start, { open: NaN }),
      bar(start, { time: start + 1 }),
      bar(start, { low: -1 }),
    ])
      expect(() => check(paperRecord(), [row])).toThrow(/malformed/);
    expect(() => check(paperRecord(), [bar(start), bar(start)])).toThrow(/duplicated/);
  });
});
describe('forward statistics, migrations and export privacy', () => {
  it('excludes pending, WAIT and ambiguous from the measured denominator; reports zero data honestly', () => {
    expect(predictionStats([]).winRate).toBeNull();
    const stats = predictionStats([
      paperRecord({ status: 'win' }),
      paperRecord({ status: 'loss' }),
      paperRecord({ status: 'flat' }),
      paperRecord({ status: 'ambiguous' }),
      paperRecord(),
      paperRecord({ action: 'WAIT', status: 'abstained' }),
    ]);
    expect(stats).toMatchObject({
      wins: 1,
      losses: 1,
      flat: 1,
      scored: 3,
      pending: 1,
      ambiguous: 1,
      waits: 1,
    });
    expect(stats.winRate).toBeCloseTo(100 / 3);
  });
  it('whitelists persisted/public fields, strips extra secrets and rejects malformed records', () => {
    const p = { ...paperRecord(), forexKey: 'fixture-secret', unknown: 'private', outcome: null };
    const result = normalizePredictions([p]);
    expect(result).toEqual([paperRecord()]);
    expect(JSON.stringify(result)).not.toContain('fixture-secret');
    expect(normalizePredictions([p, { ...p, id: 'duplicated' }])).toHaveLength(1);
    for (const patch of [
      { status: 'win' },
      { schema: 2 },
      { entry: NaN },
      { stop: null },
      { provider: 'fixture-secret' },
      { accountCurrency: 'JPY' },
      { feeBps: 1000 },
      { expiresAt: start },
      { marketId: 'BTCUSD' },
    ])
      expect(normalizePredictions([{ ...p, ...patch }])).toEqual([]);
    expect(normalizePredictions(null)).toEqual([]);
    expect(
      normalizePredictions(
        Array.from({ length: 600 }, (_, i) => ({
          ...p,
          id: String(i),
          createdAt: p.createdAt + i * 60 * MINUTE,
          entryAsOf: p.entryAsOf + i * 60 * MINUTE,
          basisClosedAt: p.basisClosedAt + i * 60 * MINUTE,
          nextBarAt: p.nextBarAt + i * 60 * MINUTE,
          expiresAt: p.expiresAt + i * 60 * MINUTE,
        })),
      ),
    ).toHaveLength(LEDGER_LIMIT);
  });
});
