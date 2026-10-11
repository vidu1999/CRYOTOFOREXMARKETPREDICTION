export type AssetClass = 'Crypto' | 'Forex';
export interface Asset {
  id: string;
  name: string;
  symbol: string;
  pair: string;
  category: AssetClass;
  color: string;
  mark: string;
  decimals: number;
  referencePrice: number;
  volatility: number;
  seed: number;
}
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w' | '1mo';
export type Direction = 'bullish' | 'bearish' | 'neutral';
export interface IndicatorPoint {
  ema20: number;
  ema50: number;
  rsi: number;
  atr: number;
  macd: number;
  signal: number;
  histogram: number;
  score: number;
}
export interface Analysis {
  direction: Direction;
  strength: number;
  score: number;
  indicators: IndicatorPoint;
  price: number;
  change: number;
  target: number;
  stop: number;
  rewardRisk: number;
  aligned: number;
  reasons: { label: string; value: string; positive: boolean }[];
  points: IndicatorPoint[];
}
export interface Trade {
  time: number;
  direction: 'bullish' | 'bearish';
  entry: number;
  exit: number;
  grossReturn: number;
  netReturn: number;
  pnl: number;
  equity: number;
  correct: boolean;
}
export interface BacktestResult {
  trades: Trade[];
  accuracy: number;
  baselineAccuracy: number;
  winRate: number;
  totalReturn: number;
  maxDrawdown: number;
  profitFactor: number | null;
  equity: { time: number; value: number }[];
  observations: number;
  eligibleBars: number;
  abstentions: number;
  feesPaid: number;
  feeBps: number;
}
export interface ImportedMarket {
  asset: Asset;
  candles: Candle[];
  interval: number;
  fileName: string;
  gaps: number;
}
export interface PriceAlert {
  id: string;
  assetId: string;
  condition: 'above' | 'below';
  price: number;
  createdAt: number;
}
export type Page = 'overview' | 'signals' | 'backtesting' | 'risk' | 'watchlist';
export interface MarketSnapshot {
  asset: Asset;
  price: number;
  change: number;
  candles: Candle[];
  analysis: Analysis | null;
}
export interface TimeframeAnalysis {
  timeframe: Timeframe;
  candles: Candle[];
  analysis: Analysis | null;
}
