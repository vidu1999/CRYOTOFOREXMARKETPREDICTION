import type { Asset, Candle, ImportedMarket, Timeframe } from './types';

export const ASSETS: Asset[] = [
  {
    id: 'btc',
    name: 'Bitcoin',
    symbol: 'BTC',
    pair: 'BTC / USD',
    category: 'Crypto',
    color: '#f5a44b',
    mark: '₿',
    decimals: 2,
    referencePrice: 67482.5,
    volatility: 0.0032,
    seed: 19,
  },
  {
    id: 'eth',
    name: 'Ethereum',
    symbol: 'ETH',
    pair: 'ETH / USD',
    category: 'Crypto',
    color: '#a59bff',
    mark: 'Ξ',
    decimals: 2,
    referencePrice: 3518.62,
    volatility: 0.004,
    seed: 42,
  },
  {
    id: 'sol',
    name: 'Solana',
    symbol: 'SOL',
    pair: 'SOL / USD',
    category: 'Crypto',
    color: '#78dec7',
    mark: '≋',
    decimals: 2,
    referencePrice: 147.85,
    volatility: 0.0048,
    seed: 84,
  },
  {
    id: 'eurusd',
    name: 'Euro / US Dollar',
    symbol: 'EUR',
    pair: 'EUR / USD',
    category: 'Forex',
    color: '#6698f8',
    mark: '€',
    decimals: 5,
    referencePrice: 1.08642,
    volatility: 0.00045,
    seed: 108,
  },
  {
    id: 'gbpusd',
    name: 'British Pound / US Dollar',
    symbol: 'GBP',
    pair: 'GBP / USD',
    category: 'Forex',
    color: '#b299ee',
    mark: '£',
    decimals: 5,
    referencePrice: 1.27485,
    volatility: 0.00058,
    seed: 215,
  },
  {
    id: 'usdjpy',
    name: 'US Dollar / Japanese Yen',
    symbol: 'JPY',
    pair: 'USD / JPY',
    category: 'Forex',
    color: '#f18b9e',
    mark: '¥',
    decimals: 3,
    referencePrice: 149.852,
    volatility: 0.00051,
    seed: 316,
  },
  {
    id: 'bnb',
    name: 'BNB',
    symbol: 'BNB',
    pair: 'BNB / USD',
    category: 'Crypto',
    color: '#efcc66',
    mark: '◇',
    decimals: 2,
    referencePrice: 589.27,
    volatility: 0.0035,
    seed: 63,
  },
  {
    id: 'audusd',
    name: 'Australian Dollar / US Dollar',
    symbol: 'AUD',
    pair: 'AUD / USD',
    category: 'Forex',
    color: '#6bb4dd',
    mark: 'A$',
    decimals: 5,
    referencePrice: 0.66254,
    volatility: 0.00056,
    seed: 414,
  },
];

export const TIMEFRAMES: { id: Timeframe; label: string; duration: number; name: string }[] = [
  { id: '1m', label: '1m', duration: 60_000, name: '1-minute' },
  { id: '5m', label: '5m', duration: 300_000, name: '5-minute' },
  { id: '15m', label: '15m', duration: 900_000, name: '15-minute' },
  { id: '1h', label: '1H', duration: 3_600_000, name: '1-hour' },
  { id: '4h', label: '4H', duration: 14_400_000, name: '4-hour' },
  { id: '1d', label: '1D', duration: 86_400_000, name: 'daily' },
  { id: '1w', label: '1W', duration: 604_800_000, name: 'weekly' },
  { id: '1mo', label: '1M', duration: 2_592_000_000, name: 'monthly' },
];

// Fixed, reproducible synthetic fixtures — never represented as exchange quotes.
export const DEMO_AS_OF = Date.UTC(2026, 9, 11, 0, 0, 0);
const HOUR = 3_600_000;
const MINUTE = 60_000;
const cache = new Map<string, { hourly: Candle[]; minute: Candle[] }>();
const seriesCache = new Map<string, Candle[]>();

