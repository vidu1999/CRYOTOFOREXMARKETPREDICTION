import { useState } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Gauge,
  Info,
  Layers3,
  Minus,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Upload,
  Zap,
} from 'lucide-react';
import type {
  Analysis,
  Asset,
  BacktestResult,
  Candle,
  MarketSnapshot,
  Page,
  Timeframe,
  TimeframeAnalysis,
} from '../lib/types';
import { candleCloseTime, formatPrice, money, percent, TIMEFRAMES } from '../lib/market';
import { positionSize } from '../lib/risk';
import { AssetIcon, DirectionBadge, PageHeading, SectionHeading, TextLink } from './UI';
import { PriceChart, ScenarioChart, Sparkline } from './Charts';

export interface MarketPageProps {
  asset: Asset;
  timeframe: Timeframe;
  candles: Candle[];
  analysis: Analysis;
  multi: TimeframeAnalysis[];
  snapshots: MarketSnapshot[];
  watchlist: string[];
  result: BacktestResult;
  source: string;
  capital: number;
  riskPercent: number;
  onAsset: (asset: Asset) => void;
  onTimeframe: (timeframe: Timeframe) => void;
  onNavigate: (page: Page) => void;
  onImport: () => void;
  onExport: () => void;
}

export function TimeframePicker({
  timeframe,
  multi,
  onChange,
}: {
  timeframe: Timeframe;
  multi: TimeframeAnalysis[];
  onChange: (tf: Timeframe) => void;
}) {
  return (
    <div className="timeframe-picker" aria-label="Analysis timeframe">
      {TIMEFRAMES.map((tf) => (
        <button
          key={tf.id}
          onClick={() => onChange(tf.id)}
          disabled={!multi.find((m) => m.timeframe === tf.id)?.analysis}
          className={timeframe === tf.id ? 'selected' : ''}
          aria-pressed={timeframe === tf.id}
          title={
            !multi.find((m) => m.timeframe === tf.id)?.analysis
              ? 'At least 50 completed candles are required'
              : `${tf.name} candles`
          }
        >
          {tf.label}
        </button>
      ))}
    </div>
  );
}

