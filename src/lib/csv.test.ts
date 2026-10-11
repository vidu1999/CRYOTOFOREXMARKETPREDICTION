import { describe, expect, it, vi } from 'vitest';
import { candlesToCSV, parseCandleCSV } from './csv';

const start = Date.UTC(2026, 0, 1);
function csv(count = 60) {
  return (
    'timestamp,open,high,low,close,volume\n' +
    Array.from(
      { length: count },
      (_, i) => `${new Date(start + i * 3_600_000).toISOString()},100,102,99,101,500`,
    ).join('\n')
  );
}

describe('local OHLCV CSV validation', () => {
  it('imports ISO timestamps and infers hourly intervals', () => {
    const data = parseCandleCSV(csv());
    expect(data.candles).toHaveLength(60);
    expect(data.interval).toBe(3_600_000);
    expect(data.gaps).toBe(0);
  });
  it('roundtrips export without precision loss', () => {
    const first = parseCandleCSV(csv());
    expect(parseCandleCSV(candlesToCSV(first.candles))).toEqual(first);
  });
  it('handles BOM, quoted values, uppercase columns, CRLF, and optional volume', () => {
    const text =
      '\uFEFF"TIME","OPEN","HIGH","LOW","CLOSE"\r\n' +
      Array.from(
        { length: 60 },
        (_, i) => `"${(start + i * 3_600_000) / 1000}","100","102","99","101"`,
      ).join('\r\n');
    const data = parseCandleCSV(text);
    expect(data.candles[0].volume).toBe(0);
    expect(data.candles[0].time).toBe(start);
  });
  it('sorts rows chronologically', () => {
    const lines = csv().split('\n');
    const data = parseCandleCSV([lines[0], ...lines.slice(1).reverse()].join('\n'));
    expect(data.candles[0].time).toBe(start);
  });
  it('detects rather than interpolates interval gaps', () => {
    const lines = csv()
      .split('\n')
      .filter((_, i) => i !== 10);
    const data = parseCandleCSV(lines.join('\n'));
    expect(data.gaps).toBe(1);
    expect(data.candles).toHaveLength(59);
  });
  it('rejects missing headers and insufficient history', () => {
    expect(() => parseCandleCSV(csv(49))).toThrow('at least 50');
    expect(() => parseCandleCSV(csv().replace('close', 'missing'))).toThrow('Missing columns');
  });
  it('rejects duplicate timestamps', () => {
    const lines = csv().split('\n');
    lines[2] = lines[1];
    expect(() => parseCandleCSV(lines.join('\n'))).toThrow('Duplicate');
  });
  it('rejects malformed high/low candles', () => {
    expect(() => parseCandleCSV(csv().replace(',102,99,101,', ',100,99,101,'))).toThrow('high/low');
  });
  it('rejects nonpositive prices, nonfinite values, empty prices, and negative volume', () => {
    expect(() => parseCandleCSV(csv().replace(',100,102,99,101,', ',0,102,99,101,'))).toThrow(
      'greater than zero',
    );
    expect(() => parseCandleCSV(csv().replace(',100,102,99,101,', ',NaN,102,99,101,'))).toThrow(
      'finite',
    );
    expect(() => parseCandleCSV(csv().replace(',100,102,99,101,', ',,102,99,101,'))).toThrow(
      'empty',
    );
    expect(() => parseCandleCSV(csv().replace(',500', ',-5'))).toThrow('volume cannot');
  });
  it('rejects a future timestamp and an unclosed quote', () => {
    expect(() =>
      parseCandleCSV(csv().replace(new Date(start).toISOString(), '2099-01-01T00:00:00Z')),
    ).toThrow('future');
    expect(() => parseCandleCSV(csv() + '\n"')).toThrow('unclosed');
  });
  it('interprets timezone-free ISO datetimes as UTC', () => {
    const data = parseCandleCSV(csv().replaceAll('.000Z', ''));
    expect(data.candles[0].time).toBe(start);
  });
});

describe('closed and calendar-month candle handling', () => {
  const monthlyCSV = () =>
    'timestamp,open,high,low,close,volume\n' +
    Array.from(
      { length: 60 },
      (_, i) => `${new Date(Date.UTC(2020, i, 1)).toISOString()},100,102,99,101,100`,
    ).join('\n');
  it('recognizes native calendar months with no false gap warnings', () => {
    const result = parseCandleCSV(monthlyCSV());
    expect(result.interval).toBe(2_592_000_000);
    expect(result.gaps).toBe(0);
    expect(result.candles).toHaveLength(60);
  });
  it('reports a missing month without filling it', () => {
    const lines = monthlyCSV()
      .split('\n')
      .filter((_, i) => i !== 25);
    const result = parseCandleCSV(lines.join('\n'));
    expect(result.gaps).toBe(1);
    expect(result.candles).toHaveLength(59);
  });
  it('rejects a still-forming bar even when its opening timestamp is in the past', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start + 59.5 * 3_600_000);
    try {
      expect(() => parseCandleCSV(csv())).toThrow('still forming');
    } finally {
      clock.mockRestore();
    }
  });
});

it('does not relabel rolling thirty-day bars as calendar months', () => {
  const rolling =
    'timestamp,open,high,low,close\n' +
    Array.from(
      { length: 60 },
      (_, i) =>
        `${new Date(Date.UTC(2020, 0, 1) + i * 30 * 86_400_000).toISOString()},100,102,99,101`,
    ).join('\n');
  expect(() => parseCandleCSV(rolling)).toThrow('Rolling 30-day bars');
});
