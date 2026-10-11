import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BellPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Download,
  FlaskConical,
  Info,
  Play,
  Search,
  ShieldCheck,
  Star,
  Wallet,
  X,
} from 'lucide-react';
import { accuracyInterval, backtest } from '../lib/analytics';
import { formatPrice, marketMatches, money, percent } from '../lib/market';
import { positionSize, projectCapital } from '../lib/risk';
import { downloadFile } from '../lib/utils';
import type { MarketPageProps } from './MarketPages';
import { TimeframePicker } from './MarketPages';
import { AssetIcon, DirectionBadge, PageHeading, SectionHeading, Stat } from './UI';
import { LineChart, Sparkline } from './Charts';
import type { AssetClass } from '../lib/types';

export function Backtesting(props: MarketPageProps) {
  const defaultFee = props.asset.category === 'Crypto' ? 10 : 1;
  const [lookback, setLookback] = useState(250);
  const [fee, setFee] = useState(String(defaultFee));
  const [config, setConfig] = useState({ lookback: 250, fee: defaultFee });
  const [page, setPage] = useState(0);
  const [testCount, setTestCount] = useState(0);
  useEffect(() => {
    setFee(String(defaultFee));
    setConfig((c) => ({ ...c, fee: defaultFee }));
    setPage(0);
  }, [props.asset.id, defaultFee]);
  useEffect(() => {
    setPage(0);
  }, [props.timeframe]);
  const result = useMemo(
    () =>
      backtest(
        props.candles,
        config.lookback,
        config.fee,
        10_000,
        props.asset.id === 'usdjpy' ? 'JPY' : 'USD',
      ),
    [props.candles, config, props.asset.id],
  );
  const interval = accuracyInterval(result.accuracy, result.observations);
  const trades = result.trades.slice().reverse();
  const pageSize = 8;
  const maxPage = Math.max(0, Math.ceil(trades.length / pageSize) - 1);
  const safePage = Math.min(page, maxPage);
  const isDemo = props.source.toLowerCase().includes('demo');
  const feeValid =
    fee.trim().length > 0 && Number.isFinite(Number(fee)) && Number(fee) >= 0 && Number(fee) <= 100;
  const changed = lookback !== config.lookback || Number(fee) !== config.fee;
  const exportTrades = () => {
    const metadata = `# Source: ${isDemo ? 'Synthetic demo fixture' : 'Imported user CSV'}; market: ${props.asset.pair}; timeframe: ${props.timeframe}; fee per side: ${config.fee} bps; unlevered one-candle trades; not live results\n`;
    const csv =
      'timestamp,direction,entry,exit,gross_return_pct,net_return_pct,pnl_usd,equity_usd,direction_correct\n' +
      result.trades
        .map((t) =>
          [
            new Date(t.time).toISOString(),
            t.direction,
            t.entry,
            t.exit,
            t.grossReturn * 100,
            t.netReturn * 100,
            t.pnl,
            t.equity,
            t.correct,
          ].join(','),
        )
        .join('\n');
    downloadFile(
      `vector-${props.asset.id}-${props.timeframe}-backtest.csv`,
      metadata + csv,
      'text/csv',
    );
  };
  return (
    <>
      <PageHeading
        eyebrow="EVIDENCE OVER EXPECTATIONS"
        title="Test before you trust."
        subtitle="Walk forward through history. Include the costs. See the full picture."
        actions={
          <button
            className="button secondary"
            onClick={exportTrades}
            disabled={!result.trades.length}
          >
            <Download size={15} />
            Export results
          </button>
        }
      />
      <div className={`notice-banner ${isDemo ? 'amber-notice' : ''}`}>
        <FlaskConical size={19} />
        <div>
          <strong>
            {isDemo
              ? 'A simulation, not a track record.'
              : 'Historical simulation, not a future guarantee.'}
          </strong>
          <p>
            {isDemo
              ? 'These results use generated price patterns. They do not validate accuracy or profitability in real markets. Import your own history to evaluate the model.'
              : 'User-supplied data has not been independently verified. Historical results can be misleading, especially with small samples or repeated strategy selection.'}
          </p>
        </div>
        {isDemo && (
          <button className="text-link" onClick={props.onImport}>
            Import real history
            <ArrowRight size={14} />
          </button>
        )}
      </div>
      <section className="panel backtest-controls">
        <div className="analysis-context-bar">
          <div>
            <AssetIcon asset={props.asset} small />
            <strong>{props.asset.pair}</strong>
          </div>
          <TimeframePicker
            timeframe={props.timeframe}
            multi={props.multi}
            onChange={props.onTimeframe}
          />
        </div>
        <div className="test-form">
          <label>
            Evaluation window
            <select value={lookback} onChange={(e) => setLookback(Number(e.target.value))}>
              <option value={100}>Last 100 completed candles</option>
              <option value={250}>Last 250 completed candles</option>
              <option value={500}>Last 500 completed candles</option>
              <option value={1000}>Last 1,000 completed candles</option>
            </select>
          </label>
          <label>
            Fee / spread per side
            <div className="input-suffix">
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                aria-invalid={!feeValid}
              />
              <span>bps</span>
            </div>
          </label>
          <div className="test-capital">
            <span>Starting equity</span>
            <strong>$10,000.00</strong>
            <small>1× exposure · no leverage</small>
          </div>
          <button
            className="button primary"
            disabled={!feeValid}
            onClick={() => {
              setConfig({ lookback, fee: Number(fee) });
              setPage(0);
              setTestCount((n) => n + 1);
            }}
          >
            <Play size={14} fill="currentColor" />
            Run backtest
          </button>
        </div>
        <p className="controls-note" aria-live="polite">
          {!feeValid
            ? 'Enter a fee from 0 to 100 bps per side.'
            : changed
              ? 'Settings changed. Run the backtest to apply them.'
              : `Evaluated ${result.eligibleBars} candles with ${config.fee} bps per side.${testCount ? ' Backtest updated.' : ''} Market/timeframe changes recalculate automatically.`}
        </p>
      </section>
      <div className="backtest-stat-grid">
        <section className="panel">
          <Stat
            label="Directional hit rate"
            value={result.observations ? `${result.accuracy.toFixed(1)}%` : '—'}
            detail={`${result.observations} scored signals · before costs`}
            tone={result.accuracy > result.baselineAccuracy ? 'positive' : ''}
          />
        </section>
        <section className="panel">
          <Stat
            label="Net return"
            value={result.trades.length ? percent(result.totalReturn) : '—'}
            detail={`After ${money(result.feesPaid, 2)} in modeled costs`}
            tone={result.totalReturn >= 0 ? 'positive' : 'negative'}
          />
        </section>
        <section className="panel">
          <Stat
            label="Maximum drawdown"
            value={result.trades.length ? `${result.maxDrawdown.toFixed(2)}%` : '—'}
            detail="Peak-to-trough equity decline"
            tone="negative"
          />
        </section>
        <section className="panel">
          <Stat
            label="Profit factor"
            value={
              result.trades.length
                ? result.profitFactor === null
                  ? 'No losing trades'
                  : `${result.profitFactor.toFixed(2)}×`
                : '—'
            }
            detail={`${result.winRate.toFixed(1)}% net winning trades`}
          />
        </section>
      </div>
      <div className="backtest-chart-grid">
        <section className="panel equity-panel">
          <SectionHeading
            title="Equity, with costs included"
            subtitle={`${props.asset.pair} · ${props.timeframe} · one-candle holding period`}
            action={<span className="subtle-tag">{isDemo ? 'SIMULATED' : 'HISTORICAL TEST'}</span>}
          />
          <div className="equity-header">
            <strong>{money(result.equity[result.equity.length - 1]?.value ?? 10000, 2)}</strong>
            <span className={result.totalReturn >= 0 ? 'positive' : 'negative'}>
              {percent(result.totalReturn)}
            </span>
          </div>
          {result.trades.length ? (
            <LineChart
              points={result.equity.map((p) => ({
                value: p.value,
                label: new Date(p.time).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  timeZone: 'UTC',
                }),
              }))}
              color={result.totalReturn >= 0 ? '#59e5b3' : '#ed8593'}
              label="Hypothetical backtest equity in US dollars, net of modeled costs"
            />
          ) : (
            <div className="chart-empty">
              <CircleHelp size={28} />
              <strong>No eligible trades in this window</strong>
              <p>
                Monthly or short imports may have little history after the 50-candle warm-up. Expand
                the window or choose a lower timeframe.
              </p>
            </div>
          )}
          <div className="panel-footnote">
            Hypothetical equity. Directional accuracy does not imply positive net returns.
          </div>
        </section>
        <section className="panel validation-panel">
          <SectionHeading
            title="How strong is the evidence?"
            action={<ShieldCheck size={18} className="mint" />}
          />
          <div className="baseline-row">
            <div>
              <span>Technical ensemble</span>
              <strong>{result.observations ? `${result.accuracy.toFixed(1)}%` : '—'}</strong>
            </div>
            <div className="evidence-track">
              <span style={{ width: `${result.accuracy}%` }} />
            </div>
          </div>
          <div className="baseline-row baseline">
            <div>
              <span>Previous-candle baseline</span>
              <strong>
                {result.observations ? `${result.baselineAccuracy.toFixed(1)}%` : '—'}
              </strong>
            </div>
            <div className="evidence-track">
              <span style={{ width: `${result.baselineAccuracy}%` }} />
            </div>
          </div>
          <div className="validation-details">
            <div>
              <span>Approx. 95% interval*</span>
              <strong>
                {result.observations ? `${interval[0].toFixed(1)}–${interval[1].toFixed(1)}%` : '—'}
              </strong>
            </div>
            <div>
              <span>Model abstentions</span>
              <strong>{result.abstentions}</strong>
            </div>
            <div>
              <span>Observation quality</span>
              <strong className={isDemo || result.observations < 30 ? 'amber-text' : ''}>
                {isDemo
                  ? 'Synthetic fixture'
                  : result.observations < 30
                    ? 'Small sample'
                    : 'User-provided'}
              </strong>
            </div>
          </div>
          <p className="risk-note">
            *Wilson interval assumes independent outcomes; serial dependence may make it
            overconfident. Baseline uses the prior candle's direction on the same scored
            observations.
          </p>
        </section>
      </div>
      <section className="panel trade-history">
        <SectionHeading
          title="Trade-by-trade, nothing hidden"
          subtitle="Most recent first · hypothetical next-open entry, same-candle-close exit"
          action={<span className="subtle-tag">{trades.length} TRADES</span>}
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Entry time · UTC</th>
                <th>Model bias</th>
                <th>Entry</th>
                <th>Exit</th>
                <th>Direction correct</th>
                <th>Net P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {trades.slice(safePage * pageSize, (safePage + 1) * pageSize).map((t) => (
                <tr key={t.time}>
                  <td>
                    {new Date(t.time).toLocaleString('en-GB', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'UTC',
                    })}
                  </td>
                  <td>
                    <DirectionBadge direction={t.direction} compact />
                  </td>
                  <td>{formatPrice(t.entry, props.asset)}</td>
                  <td>{formatPrice(t.exit, props.asset)}</td>
                  <td>
                    <span className={t.correct ? 'positive' : 'muted'}>
                      {t.correct ? <Check size={15} /> : <X size={15} />}
                      {t.correct ? 'Yes' : 'No / flat'}
                    </span>
                  </td>
                  <td className={t.pnl >= 0 ? 'positive' : 'negative'}>
                    {t.pnl >= 0 ? '+' : '−'}
                    {money(Math.abs(t.pnl), 2)}
                    <small>{percent(t.netReturn * 100)}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!trades.length && (
            <div className="inline-empty">No trades to display for this evaluation window.</div>
          )}
        </div>
        <div className="pagination">
          <span>
            {trades.length
              ? `${safePage * pageSize + 1}–${Math.min((safePage + 1) * pageSize, trades.length)} of ${trades.length} trades`
              : '0 trades'}
          </span>
          <div>
            <button
              className="icon-button"
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
              aria-label="Previous trades"
            >
              <ChevronLeft size={16} />
            </button>
            <span>Page {safePage + 1}</span>
            <button
              className="icon-button"
              disabled={safePage >= maxPage}
              onClick={() => setPage(safePage + 1)}
              aria-label="Next trades"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
      <section className="test-method">
        <Info size={18} />
        <div>
          <strong>What this test does — and doesn't do</strong>
          <p>
            Each signal uses only prior closed candles, after a 50-candle warm-up. Bullish and
            bearish setups are held for one candle at 1× notional; neutral scores are skipped. Costs
            apply to entry and exit. This is not a target/stop execution backtest. It excludes
            slippage, funding, borrow fees, taxes, liquidity constraints, and exchange limits. Short
            trades require margin or a suitable product and can lose more than the initial balance.
            USDJPY profits/losses convert from JPY to USD at exit; other instruments are USD quoted.
            Simulation stops at nonpositive equity and does not model broker liquidation. The model
            has not been trained or independently validated; do not interpret repeated backtest
            selection as out-of-sample evidence.
          </p>
        </div>
      </section>
    </>
  );
}

