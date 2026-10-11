// Deterministic test-only ledger records, never imported by production code.
import { FIXTURE_NOW } from './live';
import { MINUTE } from '../../src/extension/predictions';
import type { PaperPrediction } from '../../src/extension/types';
const start = FIXTURE_NOW;
export function paperRecord(overrides: Partial<PaperPrediction> = {}): PaperPrediction {
  return {
    schema: 1,
    id: 'fixture-paper-only',
    model: 'technical-v1',
    marketId: 'BTCUSDT',
    timeframe: '1h',
    provider: 'Binance market data',
    action: 'BUY',
    strength: 60,
    createdAt: start,
    entryAsOf: start,
    basisClosedAt: start - 30 * MINUTE,
    entry: 100,
    atr: 1,
    stop: 98.8,
    target: 102.4,
    expiresAt: start + 30 * MINUTE,
    notional: 1000,
    units: 10,
    accountCurrency: 'USDT',
    feeBps: 10,
    pageHost: 'www.tradingview.com',
    status: 'pending',
    nextBarAt: start,
    lastCheckedAt: null,
    checkError: null,
    outcome: null,
    ...overrides,
  };
}