function ForecastCard({
  analysis,
  asset,
  timeframe,
  onExplore,
  asOf,
  exploreLabel = 'Full analysis',
}: {
  analysis: Analysis;
  asset: Asset;
  timeframe: Timeframe;
  onExplore: () => void;
  asOf: number;
  exploreLabel?: string;
}) {
  const Icon =
    analysis.direction === 'bullish'
      ? ArrowUpRight
      : analysis.direction === 'bearish'
        ? ArrowDownRight
        : Minus;
  const color =
    analysis.direction === 'bearish'
      ? '#ed8593'
      : analysis.direction === 'neutral'
        ? '#adbbcf'
        : '#59e5b3';
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  return (
    <section className={`panel forecast-panel ${analysis.direction}`}>
      <div className="section-heading">
        <h3>
          <Sparkles size={17} className="mint" />
          Next-move outlook
        </h3>
        <span className="tiny-tag">TECHNICAL</span>
      </div>
      <div className="forecast-main">
        <div>
          <div className={`forecast-direction ${analysis.direction}`}>
            <Icon size={26} strokeWidth={2} />
            {analysis.direction === 'neutral'
              ? 'Wait & observe'
              : `${analysis.direction === 'bullish' ? 'Bullish' : 'Bearish'} bias`}
          </div>
          <p>Next {TIMEFRAMES.find((t) => t.id === timeframe)?.name} candle</p>
          <span className="forecast-asof">
            Loaded close ·{' '}
            {new Date(asOf).toLocaleDateString('en-GB', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              timeZone: 'UTC',
            })}
            {['1m', '5m', '15m', '1h', '4h'].includes(timeframe)
              ? `, ${new Date(asOf).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}`
              : ''}{' '}
            UTC
          </span>
          <div className="alignment-label">
            <span className="mini-dot" style={{ background: color }} />
            {analysis.aligned} of 4 signals aligned
          </div>
        </div>
        <div className="strength-ring">
          <svg viewBox="0 0 80 80" aria-hidden="true">
            <circle cx="40" cy="40" r={radius} fill="none" stroke="#27323d" strokeWidth="5" />
            <circle
              cx="40"
              cy="40"
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth="5"
              strokeDasharray={`${(circumference * analysis.strength) / 100} ${circumference}`}
              strokeLinecap="round"
              transform="rotate(-90 40 40)"
            />
          </svg>
          <div>
            <strong>
              {analysis.strength}
              <span>/100</span>
            </strong>
            <small>strength</small>
          </div>
        </div>
      </div>
      <div className="forecast-signals">
        {analysis.reasons.slice(0, 3).map((reason) => (
          <div key={reason.label}>
            <span>{reason.label}</span>
            <strong className={reason.positive ? 'text-bright' : 'muted'}>
              {reason.positive ? <Check size={13} className="mint" /> : <Minus size={13} />}
              {reason.label === 'Trend'
                ? analysis.indicators.ema20 >= analysis.indicators.ema50
                  ? 'Uptrend'
                  : 'Downtrend'
                : reason.label === 'Momentum'
                  ? analysis.indicators.histogram >= 0
                    ? 'Positive'
                    : 'Negative'
                  : `RSI ${analysis.indicators.rsi.toFixed(1)}`}
            </strong>
          </div>
        ))}
      </div>
      <div className="reference-levels">
        <div className="small-label">
          ILLUSTRATIVE LEVELS{' '}
          <Info size={12} aria-label="ATR-based levels, not guaranteed prices" />
        </div>
        <div>
          <span>Target reference</span>
          <strong className={analysis.direction === 'neutral' ? '' : 'positive'}>
            {analysis.direction === 'neutral'
              ? 'No directional setup'
              : formatPrice(analysis.target, asset)}
          </strong>
        </div>
        <div>
          <span>Invalidation reference</span>
          <strong>
            {analysis.direction === 'neutral'
              ? 'Wait for alignment'
              : formatPrice(analysis.stop, asset)}
          </strong>
        </div>
      </div>
      <div className="forecast-footer">
        <span>
          <Info size={12} />
          Strength is not probability.
        </span>
        <TextLink onClick={onExplore}>{exploreLabel}</TextLink>
      </div>
    </section>
  );
}

export function AlignmentPanel({
  multi,
  timeframe,
  onTimeframe,
}: {
  multi: TimeframeAnalysis[];
  timeframe: Timeframe;
  onTimeframe: (tf: Timeframe) => void;
}) {
  const bullish = multi.filter((m) => m.analysis?.direction === 'bullish').length;
  const available = multi.filter((m) => m.analysis).length;
  return (
    <section className="panel alignment-panel">
      <SectionHeading
        title="Timeframe alignment"
        action={
          <span className="subtle-icon">
            <Layers3 size={16} />
          </span>
        }
      />
      <div className="alignment-summary">
        <span className="mini-dot mint-bg" />
        {bullish} of {available} timeframes bullish<span>Technical bias</span>
      </div>
      <div className="alignment-rows">
        {multi.map((m) => (
          <button
            key={m.timeframe}
            className={`alignment-row ${m.timeframe === timeframe ? 'active' : ''}`}
            onClick={() => onTimeframe(m.timeframe)}
            disabled={!m.analysis}
          >
            <span className="tf-label">{TIMEFRAMES.find((t) => t.id === m.timeframe)?.label}</span>
            {m.analysis ? (
              <>
                <DirectionBadge direction={m.analysis.direction} compact />
                <span className={`strength-track ${m.analysis.direction}`}>
                  <span style={{ width: `${m.analysis.strength}%` }} />
                </span>
                <span className="strength-number">{m.analysis.strength}</span>
              </>
            ) : (
              <span className="unavailable-label">Not enough history</span>
            )}
          </button>
        ))}
      </div>
      <div className="panel-footnote">Timeframe comparisons. Agreement is not certainty.</div>
    </section>
  );
}