interface RiskProps extends MarketPageProps {
  onCapital: (value: number) => void;
  onRiskPercent: (value: number) => void;
}
export function RiskAndIncome(props: RiskProps) {
  const [side, setSide] = useState<'long' | 'short'>(props.analysis.score >= 0 ? 'long' : 'short');
  const [entry, setEntry] = useState(String(props.analysis.price));
  const [stop, setStop] = useState(String(props.analysis.stop));
  const [target, setTarget] = useState(String(props.analysis.target));
  const [fee, setFee] = useState(String(props.asset.category === 'Crypto' ? 10 : 1));
  const [contribution, setContribution] = useState(250);
  const [withdrawal, setWithdrawal] = useState(250);
  const [annualReturn, setAnnualReturn] = useState(6);
  const [months, setMonths] = useState(36);
  useEffect(() => {
    setSide(props.analysis.score >= 0 ? 'long' : 'short');
    setEntry(props.analysis.price.toFixed(props.asset.decimals));
    setStop(props.analysis.stop.toFixed(props.asset.decimals));
    setTarget(props.analysis.target.toFixed(props.asset.decimals));
    setFee(String(props.asset.category === 'Crypto' ? 10 : 1));
  }, [
    props.asset.id,
    props.timeframe,
    props.asset.decimals,
    props.asset.category,
    props.analysis.price,
    props.analysis.stop,
    props.analysis.target,
    props.analysis.score,
  ]);
  const changeSide = (newSide: 'long' | 'short') => {
    setSide(newSide);
    const sign = newSide === 'long' ? 1 : -1;
    const price = Number(entry) || props.analysis.price;
    setStop(
      Math.max(price * 0.001, price - sign * props.analysis.indicators.atr * 1.2).toFixed(
        props.asset.decimals,
      ),
    );
    setTarget((price + sign * props.analysis.indicators.atr * 2.4).toFixed(props.asset.decimals));
  };
  const feeValid = fee.trim() !== '' && Number(fee) >= 0 && Number(fee) <= 100;
  const directionValid =
    side === 'long'
      ? Number(stop) < Number(entry) && Number(target) > Number(entry)
      : Number(stop) > Number(entry) && Number(target) < Number(entry);
  const sizing = positionSize(
    props.capital,
    props.riskPercent,
    Number(entry),
    Number(stop),
    Number(target),
    feeValid ? Number(fee) : NaN,
    props.asset.id === 'usdjpy' ? 'USDJPY' : 1,
  );
  const valid = sizing.valid && directionValid;
  const points = projectCapital(props.capital, contribution, annualReturn, months, withdrawal);
  const downside = projectCapital(props.capital, contribution, -15, months, withdrawal);
  const zeroReturn = projectCapital(props.capital, contribution, 0, months, withdrawal);
  const endCapital = points[points.length - 1]?.value ?? 0;
  const requiredCapital = annualReturn > 0 ? (withdrawal * 12) / (annualReturn / 100) : null;
  const exportPlan = () =>
    downloadFile(
      'vector-hypothetical-risk-plan.json',
      JSON.stringify(
        {
          kind: 'Hypothetical research plan — not an order',
          market: props.asset.pair,
          source: props.source,
          timeframe: props.timeframe,
          accountCurrency: 'USD',
          side,
          entry: Number(entry),
          stop: Number(stop),
          target: Number(target),
          feeBpsPerSide: Number(fee),
          ...sizing,
          assumptions:
            '1x notional; fees estimated; USDJPY P&L converted at stop/target FX rates; slippage, gaps, funding, borrow costs, taxes and liquidity omitted. Stop losses are not guaranteed.',
        },
        null,
        2,
      ),
      'application/json',
    );
  return (
    <>
      <PageHeading
        eyebrow="CAPITAL COMES FIRST"
        title="Protect your downside."
        subtitle="Size with intention. Plan cashflow without mistaking a scenario for a promise."
        actions={
          <button className="button secondary" onClick={exportPlan} disabled={!valid}>
            <Download size={15} />
            Export risk plan
          </button>
        }
      />
      <div className="analysis-context-bar">
        <div>
          <AssetIcon asset={props.asset} small />
          <strong>{props.asset.pair}</strong>
          <span className="source-pill">
            <span className="mini-dot" />
            {props.source}
          </span>
        </div>
        <TimeframePicker
          timeframe={props.timeframe}
          multi={props.multi}
          onChange={props.onTimeframe}
        />
      </div>
      <div className="risk-calculator-grid">
        <section className="panel sizing-form">
          <SectionHeading
            title="Position calculator"
            subtitle="A hypothetical setup, never an automated order"
            action={<ShieldCheck size={18} className="mint" />}
          />
          <div className="form-grid">
            <label>
              Account balance
              <div className="input-prefix">
                <span>$</span>
                <input
                  type="number"
                  min="1"
                  max="100000000"
                  value={props.capital || ''}
                  onChange={(e) =>
                    props.onCapital(Math.min(100_000_000, Math.max(0, Number(e.target.value))))
                  }
                />
              </div>
            </label>
            <label>
              Risk per setup
              <div className="input-suffix">
                <input
                  type="number"
                  min="0.25"
                  max="5"
                  step="0.25"
                  value={props.riskPercent || ''}
                  onChange={(e) =>
                    props.onRiskPercent(Math.min(5, Math.max(0, Number(e.target.value))))
                  }
                />
                <span>%</span>
              </div>
            </label>
          </div>
          <div className="risk-presets">
            {[0.5, 1, 2].map((r) => (
              <button
                className={r === props.riskPercent ? 'active' : ''}
                onClick={() => props.onRiskPercent(r)}
                key={r}
              >
                {r}% risk
              </button>
            ))}
            <span>5% maximum</span>
          </div>
          <div className="side-toggle">
            <button
              className={side === 'long' ? 'active long' : ''}
              onClick={() => changeSide('long')}
            >
              <ArrowUpRight size={16} />
              Bullish / long
            </button>
            <button
              className={side === 'short' ? 'active short' : ''}
              onClick={() => changeSide('short')}
            >
              <ArrowDownRight size={16} />
              Bearish / short
            </button>
          </div>
          <div className="form-grid price-inputs">
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
            <label>
              Costs per side
              <div className="input-suffix">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                />
                <span>bps</span>
              </div>
            </label>
          </div>
          {!valid && (
            <p className="validation-error" role="alert">
              Enter positive prices, risk ≤5%, and a target opposite the stop. The target must cover
              modeled costs.
            </p>
          )}
          <div className="calculator-note">
            <Info size={15} />
            <p>
              {props.asset.id === 'usdjpy'
                ? 'JPY stop/target cashflows convert to USD at their reference FX rates. '
                : 'USD account; USD-quoted instrument. '}
              Sizing uses 1× notional, not borrowed capital.{' '}
              {side === 'short' &&
                'Shorting requires margin or a suitable product; borrow costs are not included.'}
            </p>
          </div>
        </section>
        <section className="panel size-result">
          <div className="small-label">
            <Wallet size={15} />
            HYPOTHETICAL POSITION
          </div>
          <div className="position-units">
            <strong>
              {valid
                ? sizing.units.toLocaleString('en-US', {
                    maximumFractionDigits: props.asset.category === 'Crypto' ? 6 : 2,
                  })
                : '—'}
            </strong>
            <span>
              {props.asset.id === 'usdjpy'
                ? 'USD base units'
                : props.asset.category === 'Crypto'
                  ? props.asset.symbol
                  : `${props.asset.symbol} base units`}
            </span>
          </div>
          <p className="size-notional">
            {valid ? money(sizing.notional, 2) : '—'} notional ·{' '}
            {valid ? sizing.allocation.toFixed(1) : '—'}% allocation
          </p>
          <div className="position-risk-bar">
            <span style={{ width: `${valid ? Math.min(100, sizing.allocation) : 0}%` }} />
          </div>
          <div className="sizing-stats">
            <div>
              <span>Modeled loss at stop, incl. costs</span>
              <strong className="negative">{valid ? money(sizing.actualRisk, 2) : '—'}</strong>
            </div>
            <div>
              <span>Modeled gain at target, incl. costs</span>
              <strong className="positive">{valid ? money(sizing.reward, 2) : '—'}</strong>
            </div>
            <div>
              <span>Net reward / risk</span>
              <strong>{valid ? `${sizing.rewardRisk.toFixed(2)}R` : '—'}</strong>
            </div>
            <div>
              <span>Risk budget</span>
              <strong>{money((props.capital * props.riskPercent) / 100, 2)}</strong>
            </div>
          </div>
          {valid && sizing.capitalLimited && (
            <div className="capital-limit">
              <Info size={15} />
              Position capped at available capital. No leverage added.
            </div>
          )}
          <p className="size-warning">
            <ShieldCheck size={17} />A stop is not insurance. Gaps, slippage, and platform failures
            can cause larger losses.
          </p>
        </section>
      </div>
      <div className="income-heading">
        <div>
          <span className="eyebrow">LONG-TERM THINKING</span>
          <h2>Make a plan. Not a promise.</h2>
          <p>A hypothetical cashflow planner, not a passive-income product.</p>
        </div>
        <span className="subtle-tag">SCENARIO EXPLORER</span>
      </div>
      <section className="panel income-planner">
        <div className="income-controls">
          <label>
            Monthly contribution
            <div className="input-prefix">
              <span>$</span>
              <input
                type="number"
                min="0"
                max="1000000"
                value={contribution}
                onChange={(e) =>
                  setContribution(Math.min(1_000_000, Math.max(0, Number(e.target.value))))
                }
              />
            </div>
          </label>
          <label>
            Monthly withdrawal goal
            <div className="input-prefix">
              <span>$</span>
              <input
                type="number"
                min="0"
                max="1000000"
                value={withdrawal}
                onChange={(e) =>
                  setWithdrawal(Math.min(1_000_000, Math.max(0, Number(e.target.value))))
                }
              />
            </div>
          </label>
          <label>
            Hypothetical annual return
            <div className="input-suffix">
              <input
                type="number"
                min="-30"
                max="30"
                step="0.5"
                value={annualReturn}
                onChange={(e) =>
                  setAnnualReturn(Math.min(30, Math.max(-30, Number(e.target.value))))
                }
              />
              <span>%</span>
            </div>
          </label>
          <label>
            Planning horizon
            <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              <option value={12}>1 year</option>
              <option value={36}>3 years</option>
              <option value={60}>5 years</option>
              <option value={120}>10 years</option>
            </select>
          </label>
        </div>
        <div className="income-stat-row">
          <Stat
            label="Projected closing capital"
            value={money(endCapital)}
            detail={`Starts at ${money(props.capital)} · includes deposits & withdrawals`}
          />
          <Stat
            label="Scheduled annual withdrawals"
            value={money(withdrawal * 12)}
            detail="May be funded from deposits or principal"
          />
          <Stat
            label="Capital at the assumed annual yield*"
            value={requiredCapital === null ? 'No positive yield' : money(requiredCapital)}
            detail="Annual withdrawal ÷ chosen return, before tax and costs"
          />
        </div>
        <div className="income-chart-wrap">
          <LineChart
            points={points.map((p) => ({
              value: p.value,
              label: p.month ? `Month ${p.month}` : 'Start',
            }))}
            secondary={downside.map((p) => ({ value: p.value }))}
            secondary2={zeroReturn.map((p) => ({ value: p.value }))}
            label="Hypothetical account balances under selected, negative 15 percent, and zero percent annual return scenarios"
            height={260}
          />
          <div className="chart-legend">
            <span>
              <span className="legend-dot mint-bg" />
              Your scenario: {annualReturn}% annual
            </span>
            <span>
              <span className="legend-dot red-bg" />
              Downside reference: −15%
            </span>
            <span>
              <span className="legend-dot purple" />
              Zero-return reference: 0%
            </span>
          </div>
        </div>
        <p className="panel-footnote">
          Constant monthly compounding; deposits and scheduled withdrawals occur at month-end.
          Balances are floored at zero; withdrawals may become unfundable. Excludes costs, tax,
          inflation and variable returns. *An arithmetic illustration, not sustainable-income
          evidence.
        </p>
      </section>
      <div className="notice-banner amber-notice">
        <ShieldCheck size={21} />
        <div>
          <strong>There is no guaranteed passive income from trading.</strong>
          <p>
            Trading requires active decisions and can lose your principal. Staking and yield
            products also carry market, custody, liquidity, and smart-contract risks. Scenarios are
            not forecasts. Keep emergency savings separate and use only capital you can afford to
            lose.
          </p>
        </div>
      </div>
    </>
  );
}