function randomGenerator(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildFixture(asset: Asset) {
  const cached = cache.get(asset.id);
  if (cached) return cached;
  const rng = randomGenerator(asset.seed);
  const count = 24 * 1_825; // Five years for meaningful weekly/monthly indicator warm-up.
  const hourly: Candle[] = [];
  let price = asset.referencePrice;
  for (let i = 0; i < count; i++) {
    const cyclical = Math.sin(i / 48 + asset.seed) * 0.08 + Math.sin(i / 430) * 0.12;
    const recentTrend =
      i > count - 56 ? (asset.id === 'sol' || asset.id === 'usdjpy' ? -0.17 : 0.17) : 0;
    const ret = ((rng() - 0.5) * 1.8 + cyclical + recentTrend) * asset.volatility;
    const open = price;
    price = open * Math.exp(ret);
    const wick = (0.14 + rng() * 0.48) * asset.volatility;
    hourly.push({
      time: DEMO_AS_OF - (count - i) * HOUR,
      open,
      close: price,
      high: Math.max(open, price) * (1 + wick),
      low: Math.min(open, price) * (1 - wick * (0.4 + rng() * 0.65)),
      volume:
        (asset.category === 'Crypto' ? 500 : 18_000) *
        (0.3 + rng() * 1.5) *
        (1 + Math.abs(ret) / asset.volatility),
    });
  }
  const factor = asset.referencePrice / hourly[hourly.length - 1].close;
  hourly.forEach((c) => {
    c.open *= factor;
    c.high *= factor;
    c.low *= factor;
    c.close *= factor;
  });

  // Brownian bridges preserve hourly endpoints. Rebuild fine-grained hours' extrema
  // so minute and higher-timeframe aggregates share the same source observations.
  const minute: Candle[] = [];
  for (const hour of hourly.slice(-24 * 7)) {
    const deltas: number[] = [];
    let total = 0;
    for (let m = 0; m < 60; m++) {
      total += (rng() - 0.5) * asset.volatility * 0.22;
      deltas.push(total);
    }
    const logMove = Math.log(hour.close / hour.open);
    let prev = hour.open;
    let high = -Infinity;
    let low = Infinity;
    for (let m = 0; m < 60; m++) {
      const progress = (m + 1) / 60;
      const close =
        m === 59
          ? hour.close
          : hour.open * Math.exp(logMove * progress + deltas[m] - total * progress);
      const wick = rng() * asset.volatility * 0.045;
      const candle = {
        time: hour.time + m * MINUTE,
        open: prev,
        close,
        high: Math.max(prev, close) * (1 + wick),
        low: Math.min(prev, close) * (1 - wick),
        volume: (hour.volume / 60) * (0.5 + rng()),
      };
      minute.push(candle);
      high = Math.max(high, candle.high);
      low = Math.min(low, candle.low);
      prev = close;
    }
    hour.high = high;
    hour.low = low;
    hour.volume = minute.slice(-60).reduce((sum, c) => sum + c.volume, 0);
  }
  const result = { hourly, minute };
  cache.set(asset.id, result);
  return result;
}

export function bucketStart(time: number, timeframe: Timeframe): number {
  if (timeframe === '1mo') {
    const d = new Date(time);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  }
  if (timeframe === '1w') {
    const mondayEpoch = Date.UTC(1970, 0, 5);
    return Math.floor((time - mondayEpoch) / 604_800_000) * 604_800_000 + mondayEpoch;
  }
  const duration = TIMEFRAMES.find((t) => t.id === timeframe)!.duration;
  return Math.floor(time / duration) * duration;
}

export function candleCloseTime(time: number, timeframe: Timeframe) {
  if (timeframe === '1mo') {
    const d = new Date(time);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }
  return time + TIMEFRAMES.find((t) => t.id === timeframe)!.duration;
}

export function aggregateCandles(
  candles: Candle[],
  timeframe: Timeframe,
  sourceInterval: number,
  excludePartial = true,
): Candle[] {
  const groups: { candle: Candle; first: number; last: number; count: number }[] = [];
  for (const c of candles) {
    const time = bucketStart(c.time, timeframe);
    let group = groups[groups.length - 1];
    if (!group || group.candle.time !== time) {
      group = { candle: { ...c, time }, first: c.time, last: c.time, count: 1 };
      groups.push(group);
    } else {
      group.candle.high = Math.max(group.candle.high, c.high);
      group.candle.low = Math.min(group.candle.low, c.low);
      group.candle.close = c.close;
      group.candle.volume += c.volume;
      group.last = c.time;
      group.count++;
    }
  }
  return groups
    .filter((g) => {
      if (!excludePartial) return true;
      const end = candleCloseTime(g.candle.time, timeframe);
      // Exclude incomplete or gapped buckets, including partial first and last bars.
      return (
        g.first === g.candle.time &&
        g.last + sourceInterval === end &&
        g.count * sourceInterval === end - g.candle.time
      );
    })
    .map((g) => g.candle);
}

export function getDemoCandles(asset: Asset, timeframe: Timeframe): Candle[] {
  const key = `${asset.id}:${timeframe}`;
  const saved = seriesCache.get(key);
  if (saved) return saved;
  const fixture = buildFixture(asset);
  const fine = TIMEFRAMES.find((t) => t.id === timeframe)!.duration < HOUR;
  const result = aggregateCandles(
    fine ? fixture.minute : fixture.hourly,
    timeframe,
    fine ? MINUTE : HOUR,
  ).slice(-1_200);
  seriesCache.set(key, result);
  return result;
}

export function getCandles(
  asset: Asset,
  timeframe: Timeframe,
  imported: ImportedMarket | null,
): Candle[] {
  if (imported && asset.id === imported.asset.id) {
    const duration = TIMEFRAMES.find((t) => t.id === timeframe)!.duration;
    if (duration < imported.interval) return [];
    if (duration === imported.interval) return imported.candles.slice(-5_000);
    return aggregateCandles(imported.candles, timeframe, imported.interval).slice(-5_000);
  }
  return getDemoCandles(asset, timeframe);
}

export function formatPrice(value: number, asset: Asset, dollar = false): string {
  if (!Number.isFinite(value)) return '—';
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: asset.decimals,
    maximumFractionDigits: asset.decimals,
  });
  return dollar && asset.category === 'Crypto' ? `$${formatted}` : formatted;
}

export function money(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function percent(value: number, decimals = 2): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}

export function formatTime(time: number, timeframe: Timeframe, compact = false): string {
  const date = new Date(time);
  if (['1m', '5m', '15m', '1h'].includes(timeframe)) {
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    });
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: compact ? undefined : 'numeric',
    year: timeframe === '1mo' ? '2-digit' : undefined,
    timeZone: 'UTC',
  });
}

export function quoteChange(candles: Candle[], bars = 24): number {
  if (candles.length < 2) return 0;
  const base = candles[Math.max(0, candles.length - bars - 1)].close;
  return (candles[candles.length - 1].close / base - 1) * 100;
}

/** Normalize pair separators so EUR/USD, EUR USD and EURUSD find the same market. */
export function marketMatches(asset: Asset, query: string): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const needle = normalize(query);
  return (
    !needle ||
    [asset.pair, asset.name, asset.symbol, asset.category].some((value) =>
      normalize(value).includes(needle),
    )
  );
}
