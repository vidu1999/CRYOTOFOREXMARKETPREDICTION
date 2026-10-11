import { describe, expect, it } from 'vitest';
import {
  accuracyInterval,
  analyze,
  backtest,
  directionForScore,
  indicatorSeries,
  WARMUP,
} from './analytics';
import type { Candle } from './types';

function candles(count = 300, step = 0.02): Candle[] {
  return Array.from({ length: count }, (_, i) => {
    const open = 100 + i * step;
    const close = open + step;
    return {
      time: Date.UTC(2026, 0, 1) + i * 3_600_000,
      open,
      close,
      high: Math.max(open, close) + 0.05,
      low: Math.min(open, close) - 0.05,
      volume: 100,
    };
  });
}

describe('causal technical indicators', () => {
  it('requires at least fifty completed bars for a forecast', () => {
    expect(analyze(candles(WARMUP - 1))).toBeNull();
    expect(analyze(candles(WARMUP))).not.toBeNull();
  });
  it('keeps a flat market neutral and handles zero losses/gains', () => {
    const result = analyze(candles(200, 0))!;
    expect(result.indicators.rsi).toBe(50);
    expect(result.indicators.ema20).toBe(100);
    expect(result.indicators.ema50).toBe(100);
    expect(result.score).toBe(0);
    expect(result.direction).toBe('neutral');
  });
  it('recognizes rising and falling histories', () => {
    const up = analyze(candles(200, 0.1))!;
    const down = analyze(candles(200, -0.1))!;
    expect(up.indicators.rsi).toBe(100);
    expect(up.direction).toBe('bullish');
    expect(up.indicators.ema20).toBeGreaterThan(up.indicators.ema50);
    expect(down.indicators.rsi).toBe(0);
    expect(down.direction).toBe('bearish');
    expect(up.strength).toBeGreaterThan(0);
    expect(up.strength).toBeLessThanOrEqual(100);
  });
  it('does not let future prices change earlier indicator points', () => {
    const data = candles();
    const original = indicatorSeries(data);
    const modified = indicatorSeries(
      data.map((c, i) =>
        i < 180 ? c : { ...c, open: c.open * 2, close: c.close * 3, high: c.high * 4 },
      ),
    );
    expect(modified.slice(0, 180)).toEqual(original.slice(0, 180));
  });
  it('includes previous-close gaps in ATR', () => {
    const data = candles(100, 0);
    data[99] = { ...data[99], open: 110, high: 111, low: 109, close: 110 };
    expect(indicatorSeries(data)[99].atr).toBeGreaterThan(0.5);
  });
  it('uses abstention boundaries, not a forced prediction', () => {
    expect(directionForScore(0.2)).toBe('neutral');
    expect(directionForScore(-0.2)).toBe('neutral');
    expect(directionForScore(0.21)).toBe('bullish');
    expect(directionForScore(-0.21)).toBe('bearish');
  });
  it('creates correctly oriented ATR reference levels', () => {
    const up = analyze(candles(100, 0.1))!;
    const down = analyze(candles(100, -0.1))!;
    expect(up.target).toBeGreaterThan(up.price);
    expect(up.stop).toBeLessThan(up.price);
    expect(down.target).toBeLessThan(down.price);
    expect(down.stop).toBeGreaterThan(down.price);
  });
});