function WatchlistPanel({
  snapshots,
  watchlist,
  asset,
  onAsset,
  onManage,
}: {
  snapshots: MarketSnapshot[];
  watchlist: string[];
  asset: Asset;
  onAsset: (asset: Asset) => void;
  onManage: () => void;
}) {
  const watched = snapshots.filter((m) => watchlist.includes(m.asset.id)).slice(0, 6);
  return (
    <section className="panel watch-panel">
      <SectionHeading
        title="Your watchlist"
        action={<TextLink onClick={onManage}>View all</TextLink>}
      />
      <div className="watch-table">
        <div className="watch-table-head">
          <span>Market</span>
          <span>Last price</span>
          <span>24h change*</span>
        </div>
        {watched.length ? (
          watched.map((m) => (
            <button
              key={m.asset.id}
              className={`watch-row ${m.asset.id === asset.id ? 'selected' : ''}`}
              onClick={() => onAsset(m.asset)}
            >
              <div>
                <AssetIcon asset={m.asset} small />
                <span>
                  <strong>{m.asset.pair}</strong>
                  <small>{m.asset.category}</small>
                </span>
              </div>
              <span className="watch-price">{formatPrice(m.price, m.asset, true)}</span>
              <span className={`change ${m.change >= 0 ? 'positive' : 'negative'}`}>
                {percent(m.change)}
              </span>
            </button>
          ))
        ) : (
          <div className="inline-empty">
            Your watchlist is empty.
            <button className="text-link" onClick={onManage}>
              Add a market <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
      <div className="panel-footnote">*24-hour change for demo assets; 24-bar for imports.</div>
    </section>
  );
}

function RiskSnapshot({
  analysis,
  asset,
  capital,
  riskPercent,
  onOpen,
}: {
  analysis: Analysis;
  asset: Asset;
  capital: number;
  riskPercent: number;
  onOpen: () => void;
}) {
  const size = positionSize(
    capital,
    riskPercent,
    analysis.price,
    analysis.stop,
    analysis.target,
    asset.category === 'Crypto' ? 10 : 1,
    asset.id === 'usdjpy' ? 'USDJPY' : 1,
  );
  return (
    <section className="panel risk-snapshot">
      <SectionHeading title="Risk first" action={<ShieldCheck size={17} className="mint" />} />
      <div className="risk-visual">
        <div className="risk-dial">
          <ShieldCheck size={27} />
        </div>
        <span className="small-label">YOUR RISK BUDGET</span>
        <strong>{money((capital * riskPercent) / 100)}</strong>
        <p>
          {riskPercent}% of {money(capital)} per setup
        </p>
      </div>
      <div className="risk-snapshot-details">
        <div>
          <span>Modeled reward / risk</span>
          <strong>
            {size.valid && analysis.direction !== 'neutral'
              ? `${size.rewardRisk.toFixed(2)}R`
              : '—'}
          </strong>
        </div>
        <div>
          <span>Exposure</span>
          <strong>1× · no leverage</strong>
        </div>
      </div>
      <p className="risk-note">Stops can slip. Actual losses may exceed the modeled risk.</p>
      <button className="button secondary full" onClick={onOpen}>
        Position calculator
        <ArrowRight size={15} />
      </button>
    </section>
  );
}

export function Overview(props: MarketPageProps) {
  const {
    asset,
    timeframe,
    candles,
    analysis,
    multi,
    snapshots,
    source,
    onAsset,
    onTimeframe,
    onNavigate,
  } = props;
  const topMarkets = ['btc', 'eth', 'sol', 'eurusd']
    .map((id) => snapshots.find((s) => s.asset.id === id)!)
    .filter(Boolean);
  return (
    <>
      <PageHeading
        eyebrow="YOUR RESEARCH WORKSPACE"
        title="Market overview"
        subtitle="A clearer perspective on your next move."
        actions={
          <>
            <button className="button secondary" onClick={props.onImport}>
              <Upload size={15} />
              Import data
            </button>
            <button className="button primary" onClick={props.onExport}>
              <Download size={15} />
              Export report
            </button>
          </>
        }
      />
      <div className="market-cards">
        {topMarkets.map((m) => (
          <button
            key={m.asset.id}
            className={`market-card ${asset.id === m.asset.id ? 'active' : ''}`}
            onClick={() => onAsset(m.asset)}
          >
            <div className="market-card-top">
              <div>
                <AssetIcon asset={m.asset} small />
                <span>
                  <strong>
                    {m.asset.category === 'Crypto' ? m.asset.name : 'Euro / US Dollar'}
                  </strong>
                  <small>{m.asset.pair}</small>
                </span>
              </div>
              <span className="market-category">{m.asset.category}</span>
            </div>
            <div className="market-card-value">
              <div>
                <strong>{formatPrice(m.price, m.asset, true)}</strong>
                <span className={`change ${m.change >= 0 ? 'positive' : 'negative'}`}>
                  {m.change >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                  {percent(m.change)}
                  <small>24h</small>
                </span>
              </div>
              <Sparkline
                values={m.candles.slice(-30).map((c) => c.close)}
                color={m.change >= 0 ? '#59e5b3' : '#ed8593'}
                fill
              />
            </div>
          </button>
        ))}
      </div>
      <div className="analysis-grid">
        <PriceChart
          asset={asset}
          candles={candles}
          analysis={analysis}
          timeframe={timeframe}
          source={source}
          timeframes={
            <TimeframePicker timeframe={timeframe} multi={multi} onChange={onTimeframe} />
          }
        />
        <ForecastCard
          analysis={analysis}
          asset={asset}
          timeframe={timeframe}
          onExplore={() => onNavigate('signals')}
          asOf={candleCloseTime(candles[candles.length - 1].time, timeframe)}
        />
      </div>
      <div className="below-analysis-grid">
        <AlignmentPanel multi={multi} timeframe={timeframe} onTimeframe={onTimeframe} />
        <WatchlistPanel
          snapshots={snapshots}
          watchlist={props.watchlist}
          asset={asset}
          onAsset={onAsset}
          onManage={() => onNavigate('watchlist')}
        />
        <RiskSnapshot
          analysis={analysis}
          asset={asset}
          capital={props.capital}
          riskPercent={props.riskPercent}
          onOpen={() => onNavigate('risk')}
        />
      </div>
      <div className="research-banner">
        <div className="banner-icon">
          <ShieldCheck size={22} />
        </div>
        <div>
          <strong>Your edge starts with protecting your capital.</strong>
          <p>Test signals on real history. Size every position. Never rely on a single forecast.</p>
        </div>
        <button className="text-link" onClick={() => onNavigate('backtesting')}>
          Test this strategy
          <ArrowRight size={15} />
        </button>
      </div>
    </>
  );
}

export function Signals(props: MarketPageProps) {
  const { asset, analysis, timeframe, multi, source } = props;
  const [methodOpen, setMethodOpen] = useState(false);
  const i = analysis.indicators;
  const range = [Math.max(0, analysis.price - i.atr), analysis.price + i.atr];
  return (
    <>
      <PageHeading
        eyebrow="EXPLAINABLE INTELLIGENCE"
        title="Understand the next move."
        subtitle="Look under the hood. A signal is only as useful as the reasoning behind it."
        actions={
          <button className="button primary" onClick={props.onExport}>
            <Download size={15} />
            Export analysis
          </button>
        }
      />
      <div className="analysis-context-bar">
        <div>
          <AssetIcon asset={asset} small />
          <strong>{asset.pair}</strong>
          <span className="source-pill">
            <span className="mini-dot" />
            {source}
          </span>
        </div>
        <TimeframePicker timeframe={timeframe} multi={multi} onChange={props.onTimeframe} />
      </div>
      <div className="signal-summary-grid">
        <section className="panel scenario-panel">
          <SectionHeading
            title="The next move, in context"
            subtitle="Illustrative paths — not a calibrated prediction interval"
            action={<DirectionBadge direction={analysis.direction} />}
          />
          <ScenarioChart asset={asset} analysis={analysis} candles={props.candles} />
          <div className="scenario-stats">
            <div>
              <span>Current close</span>
              <strong>{formatPrice(analysis.price, asset, true)}</strong>
            </div>
            <div>
              <span>1-ATR reference range</span>
              <strong>
                {formatPrice(range[0], asset)} – {formatPrice(range[1], asset)}
              </strong>
            </div>
            <div>
              <span>Signal strength</span>
              <strong className="mint">
                {analysis.strength}
                <small> / 100</small>
              </strong>
            </div>
          </div>
          <p className="panel-footnote">
            The center path uses technical score × ATR. Outer paths widen by √time × ATR; they have
            no measured coverage probability.
          </p>
        </section>
        <ForecastCard
          analysis={analysis}
          asset={asset}
          timeframe={timeframe}
          onExplore={() => props.onNavigate('backtesting')}
          exploreLabel="Test this signal"
          asOf={candleCloseTime(props.candles[props.candles.length - 1].time, timeframe)}
        />
      </div>
      <div className="indicator-cards">
        <section className="panel indicator-card">
          <div>
            <Gauge size={18} className="purple-text" />
            <span>Relative strength</span>
            <span className="tiny-tag">RSI 14</span>
          </div>
          <strong>
            {i.rsi.toFixed(1)}
            <small>/100</small>
          </strong>
          <div className="rsi-track">
            <span style={{ left: `${i.rsi}%` }} />
          </div>
          <p>
            {i.rsi > 70
              ? 'Overbought; reversal risk is elevated.'
              : i.rsi < 30
                ? 'Oversold; a bounce is possible, not assured.'
                : 'Between oversold and overbought levels.'}
          </p>
        </section>
        <section className="panel indicator-card">
          <div>
            <Zap size={18} className="amber-text" />
            <span>Momentum</span>
            <span className="tiny-tag">MACD</span>
          </div>
          <strong className={i.histogram >= 0 ? 'positive' : 'negative'}>
            {i.histogram >= 0 ? '+' : ''}
            {formatPrice(i.histogram, asset)}
          </strong>
          <p className="indicator-caption">Histogram · 12 / 26 / 9</p>
          <p>
            {i.histogram >= 0 ? 'MACD is above its signal line.' : 'MACD is below its signal line.'}
          </p>
        </section>
        <section className="panel indicator-card">
          <div>
            <TrendingUp size={18} className="mint" />
            <span>Trend structure</span>
            <span className="tiny-tag">EMA</span>
          </div>
          <strong>{i.ema20 >= i.ema50 ? 'Uptrend' : 'Downtrend'}</strong>
          <p className="indicator-caption">EMA 20 {i.ema20 >= i.ema50 ? '>' : '<'} EMA 50</p>
          <p>
            20: {formatPrice(i.ema20, asset)} · 50: {formatPrice(i.ema50, asset)}
          </p>
        </section>
        <section className="panel indicator-card">
          <div>
            <Layers3 size={18} className="blue-text" />
            <span>Volatility</span>
            <span className="tiny-tag">ATR 14</span>
          </div>
          <strong>
            {((i.atr / analysis.price) * 100).toFixed(2)}
            <small>%</small>
          </strong>
          <p className="indicator-caption">{formatPrice(i.atr, asset)} per candle</p>
          <p>Range-based estimate, not maximum loss.</p>
        </section>
      </div>
      <div className="signal-detail-grid">
        <section className="panel">
          <SectionHeading
            title="The signal thesis"
            subtitle="Four technical inputs, one transparent score"
          />
          {analysis.reasons.map((r, index) => (
            <div className="thesis-row" key={r.label}>
              <span className="thesis-number">0{index + 1}</span>
              <div>
                <strong>{r.label}</strong>
                <p>{r.value}</p>
              </div>
              <span className={`thesis-status ${r.positive ? 'supports' : ''}`}>
                {r.positive ? <Check size={13} /> : <Minus size={13} />}
                {r.positive ? 'Aligned' : 'Mixed'}
              </span>
            </div>
          ))}
          <div className="thesis-caution">
            <Info size={17} />
            <p>
              {analysis.direction === 'neutral'
                ? 'The signal is too weak to favor a direction. Waiting is a valid decision.'
                : 'A strong score can still be wrong. Correlated indicators are not independent evidence of future returns.'}
            </p>
          </div>
        </section>
        <section className="panel matrix-panel">
          <SectionHeading
            title="A wider perspective"
            subtitle="Compare the same model across every timeframe"
          />
          <div className="matrix-table">
            <div className="matrix-head">
              <span>Timeframe</span>
              <span>Bias</span>
              <span>RSI</span>
              <span>Strength</span>
            </div>
            {multi.map((m) => (
              <button
                className={`matrix-row ${m.timeframe === timeframe ? 'active' : ''}`}
                key={m.timeframe}
                disabled={!m.analysis}
                onClick={() => props.onTimeframe(m.timeframe)}
              >
                <strong>{TIMEFRAMES.find((t) => t.id === m.timeframe)?.name}</strong>
                {m.analysis ? (
                  <>
                    <DirectionBadge direction={m.analysis.direction} compact />
                    <span>{m.analysis.indicators.rsi.toFixed(1)}</span>
                    <span>
                      {m.analysis.strength}
                      <small> / 100</small>
                      <ChevronRight size={12} />
                    </span>
                  </>
                ) : (
                  <span className="matrix-unavailable">50 completed candles required</span>
                )}
              </button>
            ))}
          </div>
        </section>
      </div>
      <section className="panel methodology-panel">
        <button onClick={() => setMethodOpen(!methodOpen)} aria-expanded={methodOpen}>
          <span>
            <Info size={18} />
            <span>
              <strong>No black box. No accuracy promises.</strong>
              <small>See the model, assumptions, and limitations</small>
            </span>
          </span>
          <ChevronDown size={18} className={methodOpen ? 'rotate' : ''} />
        </button>
        {methodOpen && (
          <div className="methodology-content">
            <p>
              <strong>Technical ensemble:</strong> a weighted combination of bounded EMA 20/50 trend
              (50%), MACD histogram (15%), RSI displacement from 50 (20%), and three-candle momentum
              (15%). Trend, MACD and momentum are scaled by ATR and bounded with tanh before
              weighting. A score above +0.20 is bullish; below −0.20 is bearish. Otherwise the model
              abstains.
            </p>
            <p>
              <strong>Strength:</strong> the absolute score × 100. It is not a probability, verified
              success rate, or trained machine-learning output. Related indicators can reinforce the
              same underlying price behavior.
            </p>
            <p>
              <strong>Reference levels:</strong> the directional stop is 1.2 ATR from the close; the
              target is 2.4 ATR away. Nonpositive reference levels are floored at 0.1% of the close.
              They are research references, not trade instructions. Slippage, gaps, taxes,
              liquidity, financing, and borrowing can materially change outcomes.
            </p>
            <p>
              <strong>Validation:</strong> use chronological real-data backtests and a separate,
              untouched evaluation period. Demo performance reflects generated patterns and provides
              no evidence of market profitability.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
