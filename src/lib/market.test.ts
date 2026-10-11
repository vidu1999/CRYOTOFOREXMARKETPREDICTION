import { describe, expect, it } from 'vitest';
import {
  aggregateCandles,
  ASSETS,
  bucketStart,
  DEMO_AS_OF,
  getDemoCandles,
  marketMatches,
  TIMEFRAMES,
} from './market';
import type { Candle } from './types';

const minuteCandles = (count: number, offset = 0): Candle[] =>
  Array.from({ length: count }, (_, i) => ({
    time: Date.UTC(2026, 0, 1) + (i + offset) * 60_000,
    open: 100 + i,
    close: 101 + i,
    high: 102 + i,
    low: 99 + i,
    volume: 10,
  }));

describe('completed UTC OHLCV aggregation', () => {
  it('preserves open, high, low, close, and summed volume', () => {
    expect(aggregateCandles(minuteCandles(5), '5m', 60_000)[0]).toEqual({
      time: Date.UTC(2026, 0, 1),
      open: 100,
      close: 105,
      high: 106,
      low: 99,
      volume: 50,
    });
  });
  it('excludes unfinished final buckets', () => {
    expect(aggregateCandles(minuteCandles(8), '5m', 60_000)).toHaveLength(1);
  });
  it('excludes incomplete first buckets', () => {
    const result = aggregateCandles(minuteCandles(11, 2), '5m', 60_000);
    expect(result).toHaveLength(1);
    expect(result[0].time).toBe(Date.UTC(2026, 0, 1, 0, 5));
  });
  it('does not invent prices for gaps', () => {
    const data = minuteCandles(10).filter((_, i) => i !== 2);
    const result = aggregateCandles(data, '5m', 60_000);
    expect(result).toHaveLength(1);
    expect(result[0].time).toBe(Date.UTC(2026, 0, 1, 0, 5));
  });
  it('anchors weekly bars to UTC Monday', () => {
    const monday = bucketStart(Date.UTC(2026, 9, 11), '1w');
    expect(new Date(monday).getUTCDay()).toBe(1);
    expect(monday).toBe(Date.UTC(2026, 9, 5));
  });
  it('aggregates calendar months rather than rolling thirty-day periods', () => {
    const january = Array.from({ length: 31 }, (_, i) => ({
      ...minuteCandles(1)[0],
      time: Date.UTC(2026, 0, i + 1),
    }));
    expect(aggregateCandles(january, '1mo', 86_400_000)).toHaveLength(1);
    expect(bucketStart(Date.UTC(2026, 1, 28, 12), '1mo')).toBe(Date.UTC(2026, 1, 1));
  });
});

describe('explicit, reproducible demo fixtures', () => {
  it('provides positive, valid histories for all requested timeframes', () => {
    for (const tf of TIMEFRAMES) {
      const data = getDemoCandles(ASSETS[0], tf.id);
      expect(data.length).toBeGreaterThanOrEqual(50);
      for (const c of data) {
        expect(c.open).toBeGreaterThan(0);
        expect(c.close).toBeGreaterThan(0);
        expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close));
        expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close));
        expect(c.time).toBeLessThan(DEMO_AS_OF);
      }
    }
  });
  it('keeps the last minute and last hourly closes at the fixture reference price', () => {
    const minute = getDemoCandles(ASSETS[0], '1m');
    const hourly = getDemoCandles(ASSETS[0], '1h');
    expect(minute.at(-1)!.close).toBeCloseTo(ASSETS[0].referencePrice, 8);
    expect(hourly.at(-1)!.close).toBeCloseTo(ASSETS[0].referencePrice, 8);
  });
  it('reconciles fine-grained data with hourly bars', () => {
    const fine = aggregateCandles(getDemoCandles(ASSETS[0], '1m'), '1h', 60_000);
    const hourly = getDemoCandles(ASSETS[0], '1h').slice(-fine.length);
    fine.forEach((c, i) => {
      expect(c.open).toBe(hourly[i].open);
      expect(c.close).toBe(hourly[i].close);
      expect(c.high).toBe(hourly[i].high);
      expect(c.low).toBe(hourly[i].low);
      expect(c.volume).toBeCloseTo(hourly[i].volume, 8);
    });
  });
});

describe('market search', () => {
  it('handles common compact and separated currency-pair queries', () => {
    expect(marketMatches(ASSETS[3], 'EUR/USD')).toBe(true);
    expect(marketMatches(ASSETS[3], 'eurusd')).toBe(true);
    expect(marketMatches(ASSETS[0], 'btc usd')).toBe(true);
    expect(marketMatches(ASSETS[0], 'Bitcoin')).toBe(true);
    expect(marketMatches(ASSETS[0], 'USDJPY')).toBe(false);
  });
});
