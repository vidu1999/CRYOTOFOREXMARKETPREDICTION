import type { Candle } from '../lib/types';
import type { LiveMarket, LiveTimeframe, Preferences } from './types';

// Identifiers and display metadata only. NO demo prices, candles or forecasts.
export const LIVE_MARKETS: LiveMarket[] = [
  {
    id: 'BTCUSDT',
    name: 'Bitcoin',
    symbol: 'BTCUSDT',
    base: 'BTC',
    quote: 'USDT',
    category: 'Crypto',
    color: '#efa851',
    decimals: 2,
  },
  {
    id: 'ETHUSDT',
    name: 'Ethereum',
    symbol: 'ETHUSDT',
    base: 'ETH',
    quote: 'USDT',
    category: 'Crypto',
    color: '#a89cee',
    decimals: 2,
  },
  {
    id: 'SOLUSDT',
    name: 'Solana',
    symbol: 'SOLUSDT',
    base: 'SOL',
    quote: 'USDT',
    category: 'Crypto',
    color: '#74dcbd',
    decimals: 3,
  },
  {
    id: 'BNBUSDT',
    name: 'BNB',
    symbol: 'BNBUSDT',
    base: 'BNB',
    quote: 'USDT',
    category: 'Crypto',
    color: '#e3c369',
    decimals: 2,
  },
  {
    id: 'XRPUSDT',
    name: 'XRP',
    symbol: 'XRPUSDT',
    base: 'XRP',
    quote: 'USDT',
    category: 'Crypto',
    color: '#9dacbf',
    decimals: 5,
  },
  {
    id: 'DOGEUSDT',
    name: 'Dogecoin',
    symbol: 'DOGEUSDT',
    base: 'DOGE',
    quote: 'USDT',
    category: 'Crypto',
    color: '#d5b67d',
    decimals: 6,
  },
  {
    id: 'EURUSD',
    name: 'Euro / US Dollar',
    symbol: 'EUR/USD',
    base: 'EUR',
    quote: 'USD',
    category: 'Forex',
    color: '#81a7ee',
    decimals: 5,
  },
  {
    id: 'GBPUSD',
    name: 'Pound / US Dollar',
    symbol: 'GBP/USD',
    base: 'GBP',
    quote: 'USD',
    category: 'Forex',
    color: '#b098eb',
    decimals: 5,
  },
  {
    id: 'USDJPY',
    name: 'US Dollar / Yen',
    symbol: 'USD/JPY',
    base: 'USD',
    quote: 'JPY',
    category: 'Forex',
    color: '#e593a3',
    decimals: 3,
  },
  {
    id: 'AUDUSD',
    name: 'Australian Dollar / US Dollar',
    symbol: 'AUD/USD',
    base: 'AUD',
    quote: 'USD',
    category: 'Forex',
    color: '#83b8d8',
    decimals: 5,
  },
];
export const LIVE_TIMEFRAMES: {
  id: LiveTimeframe;
  label: string;
  duration: number;
  forex: string;
  binance: string;
}[] = [
  { id: '1m', label: '1m', duration: 60_000, forex: '1min', binance: '1m' },
  { id: '5m', label: '5m', duration: 300_000, forex: '5min', binance: '5m' },
  { id: '15m', label: '15m', duration: 900_000, forex: '15min', binance: '15m' },
  { id: '30m', label: '30m', duration: 1_800_000, forex: '30min', binance: '30m' },
  { id: '1h', label: '1H', duration: 3_600_000, forex: '1h', binance: '1h' },
  { id: '2h', label: '2H', duration: 7_200_000, forex: '2h', binance: '2h' },
  { id: '4h', label: '4H', duration: 14_400_000, forex: '4h', binance: '4h' },
  { id: '8h', label: '8H', duration: 28_800_000, forex: '8h', binance: '8h' },
  { id: '12h', label: '12H', duration: 43_200_000, forex: '4h', binance: '12h' },
  { id: '1d', label: '1D', duration: 86_400_000, forex: '1day', binance: '1d' },
  { id: '1w', label: '1W', duration: 604_800_000, forex: '1week', binance: '1w' },
  { id: '1mo', label: '1M', duration: 2_592_000_000, forex: '1month', binance: '1M' },
];
export const DEFAULT_PREFERENCES: Preferences = {
  marketId: 'BTCUSDT',
  timeframe: '1h',
  autoRefresh: true,
  backgroundRefresh: false,
  favorites: ['BTCUSDT', 'ETHUSDT', 'EURUSD'],
  cryptoFeeBps: 10,
  forexFeeBps: 1,
  forexRequestsPerMinute: 6,
};
export function getLiveMarket(id: string): LiveMarket {
  const market = LIVE_MARKETS.find((m) => m.id === id);
  if (!market) throw new Error('Unknown market. Choose a supported symbol.');
  return market;
}
export function normalizePreferences(value: unknown): Preferences {
  const p = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const numeric = (key: string, fallback: number, min: number, max: number) =>
    typeof p[key] === 'number' && Number.isFinite(p[key])
      ? Math.min(max, Math.max(min, p[key] as number))
      : fallback;
  return {
    marketId: LIVE_MARKETS.some((m) => m.id === p.marketId)
      ? (p.marketId as string)
      : DEFAULT_PREFERENCES.marketId,
    timeframe: LIVE_TIMEFRAMES.some((t) => t.id === p.timeframe)
      ? (p.timeframe as LiveTimeframe)
      : DEFAULT_PREFERENCES.timeframe,
    autoRefresh: typeof p.autoRefresh === 'boolean' ? p.autoRefresh : true,
    backgroundRefresh: typeof p.backgroundRefresh === 'boolean' ? p.backgroundRefresh : false,
    favorites: Array.isArray(p.favorites)
      ? [
          ...new Set(
            p.favorites.filter(
              (id): id is string => typeof id === 'string' && LIVE_MARKETS.some((m) => m.id === id),
            ),
          ),
        ].slice(0, 10)
      : [...DEFAULT_PREFERENCES.favorites],
    cryptoFeeBps: numeric('cryptoFeeBps', 10, 0, 100),
    forexFeeBps: numeric('forexFeeBps', 1, 0, 100),
    forexRequestsPerMinute: Math.floor(numeric('forexRequestsPerMinute', 6, 2, 120)),
  };
}
export function liveCandleCloseTime(time: number, timeframe: LiveTimeframe): number {
  if (timeframe === '1mo') {
    const date = new Date(time);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  }
  return time + LIVE_TIMEFRAMES.find((t) => t.id === timeframe)!.duration;
}
export function aggregateTwelveHours(candles: Candle[]): Candle[] {
  const result: Candle[] = [];
  const duration = 43_200_000;
  const groups = new Map<number, Candle[]>();
  for (const c of candles) {
    const start = Math.floor(c.time / duration) * duration;
    const group = groups.get(start) ?? [];
    group.push(c);
    groups.set(start, group);
  }
  for (const [time, group] of groups) {
    if (group.length !== 3 || group.some((c, i) => c.time !== time + i * 14_400_000)) continue;
    result.push({
      time,
      open: group[0].open,
      close: group[2].close,
      high: Math.max(...group.map((c) => c.high)),
      low: Math.min(...group.map((c) => c.low)),
      volume: group.reduce((s, c) => s + c.volume, 0),
    });
  }
  return result;
}
export function livePrice(price: number, market: LiveMarket): string {
  if (!Number.isFinite(price)) return '—';
  const precision =
    price > 0 && price < 0.01
      ? Math.min(12, Math.max(market.decimals, Math.ceil(-Math.log10(price)) + 3))
      : market.decimals;
  return price.toLocaleString('en-US', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}
export function liveTimestamp(time: number | null, compact = false): string {
  if (time === null) return '—';
  return (
    new Date(time).toLocaleString('en-GB', {
      timeZone: 'UTC',
      day: '2-digit',
      month: 'short',
      year: compact ? undefined : 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) + ' UTC'
  );
}