export function Watchlist(
  props: MarketPageProps & { onToggleWatch: (id: string) => void; onAlerts: () => void },
) {
  const [category, setCategory] = useState<'All' | AssetClass>('All');
  const [query, setQuery] = useState('');
  const [savedOnly, setSavedOnly] = useState(false);
  const visible = props.snapshots.filter(
    (s) =>
      (category === 'All' || s.asset.category === category) &&
      (!savedOnly || props.watchlist.includes(s.asset.id)) &&
      marketMatches(s.asset, query),
  );
  const saved = props.snapshots.filter((s) => props.watchlist.includes(s.asset.id));
  const inspect = (asset: MarketPageProps['asset']) => {
    props.onAsset(asset);
    props.onNavigate('overview');
  };
  return (
    <>
      <PageHeading
        eyebrow="YOUR MARKET UNIVERSE"
        title="Keep your opportunities close."
        subtitle="Crypto and forex, organized around the markets you care about."
        actions={
          <button className="button secondary" onClick={props.onAlerts}>
            <BellPlus size={15} />
            Snapshot alerts
          </button>
        }
      />
      <div className="watchlist-stats">
        <section className="panel">
          <Stat
            label="Markets saved"
            value={saved.length.toString().padStart(2, '0')}
            detail="Stored locally in this browser"
          />
        </section>
        <section className="panel">
          <Stat
            label="Crypto on your radar"
            value={saved
              .filter((s) => s.asset.category === 'Crypto')
              .length.toString()
              .padStart(2, '0')}
            detail="Digital-asset research"
          />
        </section>
        <section className="panel">
          <Stat
            label="Forex on your radar"
            value={saved
              .filter((s) => s.asset.category === 'Forex')
              .length.toString()
              .padStart(2, '0')}
            detail="Currency-pair research"
          />
        </section>
      </div>
      <section className="panel market-universe">
        <div className="universe-controls">
          <div className="segmented">
            {(['All', 'Crypto', 'Forex'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={category === c ? 'active' : ''}
              >
                {c === 'All' ? 'All markets' : c}
              </button>
            ))}
          </div>
          <div className="universe-filters">
            <button
              className={`saved-filter ${savedOnly ? 'active' : ''}`}
              onClick={() => setSavedOnly(!savedOnly)}
              aria-pressed={savedOnly}
            >
              <Star size={14} fill={savedOnly ? 'currentColor' : 'none'} />
              Saved only
            </button>
            <label className="search-input">
              <Search size={16} />
              <input
                aria-label="Filter markets"
                placeholder="Search markets…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
        </div>
        <div className="table-scroll">
          <table className="universe-table">
            <thead>
              <tr>
                <th aria-label="Saved" />
                <th>Market</th>
                <th>Last price</th>
                <th>24h change*</th>
                <th>Price history</th>
                <th>1H bias*</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <tr key={s.asset.id}>
                  <td>
                    <button
                      className={`star-button ${props.watchlist.includes(s.asset.id) ? 'saved' : ''}`}
                      aria-label={`${props.watchlist.includes(s.asset.id) ? 'Remove' : 'Add'} ${s.asset.name} ${props.watchlist.includes(s.asset.id) ? 'from' : 'to'} watchlist`}
                      aria-pressed={props.watchlist.includes(s.asset.id)}
                      onClick={() => props.onToggleWatch(s.asset.id)}
                    >
                      <Star
                        size={17}
                        fill={props.watchlist.includes(s.asset.id) ? 'currentColor' : 'none'}
                      />
                    </button>
                  </td>
                  <td>
                    <button className="market-name-button" onClick={() => inspect(s.asset)}>
                      <AssetIcon asset={s.asset} />
                      <span>
                        <strong>{s.asset.pair}</strong>
                        <small>
                          {s.asset.name} <span>· {s.asset.category}</span>
                        </small>
                      </span>
                    </button>
                  </td>
                  <td className="universe-price">{formatPrice(s.price, s.asset, true)}</td>
                  <td className={s.change >= 0 ? 'positive' : 'negative'}>{percent(s.change)}</td>
                  <td>
                    <Sparkline
                      values={s.candles.slice(-28).map((c) => c.close)}
                      color={s.change >= 0 ? '#59e5b3' : '#ed8593'}
                    />
                  </td>
                  <td>
                    {s.analysis ? (
                      <DirectionBadge direction={s.analysis.direction} compact />
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`Analyze ${s.asset.pair}`}
                      onClick={() => inspect(s.asset)}
                    >
                      <ArrowRight size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length && (
            <div className="large-empty">
              <Search size={30} />
              <h3>No markets found</h3>
              <p>Try another search or switch off the saved-only filter.</p>
              <button
                className="button secondary"
                onClick={() => {
                  setQuery('');
                  setCategory('All');
                  setSavedOnly(false);
                }}
              >
                Reset filters
              </button>
            </div>
          )}
        </div>
        <div className="panel-footnote">
          {visible.length} markets · Demo quotes are synthetic, not live. *Imports use 24-bar change
          and the nearest supported snapshot interval.
        </div>
      </section>
      <div className="research-banner">
        <div className="banner-icon">
          <BellPlus size={22} />
        </div>
        <div>
          <strong>Research alerts, on your terms.</strong>
          <p>
            Save price thresholds and check them against your loaded snapshot. No live monitoring or
            trade execution.
          </p>
        </div>
        <button className="text-link" onClick={props.onAlerts}>
          Manage alerts
          <ArrowRight size={15} />
        </button>
      </div>
    </>
  );
}