describe('chronological, fee-adjusted backtest', () => {
  it('executes at the next open and closes the same candle, after warm-up', () => {
    const data = candles();
    const result = backtest(data, 100, 0);
    expect(result.trades.length).toBe(100);
    expect(result.trades[0].entry).toBe(data[200].open);
    expect(result.trades[0].exit).toBe(data[200].close);
    expect(result.trades[0].time).toBe(data[200].time);
    expect(result.accuracy).toBe(100);
    expect(result.baselineAccuracy).toBe(100);
  });
  it('demonstrates that perfect direction accuracy can still lose money after costs', () => {
    const result = backtest(candles(), 200, 10);
    expect(result.accuracy).toBe(100);
    expect(result.totalReturn).toBeLessThan(0);
    expect(result.winRate).toBe(0);
    expect(result.feesPaid).toBeGreaterThan(0);
    expect(result.maxDrawdown).toBeGreaterThan(0);
  });
  it('charges fees on both entry and exit notional', () => {
    const result = backtest(candles(100), 1, 10);
    const trade = result.trades[0];
    expect(trade.netReturn).toBeCloseTo(
      trade.grossReturn - 0.001 * (1 + trade.exit / trade.entry),
      12,
    );
  });
  it('never changes earlier trades when future bars are appended', () => {
    const before = backtest(candles(180), 1000, 1);
    const after = backtest(candles(300), 1000, 1);
    expect(after.trades.slice(0, before.trades.length)).toEqual(before.trades);
  });
  it('skips neutral scores and returns an honest empty result', () => {
    const result = backtest(candles(200, 0));
    expect(result.trades).toEqual([]);
    expect(result.observations).toBe(0);
    expect(result.totalReturn).toBe(0);
    expect(result.profitFactor).toBeNull();
  });
  it('has no observations before the warm-up period', () => {
    expect(backtest(candles(49)).trades).toEqual([]);
  });
  it('scores a bearish one-candle trade without leverage', () => {
    const result = backtest(candles(100, -0.05), 20, 0);
    expect(result.trades.every((t) => t.direction === 'bearish')).toBe(true);
    expect(result.accuracy).toBe(100);
    expect(result.totalReturn).toBeGreaterThan(0);
  });
  it('bounds invalid costs', () => {
    expect(backtest(candles(), 100, -3).feeBps).toBe(0);
    expect(backtest(candles(), 100, 200).feeBps).toBe(100);
    expect(backtest(candles(), 100, NaN).feeBps).toBe(10);
  });
});

describe('accuracy uncertainty', () => {
  it('returns wide intervals for small samples', () => {
    const small = accuracyInterval(60, 10);
    const large = accuracyInterval(60, 1000);
    expect(small[1] - small[0]).toBeGreaterThan(large[1] - large[0]);
    expect(small[0]).toBeLessThan(60);
    expect(small[1]).toBeGreaterThan(60);
  });
  it('is bounded and handles no observations', () => {
    expect(accuracyInterval(0, 10)[0]).toBeGreaterThanOrEqual(0);
    expect(accuracyInterval(100, 10)[1]).toBeLessThanOrEqual(100);
    expect(accuracyInterval(50, 0)).toEqual([0, 100]);
  });
});

it('keeps reference prices positive in an extreme-volatility bearish history', () => {
  const data = candles(300, -0.1).map((c) => ({ ...c, high: 1000 }));
  const result = analyze(data)!;
  expect(result.stop).toBeGreaterThan(0);
  expect(result.target).toBeGreaterThan(0);
  expect(Number.isFinite(result.rewardRisk)).toBe(true);
});

it('converts USDJPY one-candle P&L to account USD at the exit rate', () => {
  const result = backtest(candles(100, 0.05), 1, 1, 10000, 'JPY');
  const trade = result.trades[0];
  expect(trade.grossReturn).toBeCloseTo((trade.exit - trade.entry) / trade.exit, 12);
  expect(trade.netReturn).toBeCloseTo(trade.grossReturn - 0.0002, 12);
});

it('does not hide a short-gap loss beyond the initial capital', () => {
  const data = candles(200, -0.02);
  const c = data[data.length - 1];
  data[data.length - 1] = { ...c, close: c.open * 4, high: c.open * 4 };
  const result = backtest(data, 1, 0);
  expect(result.trades[0].direction).toBe('bearish');
  expect(result.equity.at(-1)!.value).toBe(-20_000);
  expect(result.totalReturn).toBe(-300);
  expect(result.maxDrawdown).toBe(300);
});
