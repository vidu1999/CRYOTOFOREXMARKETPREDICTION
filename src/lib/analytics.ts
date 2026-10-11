import type { Analysis, BacktestResult, Candle, Direction, IndicatorPoint, Trade } from './types';

export const WARMUP = 50;
export const SIGNAL_THRESHOLD = 0.2;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Causal indicators: point i depends only on candles 0..i. */
export function indicatorSeries(candles: Candle[]): IndicatorPoint[] {
  if (!candles.length) return [];
  let ema20 = candles[0].close;
  let ema50 = ema20;
  let ema12 = ema20;
  let ema26 = ema20;
  let macdSignal = 0;
  let averageGain = 0;
  let averageLoss = 0;
  let atr = candles[0].high - candles[0].low;
  return candles.map((c, i) => {
    const prev = i ? candles[i - 1].close : c.close;
    const difference = c.close - prev;
    const gain = Math.max(0, difference);
    const loss = Math.max(0, -difference);
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev));
    if (i > 0) {
      ema20 += (2 / 21) * (c.close - ema20);
      ema50 += (2 / 51) * (c.close - ema50);
      ema12 += (2 / 13) * (c.close - ema12);
      ema26 += (2 / 27) * (c.close - ema26);
      if (i <= 14) {
        averageGain = (averageGain * (i - 1) + gain) / i;
        averageLoss = (averageLoss * (i - 1) + loss) / i;
        atr = (atr * (i - 1) + tr) / i;
      } else {
        averageGain = (averageGain * 13 + gain) / 14;
        averageLoss = (averageLoss * 13 + loss) / 14;
        atr = (atr * 13 + tr) / 14;
      }
    }
    const rsi =
      averageLoss === 0
        ? averageGain === 0
          ? 50
          : 100
        : 100 - 100 / (1 + averageGain / averageLoss);
    const macd = ema12 - ema26;
    macdSignal += (2 / 10) * (macd - macdSignal);
    const histogram = macd - macdSignal;
    const scale = Math.max(atr, c.close * 0.000001);
    const momentum = (c.close - candles[Math.max(0, i - 3)].close) / scale;
    // Explainable technical ensemble, NOT a trained model or calibrated probability.
    const trendComponent = Math.tanh(((ema20 - ema50) / scale) * 0.32);
    const macdComponent = Math.tanh((histogram / scale) * 4);
    const momentumComponent = Math.tanh(momentum * 0.6);
    const score = clamp(
      trendComponent * 0.5 +
        macdComponent * 0.15 +
        ((rsi - 50) / 50) * 0.2 +
        momentumComponent * 0.15,
      -1,
      1,
    );
    return { ema20, ema50, rsi, atr, macd, signal: macdSignal, histogram, score };
  });
}

export function directionForScore(score: number): Direction {
  return score > SIGNAL_THRESHOLD ? 'bullish' : score < -SIGNAL_THRESHOLD ? 'bearish' : 'neutral';
}

export function analyze(candles: Candle[]): Analysis | null {
  if (candles.length < WARMUP) return null;
  const points = indicatorSeries(candles);
  const current = points[points.length - 1];
  const price = candles[candles.length - 1].close;
  const direction = directionForScore(current.score);
  const sign = current.score >= 0 ? 1 : -1;
  const trendUp = current.ema20 >= current.ema50;
  const macdUp = current.histogram >= 0;
  const rsiUp = current.rsi >= 50;
  const momentumUp = price >= candles[Math.max(0, candles.length - 4)].close;
  const aligned = [trendUp, macdUp, rsiUp, momentumUp].filter((b) => b === sign > 0).length;
  const target = Math.max(price * 0.001, price + sign * current.atr * 2.4);
  const stop = Math.max(price * 0.001, price - sign * current.atr * 1.2);
  return {
    direction,
    strength: Math.round(Math.abs(current.score) * 100),
    score: current.score,
    indicators: current,
    price,
    change: (price / candles[candles.length - 2].close - 1) * 100,
    target,
    stop,
    rewardRisk: Math.abs(target - price) / Math.max(Math.abs(stop - price), price * 0.000001),
    aligned,
    reasons: [
      {
        label: 'Trend',
        value:
          current.ema20 === current.ema50
            ? 'EMA 20 equals EMA 50'
            : trendUp
              ? 'EMA 20 above EMA 50'
              : 'EMA 20 below EMA 50',
        positive: trendUp === sign > 0,
      },
      {
        label: 'Momentum',
        value:
          current.histogram === 0
            ? 'MACD equals signal'
            : macdUp
              ? 'MACD above signal'
              : 'MACD below signal',
        positive: macdUp === sign > 0,
      },
      {
        label: 'Relative strength',
        value: `RSI ${current.rsi.toFixed(1)} · ${current.rsi > 70 ? 'overbought' : current.rsi < 30 ? 'oversold' : 'balanced'}`,
        positive: rsiUp === sign > 0,
      },
      {
        label: 'Price action',
        value:
          price === candles[Math.max(0, candles.length - 4)].close
            ? '3-candle change flat'
            : momentumUp
              ? '3-candle change positive'
              : '3-candle change negative',
        positive: momentumUp === sign > 0,
      },
    ],
    points,
  };
}

