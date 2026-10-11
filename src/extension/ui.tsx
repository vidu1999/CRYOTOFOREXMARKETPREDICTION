import PredictionWorkflow from './PredictionWorkflow';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bitcoin,
  Check,
  ChevronDown,
  CircleHelp,
  Download,
  ExternalLink,
  Gauge,
  Info,
  LoaderCircle,
  Maximize2,
  Minus,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  WifiOff,
} from 'lucide-react';
import { accuracyInterval } from '../lib/analytics';
import { positionSize } from '../lib/risk';
import { downloadFile } from '../lib/utils';
import {
  DEFAULT_PREFERENCES,
  getLiveMarket,
  LIVE_MARKETS,
  LIVE_TIMEFRAMES,
  liveCandleCloseTime,
  livePrice,
  liveTimestamp,
} from './catalog';
import {
  extensionRequest,
  installedExtension,
  openExtensionPanel,
  openExtensionSettings,
  subscribeWorkspace,
  updatePreferences,
} from './bridge';
import { quoteStatus } from './providers';
import type { LiveMarket, LiveSnapshot, Preferences, WorkspaceState } from './types';

export function VectorMark({ size = 29 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <path d="M3 8h8l9 21h-8zM23 8h10L21 29h-9z" fill="currentColor" />
    </svg>
  );
}
function MarketIcon({ market }: { market: LiveMarket }) {
  return (
    <span
      className="ex-market-icon"
      style={{
        color: market.color,
        background: `${market.color}16`,
        borderColor: `${market.color}35`,
      }}
      aria-hidden="true"
    >
      {market.base === 'BTC' ? (
        <Bitcoin size={22} />
      ) : market.base === 'ETH' ? (
        <svg width="22" height="22" viewBox="0 0 24 24">
          <path d="M12 1L5 12l7 4 7-4zM5 14l7 9 7-9-7 4z" fill="currentColor" />
        </svg>
      ) : market.base === 'SOL' ? (
        <svg width="22" height="22" viewBox="0 0 24 24">
          <path d="M6 4h15l-3 4H3zM3 10h15l3 4H6zM6 16h15l-3 4H3z" fill="currentColor" />
        </svg>
      ) : market.base === 'EUR' ? (
        '€'
      ) : market.base === 'GBP' ? (
        '£'
      ) : market.id === 'USDJPY' ? (
        '¥'
      ) : (
        market.base.slice(0, 1)
      )}
    </span>
  );
}
function ClosedPriceChart({ snapshot, market }: { snapshot: LiveSnapshot; market: LiveMarket }) {
  const id = useId().replace(/:/g, '');
  const data = snapshot.candles.slice(-48);
  if (data.length < 2)
    return <div className="ex-chart-empty">No completed history available for this timeframe.</div>;
  const prices = data.map((c) => c.close);
  const lo = Math.min(...prices),
    hi = Math.max(...prices),
    range = hi - lo || prices[0] * 0.01;
  const x = (i: number) => 8 + (i / (data.length - 1)) * 357;
  const y = (price: number) => 107 - ((price - lo) / range) * 81;
  const path = prices.map((price, i) => `${i ? 'L' : 'M'}${x(i)},${y(price)}`).join(' ');
  const color = prices[prices.length - 1] >= prices[0] ? '#64e7b6' : '#ec91a5';
  return (
    <div className="ex-chart">
      <div>
        <span>
          <i />
          Closed-candle history
        </span>
        <strong>{LIVE_TIMEFRAMES.find((t) => t.id === snapshot.timeframe)?.label}</strong>
      </div>
      <svg
        viewBox="0 0 375 142"
        role="img"
        aria-label={`${market.base}/${market.quote} completed-candle price history. No forming candles used.`}
      >
        <defs>
          <linearGradient id={`ex${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity=".16" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[27, 67, 107].map((y) => (
          <line key={y} x1="8" x2="365" y1={y} y2={y} stroke="#2a3746" strokeDasharray="3 4" />
        ))}
        <path d={`${path} L365,117 L8,117Z`} fill={`url(#ex${id})`} />
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        <circle cx={365} cy={y(prices[prices.length - 1])} r="3" fill={color} />
        <text x="8" y="135" fill="#7d92a9" fontSize="9">
          {liveTimestamp(
            data[0].time,
            snapshot.timeframe !== '1mo' && snapshot.timeframe !== '1w',
          ).replace(' UTC', '')}
        </text>
        <text x="365" y="135" textAnchor="end" fill="#7d92a9" fontSize="9">
          {livePrice(prices[prices.length - 1], market)} {market.quote}
        </text>
      </svg>
    </div>
  );
}
function SignalView({
  snapshot,
  market,
  historical,
}: {
  snapshot: LiveSnapshot;
  market: LiveMarket;
  historical: boolean;
}) {
  const a = snapshot.analysis;
  if (!a)
    return (
      <div className="ex-no-signal">
        <CircleHelp size={24} />
        <strong>More history is needed.</strong>
        <p>
          A signal requires 50 completed candles. The provider returned {snapshot.candles.length}.
          Choose another timeframe or check your data plan.
        </p>
      </div>
    );
  const Icon =
    a.direction === 'bullish' ? ArrowUpRight : a.direction === 'bearish' ? ArrowDownRight : Minus;
  const circleColor =
    a.direction === 'bullish' ? '#64e7b6' : a.direction === 'bearish' ? '#ec91a5' : '#92a8bc';
  const circumference = 2 * Math.PI * 29;
  return (
    <>
      <section className={`ex-outlook ${a.direction}`}>
        <div className="ex-card-title">
          <span>
            <Sparkles size={14} />
            {historical ? 'Historical technical bias' : 'Next-candle outlook'}
          </span>
          <span className="ex-mini-tag">RULE-BASED</span>
        </div>
        <div className="ex-outlook-main">
          <div>
            <h2 className={a.direction}>
              <Icon size={24} />
              {a.direction === 'neutral'
                ? 'Wait & observe'
                : `${a.direction === 'bullish' ? 'Bullish' : 'Bearish'} bias`}
            </h2>
            <p>
              Next {LIVE_TIMEFRAMES.find((t) => t.id === snapshot.timeframe)?.label} candle after
              the loaded close
            </p>
            <span>
              {a.direction === 'neutral'
                ? 'No directional consensus'
                : `${a.aligned} of 4 inputs aligned`}
            </span>
          </div>
          <div className="ex-strength">
            <svg viewBox="0 0 72 72" aria-hidden="true">
              <circle cx="36" cy="36" r="29" stroke="#2c3b43" strokeWidth="4" fill="none" />
              <circle
                cx="36"
                cy="36"
                r="29"
                stroke={circleColor}
                strokeWidth="4"
                fill="none"
                strokeLinecap="round"
                transform="rotate(-90 36 36)"
                strokeDasharray={`${(circumference * a.strength) / 100} ${circumference}`}
              />
            </svg>
            <div>
              <strong>
                {a.strength}
                <small>/100</small>
              </strong>
              <span>strength</span>
            </div>
          </div>
        </div>
        <p className="ex-model-note">
          <Info size={12} />
          Strength is not a success probability.
        </p>
        <div className="ex-reference">
          <div>
            <span>Target reference</span>
            <strong>
              {a.direction === 'neutral' ? 'No directional setup' : livePrice(a.target, market)}
            </strong>
          </div>
          <div>
            <span>Invalidation reference</span>
            <strong>
              {a.direction === 'neutral' ? 'Wait for alignment' : livePrice(a.stop, market)}
            </strong>
          </div>
        </div>
        <div className="ex-basis">
          <span>Forecast basis · closed at</span>
          <strong>{liveTimestamp(snapshot.candleCloseAt)}</strong>
        </div>
      </section>
      <div className="ex-reason-list">
        {a.reasons.map((reason) => (
          <div key={reason.label}>
            <span>{reason.label}</span>
            <strong>
              {a.direction !== 'neutral' && reason.positive ? (
                <Check size={12} className="ex-mint" />
              ) : (
                <Minus size={12} />
              )}
              {reason.value}
            </strong>
          </div>
        ))}
      </div>
    </>
  );
}
function EvidenceView({ snapshot, market }: { snapshot: LiveSnapshot; market: LiveMarket }) {
  const a = snapshot.analysis,
    b = snapshot.backtest;
  const interval = accuracyInterval(b.accuracy, b.observations);
  return (
    <>
      <div className="ex-evidence-intro">
        <Gauge size={16} />
        <div>
          <strong>Evidence, not a promise.</strong>
          <p>
            Computed from this provider's closed history. Not independent, out-of-sample validation.
          </p>
        </div>
      </div>
      {a && (
        <div className="ex-indicator-grid">
          <div>
            <span>RSI 14</span>
            <strong>
              {a.indicators.rsi.toFixed(1)}
              <small>/100</small>
            </strong>
            <p>
              {a.indicators.rsi > 70
                ? 'Overbought'
                : a.indicators.rsi < 30
                  ? 'Oversold'
                  : 'Balanced range'}
            </p>
          </div>
          <div>
            <span>MACD histogram</span>
            <strong className={a.indicators.histogram >= 0 ? 'ex-mint' : 'ex-red'}>
              {a.indicators.histogram.toLocaleString('en-US', { maximumSignificantDigits: 5 })}
            </strong>
            <p>12 / 26 / 9</p>
          </div>
          <div>
            <span>EMA trend</span>
            <strong>{a.indicators.ema20 >= a.indicators.ema50 ? 'Uptrend' : 'Downtrend'}</strong>
            <p>20 vs. 50 periods</p>
          </div>
          <div>
            <span>ATR 14</span>
            <strong>
              {((a.indicators.atr / a.price) * 100).toFixed(2)}
              <small>%</small>
            </strong>
            <p>Per-candle range</p>
          </div>
        </div>
      )}
      <section className="ex-evidence-card">
        <div className="ex-card-title">
          <span>Walk-forward check</span>
          <span className="ex-mini-tag">LAST 250 BARS</span>
        </div>
        <div className="ex-hit-rate">
          <strong>{b.observations ? `${b.accuracy.toFixed(1)}%` : '—'}</strong>
          <div>
            <span>Directional hit rate</span>
            <small>{b.observations} scored signals · before costs</small>
          </div>
        </div>
        <div className="ex-evidence-rows">
          <div>
            <span>Previous-candle baseline</span>
            <strong>{b.observations ? `${b.baselineAccuracy.toFixed(1)}%` : '—'}</strong>
          </div>
          <div>
            <span>Approx. 95% interval*</span>
            <strong>
              {b.observations ? `${interval[0].toFixed(1)}–${interval[1].toFixed(1)}%` : '—'}
            </strong>
          </div>
          <div>
            <span>Net return after costs</span>
            <strong className={b.totalReturn >= 0 ? 'ex-mint' : 'ex-red'}>
              {b.trades.length
                ? `${b.totalReturn > 0 ? '+' : ''}${b.totalReturn.toFixed(2)}%`
                : '—'}
            </strong>
          </div>
          <div>
            <span>Maximum drawdown</span>
            <strong>{b.trades.length ? `${b.maxDrawdown.toFixed(2)}%` : '—'}</strong>
          </div>
          <div>
            <span>Costs per side</span>
            <strong>
              {b.feeBps} bps · {market.category === 'Crypto' ? 'USDT account' : 'USD account'}
            </strong>
          </div>
        </div>
        <p>
          Prior-close signal → next-open entry → same-candle-close exit. 50-bar warm-up, 1×
          notional; neutral scores skipped. No stop/target execution, slippage, tax, funding, borrow
          costs or broker constraints. *Wilson interval assumes independence; real markets may
          violate it. Accuracy can be high while returns are negative.
        </p>
      </section>
      <details className="ex-methodology">
        <summary>
          How the signal is calculated
          <ChevronDown size={13} />
        </summary>
        <p>
          Bounded EMA 20/50 trend (50%), MACD histogram (15%), RSI displacement (20%), and
          three-candle momentum (15%), normalized by ATR. Scores above +0.20 are bullish, below
          −0.20 bearish; otherwise the model abstains. This is a technical ensemble, not trained AI
          or calibrated probability.
        </p>
      </details>
    </>
  );
}
function RiskView({ snapshot, market }: { snapshot: LiveSnapshot; market: LiveMarket }) {
  const a = snapshot.analysis;
  const [capital, setCapital] = useState('1000');
  const [risk, setRisk] = useState('1');
  const [entry, setEntry] = useState(a ? String(a.price) : '');
  const [stop, setStop] = useState(a && a.direction !== 'neutral' ? String(a.stop) : '');
  const [target, setTarget] = useState(a && a.direction !== 'neutral' ? String(a.target) : '');
  const stamp = useRef(`${snapshot.marketId}:${snapshot.timeframe}:${snapshot.candleCloseAt}`);
  useEffect(() => {
    const next = `${snapshot.marketId}:${snapshot.timeframe}:${snapshot.candleCloseAt}`;
    if (next !== stamp.current) {
      stamp.current = next;
      setEntry(a ? String(a.price) : '');
      setStop(a && a.direction !== 'neutral' ? String(a.stop) : '');
      setTarget(a && a.direction !== 'neutral' ? String(a.target) : '');
    }
  }, [snapshot.marketId, snapshot.timeframe, snapshot.candleCloseAt, a]);
  const size = positionSize(
    Number(capital),
    Number(risk),
    Number(entry),
    Number(stop),
    Number(target),
    snapshot.backtest.feeBps,
    market.quote === 'JPY' ? 'USDJPY' : 1,
  );
  const accountCurrency = market.category === 'Crypto' ? 'USDT' : 'USD';
  return (
    <>
      <div className="ex-evidence-intro">
        <ShieldCheck size={17} />
        <div>
          <strong>Risk before conviction.</strong>
          <p>Hypothetical sizing only. No exchange account is read and no order is placed.</p>
        </div>
      </div>
      {a?.direction === 'neutral' && (
        <p className="ex-neutral-risk">
          The model abstained. Enter your own hypothetical levels; no directional stop or target is
          suggested.
        </p>
      )}
      <div className="ex-risk-inputs">
        <label>
          Hypothetical balance · {accountCurrency}
          <input
            type="number"
            min="1"
            step="any"
            value={capital}
            onChange={(e) => setCapital(e.target.value)}
          />
        </label>
        <label>
          Risk per setup · %
          <input
            type="number"
            min="0.1"
            max="5"
            step="0.1"
            value={risk}
            onChange={(e) => setRisk(e.target.value)}
          />
        </label>
        <label>
          Entry reference
          <input
            type="number"
            min="0"
            step="any"
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
          />
        </label>
        <label>
          Stop reference
          <input
            type="number"
            min="0"
            step="any"
            value={stop}
            onChange={(e) => setStop(e.target.value)}
          />
        </label>
        <label>
          Target reference
          <input
            type="number"
            min="0"
            step="any"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </label>
        <div className="ex-risk-fee">
          <span>Modeled cost / side</span>
          <strong>{snapshot.backtest.feeBps} bps</strong>
          <small>Change in settings</small>
        </div>
      </div>
      <div className="ex-size-result">
        <span>1× exposure · no leverage added</span>
        <strong>
          {size.valid ? size.units.toLocaleString('en-US', { maximumFractionDigits: 8 }) : '—'}
          <small>{market.base} units</small>
        </strong>
        <div>
          <span>Modeled loss, incl. costs</span>
          <b className="ex-red">
            {size.valid ? size.actualRisk.toFixed(2) : '—'} {accountCurrency}
          </b>
        </div>
        <div>
          <span>Net reward / risk</span>
          <b>{size.valid ? size.rewardRisk.toFixed(2) + 'R' : '—'}</b>
        </div>
        {size.capitalLimited && <p>Size is capped at available capital; no leverage was added.</p>}
        {!size.valid && (
          <p role="alert">
            Enter positive values within the supported numeric range and risk ≤5%. The target must
            be opposite the stop and cover fees.
          </p>
        )}
      </div>
      <p className="ex-risk-warning">
        <ShieldCheck size={15} />
        Stops can slip. Gaps and short positions may lose more than modeled, including beyond
        initial capital. USDJPY P&amp;L converts at reference exit rates. No guaranteed passive
        income.
      </p>
    </>
  );
}
export function ExtensionWorkspace({ preview = false }: { preview?: boolean }) {
  const installed = installedExtension();
  const [state, setState] = useState<WorkspaceState>({
    settings: { preferences: DEFAULT_PREFERENCES, hasForexKey: false },
    snapshot: null,
    failure: null,
  });
  const [tab, setTab] = useState<'forecast' | 'evidence' | 'risk'>('forecast');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [connectedPreview, setConnectedPreview] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [windowId, setWindowId] = useState<number | null>(null);
  const mounted = useRef(true);
  const refreshSequence = useRef(0);
  const reloadState = useCallback(async () => {
    const reply = await extensionRequest({ type: 'GET_STATE' });
    if (mounted.current && reply.ok) setState(reply.state);
  }, []);
  const refresh = useCallback(async (force = false) => {
    const sequence = ++refreshSequence.current;
    setLoading(true);
    setNotice('');
    try {
      const reply = await extensionRequest({ type: 'REFRESH', force });
      if (!mounted.current || sequence !== refreshSequence.current) return;
      if (reply.ok) setState(reply.state);
      else setNotice(reply.error);
    } finally {
      if (mounted.current && sequence === refreshSequence.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void reloadState();
    const unsubscribe = subscribeWorkspace(() => {
      void reloadState();
    });
    if (installed)
      void chrome.windows.getCurrent().then((w) => {
        if (mounted.current) setWindowId(w.id ?? null);
      });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      mounted.current = false;
      unsubscribe();
      clearInterval(timer);
    };
  }, [installed, reloadState]);
  const preferences = state.settings.preferences;
  const market = getLiveMarket(preferences.marketId);
  const snapshot =
    state.snapshot?.marketId === market.id && state.snapshot.timeframe === preferences.timeframe
      ? state.snapshot
      : null;
  const failure =
    state.failure?.marketId === market.id && state.failure.timeframe === preferences.timeframe
      ? state.failure
      : null;
  const status = failure ? 'offline' : quoteStatus(snapshot, market, now);
  useEffect(() => {
    if ((!installed && !connectedPreview) || !preferences.autoRefresh) return;
    void refresh();
    const timer = setInterval(
      () => {
        if (document.visibilityState !== 'hidden') void refresh();
      },
      market.category === 'Crypto' ? 15_000 : 60_000,
    );
    return () => clearInterval(timer);
  }, [
    preferences.marketId,
    preferences.timeframe,
    preferences.autoRefresh,
    installed,
    connectedPreview,
    market.category,
    refresh,
  ]);
  const change = async (values: Partial<Preferences>) => {
    const reply = await updatePreferences(values);
    if (reply.ok) {
      setState(reply.state);
      setNotice('');
    } else setNotice(reply.error);
  };
  const exportSnapshot = () => {
    if (!snapshot) return;
    downloadFile(
      `vector-live-${market.id}-${preferences.timeframe}.json`,
      JSON.stringify(
        {
          product: 'Vector Live browser extension',
          market: market.symbol,
          priceQuoteCurrency: market.quote,
          provider: snapshot.provider,
          receivedAt: new Date(snapshot.receivedAt).toISOString(),
          quoteAsOf: new Date(snapshot.quote.asOf).toISOString(),
          feedStatusAtExport: status,
          foregroundAutoRefresh: preferences.autoRefresh,
          historyCurrentAtExport: historyCurrent,
          timeframe: snapshot.timeframe,
          forecastClosedAt:
            snapshot.candleCloseAt === null ? null : new Date(snapshot.candleCloseAt).toISOString(),
          lastQuote: snapshot.quote.price,
          model:
            'Rule-based technical ensemble. Not a trained or independently validated AI model.',
          signal: snapshot.analysis
            ? {
                direction: snapshot.analysis.direction,
                strengthOutOf100: snapshot.analysis.strength,
                indicators: snapshot.analysis.indicators,
                targetReference:
                  snapshot.analysis.direction === 'neutral' ? null : snapshot.analysis.target,
                invalidationReference:
                  snapshot.analysis.direction === 'neutral' ? null : snapshot.analysis.stop,
              }
            : null,
          historicalTest: {
            observations: snapshot.backtest.observations,
            accuracy: snapshot.backtest.accuracy,
            baselineAccuracy: snapshot.backtest.baselineAccuracy,
            netReturnPercent: snapshot.backtest.totalReturn,
            feesPerSideBps: snapshot.backtest.feeBps,
            accountCurrency: market.category === 'Crypto' ? 'USDT' : 'USD',
          },
          limitations: [
            'Historical hit rate is not future accuracy.',
            'Signal strength is not calibrated probability.',
            'Quotes may be delayed by the provider or market closure.',
            'No order execution. Stops and returns are not guaranteed.',
            'No guarantee of passive income.',
          ],
        },
        null,
        2,
      ),
      'application/json',
    );
    setNotice('Research snapshot exported. No API key is included.');
  };
  const direction = snapshot?.analysis?.direction ?? 'neutral';
  const historyCurrent =
    !!snapshot &&
    snapshot.candleCloseAt !== null &&
    liveCandleCloseTime(snapshot.candleCloseAt, snapshot.timeframe) +
      (market.category === 'Crypto' ? 90_000 : 180_000) >
      now;
  const freshLabel =
    !preferences.autoRefresh && snapshot
      ? 'Paused'
      : status === 'live'
        ? 'Live snapshot'
        : status === 'closed'
          ? 'Market closed'
          : status === 'delayed'
            ? 'Delayed / stale'
            : status === 'offline'
              ? 'Feed unavailable'
              : 'Not connected';
  return (
    <section
      className={`ex-app ${preview ? 'is-preview' : ''}`}
      aria-label="Vector Live extension workspace"
    >
      <header className="ex-header">
        <a
          href={installed ? chrome.runtime.getURL('popup.html') : '/'}
          className="ex-brand"
          aria-label="Vector Live"
        >
          <VectorMark />
          <span>
            VECTOR<small>LIVE INTELLIGENCE</small>
          </span>
        </a>
        <div>
          <button
            className="ex-icon-button"
            title="Open side panel"
            aria-label="Open side panel"
            onClick={() => {
              void openExtensionPanel(windowId).catch(() =>
                setNotice(
                  'Side panel could not open. Try a current Chrome/Edge version or open panel.html in an extension tab.',
                ),
              );
            }}
          >
            <Maximize2 size={16} />
          </button>
          <button
            className="ex-icon-button"
            title="Private extension settings"
            aria-label="Open extension settings"
            onClick={() => {
              void openExtensionSettings();
            }}
          >
            <Settings2 size={17} />
          </button>
        </div>
      </header>
      {!installed && (
        <div className="ex-preview-ribbon">
          <Info size={12} />
          Browser preview · install for private forex &amp; background refresh
        </div>
      )}
      <div className="ex-market-controls">
        <label className="ex-market-select">
          <span className="ex-sr">Choose live market</span>
          <select
            value={market.id}
            onChange={(e) => {
              void change({ marketId: e.target.value });
            }}
          >
            {(['Crypto', 'Forex'] as const).map((category) => (
              <optgroup label={category} key={category}>
                {LIVE_MARKETS.filter((m) => m.category === category).map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.base} / {m.quote} · {m.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <ChevronDown size={14} />
        </label>
        <button
          className={`ex-icon-button ex-save ${preferences.favorites.includes(market.id) ? 'saved' : ''}`}
          aria-label={`${preferences.favorites.includes(market.id) ? 'Unsave' : 'Save'} ${market.base}/${market.quote}`}
          aria-pressed={preferences.favorites.includes(market.id)}
          onClick={() => {
            void change({
              favorites: preferences.favorites.includes(market.id)
                ? preferences.favorites.filter((id) => id !== market.id)
                : [...preferences.favorites, market.id],
            });
          }}
        >
          <Star
            size={16}
            fill={preferences.favorites.includes(market.id) ? 'currentColor' : 'none'}
          />
        </button>
        <button
          className="ex-icon-button"
          aria-label="Refresh live data"
          title="Refresh live data"
          disabled={loading}
          onClick={() => {
            if (!installed) setConnectedPreview(true);
            void refresh(true);
          }}
        >
          <RefreshCw size={16} className={loading ? 'ex-spin' : ''} />
        </button>
      </div>
      <div className="ex-timeframes" aria-label="Forecast timeframe">
        {LIVE_TIMEFRAMES.map((tf) => (
          <button
            key={tf.id}
            className={preferences.timeframe === tf.id ? 'active' : ''}
            aria-pressed={preferences.timeframe === tf.id}
            onClick={() => {
              void change({ timeframe: tf.id });
            }}
          >
            {tf.label}
          </button>
        ))}
      </div>
      <div className="ex-feed-status">
        <span className={`ex-status ${!preferences.autoRefresh ? 'paused' : status}`}>
          <i />
          {loading ? 'Updating…' : freshLabel}
        </span>
        <span>
          {market.category === 'Crypto' ? '15s when open' : '60s when open'}
          <button
            className={`ex-pause ${preferences.autoRefresh ? '' : 'paused'}`}
            aria-label={
              preferences.autoRefresh ? 'Pause automatic refresh' : 'Resume automatic refresh'
            }
            onClick={() => {
              void change({ autoRefresh: !preferences.autoRefresh });
            }}
          >
            {preferences.autoRefresh ? <Pause size={10} /> : <Play size={9} />}
          </button>
        </span>
      </div>
      {notice && (
        <p className="ex-notice" role="status">
          {notice}
        </p>
      )}
      {failure && (
        <div className="ex-failure" role="alert">
          {failure.code === 'SETUP_REQUIRED' ? <Settings2 size={16} /> : <WifiOff size={16} />}
          <div>
            <strong>
              {failure.code === 'SETUP_REQUIRED'
                ? 'Connect your forex data'
                : 'A real feed, or no forecast.'}
            </strong>
            <p>{failure.message}</p>
            {failure.retryAfterSeconds && (
              <small>
                Retry window ·{' '}
                {Math.max(
                  0,
                  Math.ceil((failure.at + failure.retryAfterSeconds * 1000 - now) / 1000),
                )}
                s remaining
              </small>
            )}
            {failure.code === 'SETUP_REQUIRED' && (
              <button
                onClick={() => {
                  void openExtensionSettings();
                }}
              >
                Open private settings
                <ArrowRight size={13} />
              </button>
            )}
          </div>
        </div>
      )}
      {loading && !snapshot && (
        <div className="ex-loading">
          <LoaderCircle className="ex-spin" size={22} />
          <span>Loading provider quotes and closed candles…</span>
        </div>
      )}
      {!snapshot && !loading && !failure && (
        <div className="ex-connect-empty">
          <span className="ex-connect-symbol">
            <Radio size={28} />
          </span>
          <h2>{installed ? 'Ready for the live market.' : 'Real feeds. Zero demo prices.'}</h2>
          <p>
            {installed
              ? 'Fetch the selected market to begin analysis.'
              : 'This is the extension interface. You can try public crypto here; install the package for the native popup, side panel, and private forex connection.'}
          </p>
          <button
            className="ex-button primary"
            onClick={() => {
              if (!installed) setConnectedPreview(true);
              void refresh(true);
            }}
          >
            <Radio size={15} />
            {market.category === 'Forex' ? 'Connect forex provider' : 'Connect public crypto feed'}
          </button>
          <small>No exchange login. No automatic trades.</small>
        </div>
      )}
      {snapshot && (
        <>
          <div className="ex-live-quote">
            <MarketIcon market={market} />
            <div>
              <span>
                {market.base} / {market.quote}
              </span>
              <strong>
                {livePrice(snapshot.quote.price, market)}
                <small>{market.quote}</small>
              </strong>
            </div>
            {snapshot.quote.changePercent !== null && (
              <span className={snapshot.quote.changePercent >= 0 ? 'ex-mint' : 'ex-red'}>
                {snapshot.quote.changePercent >= 0 ? (
                  <ArrowUpRight size={13} />
                ) : (
                  <ArrowDownRight size={13} />
                )}
                {snapshot.quote.changePercent > 0 ? '+' : ''}
                {snapshot.quote.changePercent.toFixed(2)}%
                <small>{market.category === 'Crypto' ? '24h rolling' : 'Provider session'}</small>
              </span>
            )}
          </div>
          <div className="ex-source">
            <span>{snapshot.provider}</span>
            <span>Quote · {liveTimestamp(snapshot.quote.asOf)}</span>
          </div>
          {(!historyCurrent || status !== 'live') && (
            <div className="ex-staleness">
              <Info size={13} />
              {status === 'closed'
                ? 'Market is closed. This is the last available quote and historical bias.'
                : !historyCurrent && status === 'live'
                  ? 'The quote is recent but completed history is old. This outlook is historical, not a current signal.'
                  : 'Do not treat this cached or delayed snapshot as a current trading signal.'}
            </div>
          )}
          <ClosedPriceChart snapshot={snapshot} market={market} />
          <nav className="ex-tabs" aria-label="Extension analysis view">
            {(
              [
                { id: 'forecast', label: 'Forecast', icon: Sparkles },
                { id: 'evidence', label: 'Evidence', icon: Gauge },
                { id: 'risk', label: 'Risk sizing', icon: ShieldCheck },
              ] as const
            ).map((t) => (
              <button
                className={tab === t.id ? 'active' : ''}
                onClick={() => setTab(t.id)}
                key={t.id}
                aria-pressed={tab === t.id}
              >
                <t.icon size={14} />
                {t.label}
                {t.id === 'forecast' && <i className={direction} />}
              </button>
            ))}
          </nav>
          <div className="ex-tab-content">
            {tab === 'forecast' && (
              <SignalView
                snapshot={snapshot}
                market={market}
                historical={!historyCurrent || status !== 'live' || !preferences.autoRefresh}
              />
            )}
            {tab === 'evidence' && <EvidenceView snapshot={snapshot} market={market} />}
            {tab === 'risk' && <RiskView snapshot={snapshot} market={market} />}
          </div>
          <p className="ex-candle-note">{snapshot.candleNote}</p>
          <div className="ex-snapshot-footer">
            <span>
              Retrieved {Math.max(0, Math.floor((now - snapshot.receivedAt) / 1000))}s ago
            </span>
            <button onClick={exportSnapshot}>
              <Download size={12} />
              Export snapshot
            </button>
          </div>
        </>
      )}
      <PredictionWorkflow state={state} onState={setState} />
      <div className="ex-favorites">
        <span>SAVED</span>
        {preferences.favorites.map((id) => {
          const m = getLiveMarket(id);
          return (
            <button
              key={id}
              className={id === market.id ? 'active' : ''}
              onClick={() => {
                void change({ marketId: id });
              }}
            >
              {m.base}/{m.quote}
            </button>
          );
        })}
      </div>
      <footer className="ex-disclaimer">
        <ShieldCheck size={14} />
        <p>
          Technical research, not financial advice. Prediction accuracy and passive income are not
          guaranteed. No trade execution.
        </p>
        <a
          href={installed ? chrome.runtime.getURL('options.html') : '/options.html'}
          aria-label="Data and privacy information"
        >
          <ExternalLink size={12} />
        </a>
      </footer>
    </section>
  );
}
