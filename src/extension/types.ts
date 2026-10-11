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
  predictionAutoCheck: boolean;
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
  predictions?: PaperPrediction[];
}
export type ExtensionMessage =
  | { type: 'GET_STATE' }
  | { type: 'REFRESH'; force?: boolean }
  | { type: 'UPDATE_PREFERENCES'; preferences: Partial<Preferences> }
  | { type: 'GET_OPTIONS' }
  | { type: 'SAVE_FOREX_KEY'; key: string }
  | { type: 'TEST_FOREX_KEY'; key: string }
  | { type: 'CLEAR_CACHE' }
  | { type: 'READ_ACTIVE_PAGE' }
  | {
      type: 'RECORD_PREDICTION';
      marketId: string;
      timeframe: LiveTimeframe;
      notional: number;
      confirmed: boolean;
      pageHost?: string;
    }
  | { type: 'CHECK_PREDICTIONS' }
  | { type: 'CLEAR_PREDICTIONS'; confirmed: boolean };
export type ExtensionReply =
  | {
      ok: true;
      state: WorkspaceState;
      forexKey?: string;
      testMessage?: string;
      pageReading?: PageReading;
      prediction?: PaperPrediction;
    }
  | { ok: false; error: string };

export interface PageReading {
  host: string;
  title: string;
  marketId: string | null;
  timeframe: LiveTimeframe | null;
  readAt: number;
  warning: string;
}
export type PredictionAction = 'BUY' | 'SELL' | 'WAIT';
export type PredictionStatus = 'pending' | 'win' | 'loss' | 'flat' | 'ambiguous' | 'abstained';
export interface PredictionOutcome {
  reason:
    | 'target'
    | 'stop'
    | 'target_gap'
    | 'stop_gap'
    | 'expiry'
    | 'both_levels'
    | 'entry_minute'
    | 'missing_history';
  assessedAt: number;
  barStart: number;
  barEnd: number;
  exitPrice: number | null;
  grossPnl: number | null;
  fees: number | null;
  netPnl: number | null;
  returnPercent: number | null;
}
export interface PaperPrediction {
  schema: 1;
  id: string;
  model: 'technical-v1';
  marketId: string;
  timeframe: LiveTimeframe;
  provider: FeedHistory['provider'];
  action: PredictionAction;
  strength: number;
  createdAt: number;
  entryAsOf: number;
  basisClosedAt: number;
  entry: number;
  atr: number;
  stop: number | null;
  target: number | null;
  expiresAt: number;
  notional: number;
  units: number;
  accountCurrency: 'USDT' | 'USD';
  feeBps: number;
  pageHost: string | null;
  status: PredictionStatus;
  nextBarAt: number;
  lastCheckedAt: number | null;
  checkError: string | null;
  outcome: PredictionOutcome | null;
}
