import type { Candle } from './types';

function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  if (quoted) throw new Error('The CSV contains an unclosed quotation mark.');
  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

export function parseCandleCSV(text: string): {
  candles: Candle[];
  interval: number;
  gaps: number;
} {
  const rows = parseRows(text);
  if (rows.length < 51)
    throw new Error('Please provide at least 50 completed candles, plus a header row.');
  if (rows.length > 100_001)
    throw new Error('This workspace supports up to 100,000 candles per import.');
  const headers = rows[0].map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
  const timeIndex = headers.findIndex((h) => ['timestamp', 'time', 'datetime', 'date'].includes(h));
  const indices = ['open', 'high', 'low', 'close', 'volume'].map((h) => headers.indexOf(h));
  if (timeIndex < 0 || indices.slice(0, 4).some((i) => i < 0)) {
    throw new Error('Missing columns. Use timestamp, open, high, low, close, and optional volume.');
  }
  const candles = rows
    .slice(1)
    .map((row, i): Candle => {
      const label = `Row ${i + 2}`;
      const rawTime = row[timeIndex] ?? '';
      let time: number;
      if (/^\d+(\.\d+)?$/.test(rawTime)) {
        time = Number(rawTime);
        if (time < 100_000_000_000) time *= 1_000;
      } else {
        const explicitUTC = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(rawTime)
          ? `${rawTime.replace(' ', 'T')}Z`
          : rawTime;
        time = Date.parse(explicitUTC);
      }
      if (!Number.isFinite(time) || time <= 0)
        throw new Error(`${label}: timestamp must be an ISO date or Unix seconds/milliseconds.`);
      if (time > Date.now() + 60_000)
        throw new Error(`${label}: future candles cannot be used for historical analysis.`);
      const values = indices.map((index, column) => {
        if (index < 0 && column === 4) return 0;
        const raw = row[index];
        if (!raw?.trim()) throw new Error(`${label}: a price or volume value is empty.`);
        const value = Number(raw);
        if (!Number.isFinite(value))
          throw new Error(`${label}: prices and volume must be finite numbers.`);
        return value;
      });
      const [open, high, low, close, volume] = values;
      if (Math.min(open, high, low, close) <= 0)
        throw new Error(`${label}: prices must be greater than zero.`);
      if (high < Math.max(open, close) || low > Math.min(open, close) || low > high) {
        throw new Error(`${label}: high/low do not contain the open and close prices.`);
      }
      if (volume < 0) throw new Error(`${label}: volume cannot be negative.`);
      return { time, open, high, low, close, volume };
    })
    .sort((a, b) => a.time - b.time);
  const frequencies = new Map<number, number>();
  for (let i = 1; i < candles.length; i++) {
    const diff = candles[i].time - candles[i - 1].time;
    if (!diff)
      throw new Error('Duplicate timestamps found. Keep one candle per opening timestamp.');
    frequencies.set(diff, (frequencies.get(diff) ?? 0) + 1);
  }
  const monthIndex = (time: number) => {
    const date = new Date(time);
    return date.getUTCFullYear() * 12 + date.getUTCMonth();
  };
  const monthOpening = (time: number) => {
    const date = new Date(time);
    return (
      date.getUTCDate() === 1 &&
      date.getUTCHours() === 0 &&
      date.getUTCMinutes() === 0 &&
      date.getUTCSeconds() === 0 &&
      date.getUTCMilliseconds() === 0
    );
  };
  const calendarMonthly =
    candles.every((c) => monthOpening(c.time)) &&
    candles.slice(1).every((c, i) => monthIndex(c.time) > monthIndex(candles[i].time)) &&
    candles.slice(1).filter((c, i) => monthIndex(c.time) - monthIndex(candles[i].time) === 1)
      .length >
      candles.length / 2;
  const interval = calendarMonthly
    ? 2_592_000_000
    : [...frequencies.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  if (interval < 60_000)
    throw new Error('Use candles with a base interval of at least one minute.');
  if (!calendarMonthly && interval >= 28 * 86_400_000 && interval <= 31 * 86_400_000)
    throw new Error(
      'Monthly candles must use calendar-month opening timestamps: the first day of each month at 00:00 UTC. Rolling 30-day bars are not calendar months.',
    );
  const last = candles[candles.length - 1];
  const lastDate = new Date(last.time);
  const lastCloseTime = calendarMonthly
    ? Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth() + 1, 1)
    : last.time + interval;
  if (lastCloseTime > Date.now() + 1_000)
    throw new Error(
      'The final candle is still forming. Export only completed candles, using their opening timestamps.',
    );
  const gaps = candles
    .slice(1)
    .filter((c, i) =>
      calendarMonthly
        ? monthIndex(c.time) - monthIndex(candles[i].time) !== 1
        : c.time - candles[i].time !== interval,
    ).length;
  return { candles, interval, gaps };
}

export function candlesToCSV(candles: Candle[]): string {
  return [
    'timestamp,open,high,low,close,volume',
    ...candles.map(
      (c) =>
        `${new Date(c.time).toISOString()},${c.open},${c.high},${c.low},${c.close},${c.volume}`,
    ),
  ].join('\n');
}
