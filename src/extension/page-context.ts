import { LIVE_MARKETS, LIVE_TIMEFRAMES } from './catalog';
import type { LiveTimeframe, PageReading } from './types';

export function parsePageTimeframe(value: string): LiveTimeframe | null {
  const v = value.trim();
  const aliases: Record<string, LiveTimeframe> = {
    '1': '1m',
    '5': '5m',
    '15': '15m',
    '30': '30m',
    '60': '1h',
    '120': '2h',
    '240': '4h',
    '480': '8h',
    '720': '12h',
    D: '1d',
    '1D': '1d',
    W: '1w',
    '1W': '1w',
    M: '1mo',
    '1M': '1mo',
    '1month': '1mo',
    '1day': '1d',
    '1week': '1w',
  };
  if (Object.hasOwn(aliases, v)) return aliases[v];
  const canonical = v.replace(/H$/, 'h').replace(/min$/, 'm');
  return LIVE_TIMEFRAMES.find((t) => t.id === canonical)?.id ?? null;
}
export function parsePageReading(
  input: { host: string; title: string; symbols: string[]; intervals: string[] },
  now = Date.now(),
): PageReading {
  const host = safePageHost(input.host),
    title = input.title.slice(0, 180);
  const text = [title, ...input.symbols.slice(0, 8)].join(' ').toUpperCase();
  const matches = LIVE_MARKETS.filter((m) =>
    new RegExp(`(?:^|[^A-Z0-9])${m.base}\\s*(?:[/_-]\\s*)?${m.quote}(?:$|[^A-Z0-9])`).test(text),
  );
  const derivative =
    /(?:USDT|USD)[._]P\b|PERPETUAL|(?:^|[^A-Z])PERP(?:$|[^A-Z])|\bFUTURES\b|\bCFD\b/.test(text);
  const marketId = matches.length === 1 && !derivative ? matches[0].id : null;
  const titleIntervals = [
    ...title.matchAll(
      /(?:^|[^A-Za-z0-9])((?:1mo|1month|1min|5min|15min|30min|1m|5m|15m|30m|1h|2h|4h|8h|12h|1d|1w))(?=$|[^A-Za-z0-9])/gi,
    ),
  ].map((m) => m[1]);
  const timeframes = [
    ...new Set(
      [...input.intervals.slice(0, 8), ...titleIntervals]
        .map(parsePageTimeframe)
        .filter((t): t is LiveTimeframe => t !== null),
    ),
  ];
  return {
    host,
    title,
    marketId,
    timeframe: timeframes.length === 1 ? timeframes[0] : null,
    readAt: now,
    warning: derivative
      ? 'Derivative/CFD chart detected. This extension uses spot/reference feeds, not that contract. Choose a matching supported reference market explicitly.'
      : matches.length !== 1
        ? 'No unique supported symbol detected. Choose the market manually; BTC/USD is not silently converted to BTC/USDT.'
        : 'Confirm the symbol and timeframe. Results use our provider reference prices, not the page’s broker fills.',
  };
}
export function safePageHost(value: unknown): string {
  return typeof value === 'string' && /^(?:[a-z0-9-]+\.)*[a-z0-9-]+(?::\d+)?$/i.test(value)
    ? value.toLowerCase().slice(0, 180)
    : '';
}
export async function readActivePage(): Promise<PageReading> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined || !tab.url || !/^https?:\/\//.test(tab.url))
    throw new Error(
      'Open a normal chart website, then click the Vector toolbar icon to grant temporary page access. Browser/extension pages cannot be analyzed.',
    );
  let results: chrome.scripting.InjectionResult[];
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // Isolated, user-triggered metadata read: no body HTML, balances, cookies or screenshots.
        const query = new URL(location.href).searchParams;
        const symbolLabel =
          document.querySelector('[data-name="header-toolbar-symbol-search"]')?.textContent ?? '';
        const intervalLabel =
          document.querySelector('[data-name="header-toolbar-intervals"]')?.textContent ?? '';
        return {
          host: location.hostname,
          title: document.title.slice(0, 180),
          symbols: ['symbol', 'pair', 'market']
            .map((k) => (query.get(k) ?? '').slice(0, 80))
            .concat(symbolLabel.slice(0, 80)),
          intervals: ['interval', 'timeframe', 'tf']
            .map((k) => (query.get(k) ?? '').slice(0, 20))
            .concat(intervalLabel.trim().slice(0, 20)),
        };
      },
    });
  } catch {
    throw new Error(
      'Temporary page access is unavailable. Return to your chart and reopen Vector from its toolbar icon. No permanent all-sites access is requested.',
    );
  }
  const result = results[0]?.result as
    { host?: unknown; title?: unknown; symbols?: unknown; intervals?: unknown } | undefined;
  if (
    !result ||
    typeof result.host !== 'string' ||
    typeof result.title !== 'string' ||
    !Array.isArray(result.symbols) ||
    !Array.isArray(result.intervals)
  )
    throw new Error('Chart metadata could not be read. Choose the market/timeframe manually.');
  return parsePageReading({
    host: result.host,
    title: result.title,
    symbols: result.symbols.filter((v): v is string => typeof v === 'string'),
    intervals: result.intervals.filter((v): v is string => typeof v === 'string'),
  });
}