/** Signal at previous close; hypothetical fill at next open and exit at next close.
 * Each trade is unlevered, uses 100% of current equity, and pays fees on both legs.
 * Accuracy uses direction from entry to exit. Neutral and flat candles are unscored.
 */
export function backtest(
  candles: Candle[],
  lookback = 250,
  feeBps = 10,
  initialEquity = 10_000,
  quoteCurrency: 'USD' | 'JPY' = 'USD',
): BacktestResult {
  feeBps = clamp(Number.isFinite(feeBps) ? feeBps : 10, 0, 100);
  const points = indicatorSeries(candles);
  const start = Math.max(WARMUP, candles.length - Math.max(1, Math.floor(lookback)));
  const trades: Trade[] = [];
  let equity = initialEquity;
  let peak = equity;
  let maxDrawdown = 0;
  let correct = 0;
  let baselineCorrect = 0;
  let observations = 0;
  let abstentions = 0;
  let feesPaid = 0;
  const curve = [{ time: candles[start - 1]?.time ?? 0, value: equity }];
  for (let i = start; i < candles.length; i++) {
    const prediction = directionForScore(points[i - 1].score);
    if (prediction === 'neutral') {
      abstentions++;
      continue;
    }
    const c = candles[i];
    const sign = prediction === 'bullish' ? 1 : -1;
    // USDJPY base units are USD; JPY P&L converts to account USD at exit.
    const grossReturn = (sign * (c.close - c.open)) / (quoteCurrency === 'JPY' ? c.close : c.open);
    const cost = (feeBps / 10_000) * (quoteCurrency === 'JPY' ? 2 : 1 + c.close / c.open);
    const netReturn = grossReturn - cost;
    const priceDirection = Math.sign(c.close - c.open);
    const previousDirection = Math.sign(candles[i - 1].close - candles[i - 1].open);
    const isCorrect = priceDirection === sign;
    if (priceDirection !== 0) {
      observations++;
      if (isCorrect) correct++;
      if (previousDirection === priceDirection) baselineCorrect++;
    }
    const pnl = equity * netReturn;
    feesPaid += equity * cost;
    equity += pnl; // Do not hide losses beyond capital on hypothetical short gaps.
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, ((peak - equity) / peak) * 100);
    trades.push({
      time: c.time,
      direction: prediction,
      entry: c.open,
      exit: c.close,
      grossReturn,
      netReturn,
      pnl,
      equity,
      correct: isCorrect,
    });
    curve.push({ time: c.time, value: equity });
    if (equity <= 0) break;
  }
  const gains = trades.reduce((s, t) => s + Math.max(0, t.pnl), 0);
  const losses = trades.reduce((s, t) => s + Math.max(0, -t.pnl), 0);
  return {
    trades,
    accuracy: observations ? (correct / observations) * 100 : 0,
    baselineAccuracy: observations ? (baselineCorrect / observations) * 100 : 0,
    winRate: trades.length
      ? (trades.filter((t) => t.netReturn > 0).length / trades.length) * 100
      : 0,
    totalReturn: (equity / initialEquity - 1) * 100,
    maxDrawdown,
    profitFactor: losses > 0 ? gains / losses : null,
    equity: curve,
    observations,
    eligibleBars: Math.max(0, candles.length - start),
    abstentions,
    feesPaid,
    feeBps,
  };
}

export function accuracyInterval(accuracy: number, n: number): [number, number] {
  if (!n) return [0, 100];
  const p = accuracy / 100;
  const z = 1.96;
  const denominator = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator;
  return [clamp((center - margin) * 100, 0, 100), clamp((center + margin) * 100, 0, 100)];
}
