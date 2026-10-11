import type { Analysis, BacktestResult, Candle } from '../lib/types';

export type LiveTimeframe =
  '1m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '8h' | '12h' | '1d' | '1w' | '1mo';
export interface LiveMarket {
  id: string;
  name: string;
  symbol: string;
  base: string;
  quote: 'USDT' | 'USD' | 'JPY';
  category: 'Crypto' | 'Forex';
  color: string;
  decimals: number;
}
export interface Preferences {
  marketId: string;
  timeframe: LiveTimeframe;
  autoRefresh: boolean;
  backgroundRefresh: boolean;
  favorites: string[];
  cryptoFeeBps: number;
  forexFeeBps: number;
  forexRequestsPerMinute: number;
}
export interface PublicSettings {
  preferences: Preferences;
  hasForexKey: boolean;
}
export interface Quote {
  price: number;
  changePercent: number | null;
  asOf: number;
  marketOpen: boolean | null;
}
export interface FeedHistory {
  quote: Quote;
  candles: Candle[];
  provider: 'Binance market data' | 'Twelve Data';
  receivedAt: number;
  candleNote: string;
}
export interface LiveSnapshot extends FeedHistory {
  marketId: string;
  timeframe: LiveTimeframe;
  analysis: Analysis | null;
  backtest: BacktestResult;
  candleCloseAt: number | null;
}
export type FeedFailureCode =
  'SETUP_REQUIRED' | 'NETWORK' | 'RATE_LIMIT' | 'PROVIDER' | 'INVALID_DATA' | 'CLOCK_SKEW';
export interface FeedFailure {
  code: FeedFailureCode;
  message: string;
  at: number;
  retryAfterSeconds?: number;
  marketId: string;
  timeframe: LiveTimeframe;
}
export interface WorkspaceState {
  settings: PublicSettings;
  snapshot: LiveSnapshot | null;
  failure: FeedFailure | null;
}
export type ExtensionMessage =
  | { type: 'GET_STATE' }
  | { type: 'REFRESH'; force?: boolean }
  | { type: 'UPDATE_PREFERENCES'; preferences: Partial<Preferences> }
  | { type: 'GET_OPTIONS' }
  | { type: 'SAVE_FOREX_KEY'; key: string }
  | { type: 'TEST_FOREX_KEY'; key: string }
  | { type: 'CLEAR_CACHE' };
export type ExtensionReply =
  | { ok: true; state: WorkspaceState; forexKey?: string; testMessage?: string }
  | { ok: false; error: string };
