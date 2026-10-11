import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Download,
  Globe2,
  ListChecks,
  LoaderCircle,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { accuracyInterval } from '../lib/analytics';
import { downloadFile } from '../lib/utils';
import { extensionRequest, installedExtension, updatePreferences } from './bridge';
import { getLiveMarket, LIVE_MARKETS, LIVE_TIMEFRAMES, livePrice, liveTimestamp } from './catalog';
import { predictionStats } from './predictions';
import type { PageReading, PaperPrediction, WorkspaceState } from './types';

const outcomeLabels: Record<string, string> = {
  target: 'Target touched',
  stop: 'Stop touched',
  target_gap: 'Opened beyond target',
  stop_gap: 'Opened beyond stop',
  expiry: 'Expired at candle close',
  both_levels: 'Both levels in one minute; order unknown',
  entry_minute: 'Entry-minute timing is unknown',
  missing_history: 'Gap in minute history; outcome unknown',
};
function exactTime(time: number) {
  return new Date(time).toISOString().replace('T', ' ').replace('.000Z', ' UTC');
}
export default function PredictionWorkflow({
  state,
  onState,
}: {
  state: WorkspaceState;
  onState: (state: WorkspaceState) => void;
}) {
  const installed = installedExtension(),
    prefs = state.settings.preferences;
  const market = getLiveMarket(prefs.marketId),
    records = state.predictions ?? [],
    stats = predictionStats(records);
  const snapshot =
    state.snapshot?.marketId === market.id && state.snapshot.timeframe === prefs.timeframe
      ? state.snapshot
      : null;
  const action =
    snapshot?.analysis?.direction === 'bullish'
      ? 'BUY'
      : snapshot?.analysis?.direction === 'bearish'
        ? 'SELL'
        : 'WAIT';
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const [reading, setReading] = useState<PageReading | null>(null),
    [proposedMarket, setProposedMarket] = useState(prefs.marketId),
    [proposedTf, setProposedTf] = useState(prefs.timeframe);
  const [confirmed, setConfirmed] = useState(false),
    [notional, setNotional] = useState('1000');
  useEffect(() => {
    setConfirmed(false);
  }, [prefs.marketId, prefs.timeframe]);
  const useReply = (reply: Awaited<ReturnType<typeof extensionRequest>>) => {
    if (reply.ok) {
      onState(reply.state);
      return true;
    }
    setError(reply.error);
    return false;
  };
  const readPage = async () => {
    setOpen(true);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const reply = await extensionRequest({ type: 'READ_ACTIVE_PAGE' });
      if (useReply(reply) && reply.ok && reply.pageReading) {
        setReading(reply.pageReading);
        setProposedMarket(reply.pageReading.marketId ?? prefs.marketId);
        setProposedTf(reply.pageReading.timeframe ?? prefs.timeframe);
        setConfirmed(false);
      }
    } finally {
      setBusy(false);
    }
  };
  const applyPage = async () => {
    setBusy(true);
    setError('');
    try {
      const reply = await updatePreferences({ marketId: proposedMarket, timeframe: proposedTf });
      if (useReply(reply)) {
        useReply(await extensionRequest({ type: 'REFRESH', force: true }));
        setMessage('Live reference data loaded. Check the confirmation box before recording.');
        setConfirmed(false);
      }
    } finally {
      setBusy(false);
    }
  };
  const record = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const reply = await extensionRequest({
        type: 'RECORD_PREDICTION',
        marketId: prefs.marketId,
        timeframe: prefs.timeframe,
        notional: Number(notional),
        confirmed,
        pageHost: reading?.host,
      });
      if (useReply(reply) && reply.ok)
        setMessage(
          reply.prediction?.action === 'WAIT'
            ? 'WAIT recorded as an abstention—not a trade or win.'
            : `${reply.prediction?.action} saved before future prices. Stop, target, expiry and costs are locked.`,
        );
    } finally {
      setBusy(false);
    }
  };
  const check = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (useReply(await extensionRequest({ type: 'CHECK_PREDICTIONS' })))
        setMessage(
          'Checked up to 3 pending calls using closed 1-minute bars. Unknown or missing outcomes are not counted as wins.',
        );
    } finally {
      setBusy(false);
    }
  };
  const exportLedger = () =>
    downloadFile(
      'vector-forward-paper-predictions.json',
      JSON.stringify(
        {
          product: 'Vector Live 1.1',
          evaluation:
            'Forward-recorded paper calls: stop/target/expiry using closed 1-minute provider bars.',
          model: 'Rule-based technical-v1, not AI or independently validated accuracy.',
          exportedAt: new Date().toISOString(),
          records,
          stats,
          limitations: [
            'Reference quotes, not broker fills or live executed trades.',
            'Fees locked at creation. Slippage/funding/borrow/tax omitted.',
            'Unknown intrabar order, entry-minute level touches and missing bars are ambiguous.',
            'WAIT/pending/ambiguous excluded from measured win rate; currencies never combined.',
            'Local ledger is not tamper-proof and may be cleared as a new evaluation period.',
            'No guarantee of future accuracy or passive income.',
          ],
        },
        null,
        2,
      ),
      'application/json',
    );
  const clear = async () => {
    if (
      !window.confirm(
        'Export first if needed. Clear ALL recorded calls, wins and losses? This starts a new evaluation period.',
      )
    )
      return;
    setBusy(true);
    try {
      if (useReply(await extensionRequest({ type: 'CLEAR_PREDICTIONS', confirmed: true })))
        setMessage('Entire ledger cleared. No selected losing call was removed.');
    } finally {
      setBusy(false);
    }
  };
  const interval = accuracyInterval(stats.winRate ?? 0, stats.scored);
  return (
    <section className="ex-forward" aria-label="Page predictions and forward results">
      <button className="ex-forward-heading" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>
          <ListChecks size={16} />
          <strong>Page → BUY / SELL / WAIT</strong>
          <small>
            {records.length
              ? `${stats.pending} pending · ${stats.wins} wins · ${stats.losses} losses`
              : 'Save a call. Measure what happens next.'}
          </small>
        </span>
        <ChevronDown size={15} className={open ? 'is-open' : ''} />
      </button>
      {open && (
        <div className="ex-forward-body">
          <p className="ex-forward-intro">
            Read chart metadata, confirm the pair, then record a technical paper call. No AI API,
            screenshot upload, or real order execution.
          </p>
          <button
            className="ex-button secondary"
            onClick={() => {
              void readPage();
            }}
            disabled={busy || !installed}
          >
            <ScanLine size={14} />
            Analyze current chart page
          </button>
          {!installed && (
            <p className="ex-forward-mini">
              Install to read the active tab and retain your ledger. Preview records last only in
              this tab.
            </p>
          )}
          {reading && (
            <div className="ex-page-reading">
              <span>
                <Globe2 size={12} />
                {reading.host}
              </span>
              <p>{reading.title}</p>
              <small>{reading.warning}</small>
              <div className="ex-page-inputs">
                <label>
                  Confirm chart market
                  <select
                    value={proposedMarket}
                    onChange={(e) => setProposedMarket(e.target.value)}
                  >
                    {LIVE_MARKETS.map((m) => (
                      <option value={m.id} key={m.id}>
                        {m.base}/{m.quote}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Confirm chart timeframe
                  <select
                    value={proposedTf}
                    onChange={(e) => setProposedTf(e.target.value as typeof proposedTf)}
                  >
                    {LIVE_TIMEFRAMES.map((tf) => (
                      <option value={tf.id} key={tf.id}>
                        {tf.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                className="ex-button secondary"
                disabled={busy}
                onClick={() => {
                  void applyPage();
                }}
              >
                Use confirmed chart
                <ArrowRight size={13} />
              </button>
            </div>
          )}
          <div className="ex-record-call">
            <div className="ex-call-title">
              <span className={`ex-action ${action.toLowerCase()}`}>{action}</span>
              <span>
                {market.base}/{market.quote} ·{' '}
                {LIVE_TIMEFRAMES.find((tf) => tf.id === prefs.timeframe)?.label}
              </span>
            </div>
            <label>
              Hypothetical notional · {market.category === 'Crypto' ? 'USDT' : 'USD'}
              <input
                type="number"
                min="1"
                max="1000000"
                step="any"
                value={notional}
                onChange={(e) => setNotional(e.target.value)}
              />
            </label>
            <label className="ex-forward-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I confirm this market/timeframe and understand these are paper results.
            </label>
            <button
              className="ex-button primary"
              disabled={busy || !confirmed || !snapshot?.analysis}
              onClick={() => {
                void record();
              }}
            >
              {busy ? <LoaderCircle size={14} className="ex-spin" /> : <CheckCircle2 size={14} />}
              Record {action} prediction
            </button>
            <p>
              Fresh quote ≤30s. Stop 1.2 ATR / target 2.4 ATR from the reference entry. Expires at
              the end of the current selected UTC candle. One immutable call per
              pair/timeframe/expiry. WAIT does not open a position. Press Check outcomes later, or
              opt in to background checks below.
            </p>
          </div>
          <div className="ex-forward-stats">
            <div>
              <span>Forward net win rate</span>
              <strong>{stats.winRate === null ? '—' : stats.winRate.toFixed(1) + '%'}</strong>
              <small>
                {stats.scored} scored paper outcomes · {stats.flat} flat
              </small>
            </div>
            <div>
              <span>Wins / Losses</span>
              <strong>
                <b className="ex-mint">{stats.wins}</b> / <b className="ex-red">{stats.losses}</b>
              </strong>
              <small>
                {stats.ambiguous} ambiguous · {stats.waits} WAIT
              </small>
            </div>
          </div>
          {stats.scored > 0 && (
            <p className="ex-forward-mini">
              Approx. Wilson 95% interval {interval[0].toFixed(1)}–{interval[1].toFixed(1)}%.
              Samples may be dependent; measured results are not future odds.
            </p>
          )}
          <div className="ex-forward-pnl">
            <span>Net paper P&amp;L, after costs</span>
            <strong>
              {stats.netUSDT >= 0 ? '+' : ''}
              {stats.netUSDT.toFixed(2)} USDT
            </strong>
            <strong>
              {stats.netUSD >= 0 ? '+' : ''}
              {stats.netUSD.toFixed(2)} USD
            </strong>
          </div>
          <label className="ex-forward-confirm">
            <input
              type="checkbox"
              checked={prefs.predictionAutoCheck}
              disabled={!installed}
              onChange={(e) => {
                void updatePreferences({ predictionAutoCheck: e.target.checked }).then(useReply);
              }}
            />
            Check pending results in background (opt-in, once/minute; API quotas apply)
          </label>
          <div className="ex-forward-tools">
            <button
              className="ex-button secondary"
              disabled={busy || !stats.pending}
              onClick={() => {
                void check();
              }}
            >
              <RefreshCw size={13} />
              Check outcomes
            </button>
            <button
              className="ex-icon-button"
              title="Export all predictions"
              aria-label="Export all predictions"
              disabled={!records.length}
              onClick={exportLedger}
            >
              <Download size={15} />
            </button>
            <button
              className="ex-icon-button"
              title="Clear entire prediction ledger"
              aria-label="Clear entire prediction ledger"
              disabled={busy || !records.length}
              onClick={() => {
                void clear();
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
          {message && (
            <p className="ex-notice" role="status">
              {message}
            </p>
          )}
          {error && (
            <p className="ex-failure" role="alert">
              {error}
            </p>
          )}
          <div className="ex-forward-records">
            {[...records]
              .reverse()
              .slice(0, 20)
              .map((p) => (
                <PredictionRow prediction={p} key={p.id} />
              ))}
            {!records.length && (
              <p>
                No forward calls recorded yet. Historical backtests do not populate this win rate.
              </p>
            )}
            {records.length > 20 && (
              <p>
                Showing newest 20 of {records.length}. Export includes the entire local ledger
                (limit 500).
              </p>
            )}
          </div>
          <p className="ex-forward-limitations">
            <ShieldCheck size={14} />
            Closed 1-minute bars cannot reveal intrabar order. Both levels touched, uncertain
            entry-minute timing, or history gaps = ambiguous. Missing data stays pending. Touch
            fills are hypothetical, not guaranteed stop execution; slippage, funding, borrow and tax
            are omitted. Prices use Binance spot / Twelve Data, not your broker. No guaranteed
            accuracy or income.
          </p>
        </div>
      )}
    </section>
  );
}
function PredictionRow({ prediction: p }: { prediction: PaperPrediction }) {
  const market = getLiveMarket(p.marketId);
  return (
    <article className="ex-forward-row">
      <header>
        <span className={`ex-action ${p.action.toLowerCase()}`}>{p.action}</span>
        <strong>
          {market.base}/{market.quote} · {p.timeframe}
        </strong>
        <span className={`ex-outcome ${p.status}`}>
          {p.status === 'abstained' ? 'WAIT' : p.status.toUpperCase()}
        </span>
      </header>
      <p>Recorded {exactTime(p.createdAt)}</p>
      <div>
        <span>Entry {livePrice(p.entry, market)}</span>
        <span>SL {p.stop === null ? '—' : livePrice(p.stop, market)}</span>
        <span>TP {p.target === null ? '—' : livePrice(p.target, market)}</span>
      </div>
      <p>
        Source {p.provider} · entry quote {exactTime(p.entryAsOf)}
        <br />
        Basis close {exactTime(p.basisClosedAt)} · {p.model}
      </p>
      <p>
        Expiry {liveTimestamp(p.expiresAt)} · costs {p.feeBps} bps/side
      </p>
      {p.outcome && (
        <>
          <p>
            {outcomeLabels[p.outcome.reason]} · observed bar {exactTime(p.outcome.barStart)}
          </p>
          {p.outcome.netPnl !== null && (
            <strong className={p.outcome.netPnl >= 0 ? 'ex-mint' : 'ex-red'}>
              {p.outcome.netPnl > 0 ? '+' : ''}
              {p.outcome.netPnl.toFixed(2)} {p.accountCurrency} ·{' '}
              {p.outcome.returnPercent?.toFixed(2)}%
            </strong>
          )}
        </>
      )}
      {p.checkError && <p className="ex-forward-check-error">{p.checkError}</p>}
    </article>
  );
}
