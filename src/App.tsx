import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronRight,
  Database,
  FlaskConical,
  History,
  LayoutDashboard,
  Menu,
  Search,
  ShieldCheck,
  Star,
  TrendingUp,
  X,
} from 'lucide-react';
import { analyze, backtest } from './lib/analytics';
import {
  ASSETS,
  candleCloseTime,
  getCandles,
  getDemoCandles,
  quoteChange,
  TIMEFRAMES,
} from './lib/market';
import type {
  Asset,
  ImportedMarket,
  MarketSnapshot,
  Page,
  PriceAlert,
  Timeframe,
} from './lib/types';
import { downloadFile, readStored, saveStored } from './lib/utils';
import { Overview, Signals, type MarketPageProps } from './components/MarketPages';
import { Backtesting, RiskAndIncome, Watchlist } from './components/ResearchPages';
import { AlertsDialog, DataDialog, SearchDialog } from './components/WorkspaceDialogs';

const NAV = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'signals', label: 'Signal lab', icon: TrendingUp },
  { id: 'backtesting', label: 'Backtesting', icon: History },
  { id: 'risk', label: 'Risk & income', icon: ShieldCheck },
  { id: 'watchlist', label: 'Watchlist', icon: Star },
] as const;
const DEFAULT_WATCHLIST = ['btc', 'eth', 'sol', 'eurusd', 'gbpusd', 'usdjpy'];
const isPage = (value: string): value is Page => NAV.some((n) => n.id === value);
function initialPage(): Page {
  const hash = window.location.hash.slice(1);
  return isPage(hash) ? hash : 'overview';
}
function validAlerts(value: unknown): value is PriceAlert[] {
  return (
    Array.isArray(value) &&
    value.length <= 20 &&
    value.every(
      (v) =>
        v &&
        typeof v.id === 'string' &&
        typeof v.assetId === 'string' &&
        ASSETS.some((a) => a.id === v.assetId) &&
        ['above', 'below'].includes(v.condition) &&
        Number.isFinite(v.price) &&
        v.price > 0 &&
        Number.isFinite(v.createdAt),
    )
  );
}

export default function App() {
  const [page, setPage] = useState<Page>(initialPage);
  const [selectedId, setSelectedId] = useState('btc');
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [imported, setImported] = useState<ImportedMarket | null>(null);
  const [overlay, setOverlay] = useState<'data' | 'search' | 'alerts' | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>(() =>
    readStored(
      'watchlist',
      DEFAULT_WATCHLIST,
      (v): v is string[] =>
        Array.isArray(v) &&
        v.length <= ASSETS.length &&
        new Set(v).size === v.length &&
        v.every((id) => typeof id === 'string' && ASSETS.some((a) => a.id === id)),
    ),
  );
  const [alerts, setAlerts] = useState<PriceAlert[]>(() => readStored('alerts', [], validAlerts));
  const [capital, setCapital] = useState(() =>
    readStored(
      'capital',
      10_000,
      (v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100_000_000,
    ),
  );
  const [riskPercent, setRiskPercent] = useState(() =>
    readStored(
      'riskPercent',
      1,
      (v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 5,
    ),
  );
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(''), 4_000);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  useEffect(
    () =>
      saveStored(
        'watchlist',
        watchlist.filter((id) => id !== 'imported'),
      ),
    [watchlist],
  );
  useEffect(
    () =>
      saveStored(
        'alerts',
        alerts.filter((a) => a.assetId !== 'imported'),
      ),
    [alerts],
  );
  useEffect(() => saveStored('capital', capital), [capital]);
  useEffect(() => saveStored('riskPercent', riskPercent), [riskPercent]);
  useEffect(() => {
    const onHashChange = () => {
      setPage(initialPage());
      setMobileMenu(false);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing =
        event.target instanceof HTMLElement &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) ||
          event.target.isContentEditable);
      if (
        (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey)) ||
        (event.key === '/' && !typing)
      ) {
        event.preventDefault();
        setOverlay('search');
        setMobileMenu(false);
      }
      if (event.key === 'Escape') setMobileMenu(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const assets = useMemo(() => (imported ? [...ASSETS, imported.asset] : ASSETS), [imported]);
  const asset = assets.find((a) => a.id === selectedId) ?? ASSETS[0];
  const multi = useMemo(
    () =>
      TIMEFRAMES.map((tf) => {
        const candles = getCandles(asset, tf.id, imported);
        return { timeframe: tf.id, candles, analysis: analyze(candles) };
      }),
    [asset, imported],
  );
  const current =
    multi.find((m) => m.timeframe === timeframe && m.analysis) ?? multi.find((m) => m.analysis)!;
  const analysis = current.analysis!;
  const activeTimeframe = current.timeframe;
  const candles = current.candles;
  const result = useMemo(
    () =>
      backtest(
        candles,
        250,
        asset.category === 'Crypto' ? 10 : 1,
        10_000,
        asset.id === 'usdjpy' ? 'JPY' : 'USD',
      ),
    [candles, asset.category, asset.id],
  );
  const snapshots = useMemo<MarketSnapshot[]>(
    () =>
      assets.map((a) => {
        let data =
          a.id === 'imported' && imported ? getCandles(a, '1h', imported) : getDemoCandles(a, '1h');
        if (a.id === 'imported' && imported && data.length < 50)
          data = imported.candles.slice(-5_000);
        return {
          asset: a,
          price: data[data.length - 1].close,
          change: quoteChange(data, 24),
          candles: data,
          analysis: analyze(data),
        };
      }),
    [assets, imported],
  );
  const source =
    asset.id === 'imported'
      ? imported?.fileName.toLowerCase().includes('demo')
        ? 'Imported demo CSV'
        : 'Imported CSV'
      : 'Demo data';
  const navigate = (next: Page) => {
    setPage(next);
    window.location.hash = next;
    setMobileMenu(false);
    setOverlay(null);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const chooseAsset = (next: Asset) => {
    setSelectedId(next.id);
    const supported = (tf: Timeframe) => getCandles(next, tf, imported).length >= 50;
    if (!supported(timeframe))
      setTimeframe(supported('1h') ? '1h' : TIMEFRAMES.find((tf) => supported(tf.id))!.id);
  };
  const chooseTimeframe = (next: Timeframe) => {
    if (multi.find((m) => m.timeframe === next)?.analysis) setTimeframe(next);
  };
  const importMarket = (market: ImportedMarket) => {
    setImported(market);
    setSelectedId(market.asset.id);
    const supported = TIMEFRAMES.filter(
      (tf) => getCandles(market.asset, tf.id, market).length >= 50,
    );
    setTimeframe(
      supported.some((tf) => tf.id === timeframe)
        ? timeframe
        : (supported.find((tf) => tf.id === '1h')?.id ?? supported[0].id),
    );
    setWatchlist((w) => [...w.filter((id) => id !== 'imported'), 'imported']);
    setAlerts((a) => a.filter((alert) => alert.assetId !== 'imported'));
    setOverlay(null);
    notify(
      `Imported ${market.candles.length.toLocaleString()} candles${market.gaps ? ` · ${market.gaps} gaps; incomplete buckets omitted` : ' · ready to analyze'}.`,
    );
  };
  const toggleWatch = (id: string) => {
    const wasSaved = watchlist.includes(id);
    setWatchlist((w) => (wasSaved ? w.filter((item) => item !== id) : [...w, id]));
    notify(
      `${assets.find((a) => a.id === id)?.pair} ${wasSaved ? 'removed from' : 'added to'} your watchlist.`,
    );
  };
  const exportReport = () => {
    const report = {
      product: 'Vector Market Intelligence',
      generatedAt: new Date().toISOString(),
      source: {
        type: source,
        file: asset.id === 'imported' ? imported?.fileName : null,
        verified: false,
        live: false,
      },
      market: asset.pair,
      timeframe: activeTimeframe,
      latestCandleOpenUTC: new Date(candles[candles.length - 1].time).toISOString(),
      latestCandleCloseUTC: new Date(
        candleCloseTime(candles[candles.length - 1].time, activeTimeframe),
      ).toISOString(),
      technicalAnalysis: {
        direction: analysis.direction,
        strengthOutOf100: analysis.strength,
        score: analysis.score,
        lastClose: analysis.price,
        indicators: analysis.indicators,
        illustrativeTarget: analysis.direction === 'neutral' ? null : analysis.target,
        illustrativeInvalidation: analysis.direction === 'neutral' ? null : analysis.stop,
      },
      multiTimeframe: multi.map((m) => ({
        timeframe: m.timeframe,
        direction: m.analysis?.direction ?? 'insufficient history',
        strength: m.analysis?.strength ?? null,
      })),
      walkForwardBacktest: {
        window: 250,
        warmup: 50,
        feeBpsPerSide: result.feeBps,
        directionalHitRate: result.accuracy,
        persistenceBaseline: result.baselineAccuracy,
        observations: result.observations,
        netReturnPercent: result.totalReturn,
        maxDrawdownPercent: result.maxDrawdown,
        initialUSD: 10000,
        notionalExposure: '1x',
        holdingPeriod: 'one candle',
        accountCurrency: 'USD',
        quoteConversion: asset.id === 'usdjpy' ? 'JPY P&L converted to USD at exit' : 'USD quoted',
      },
      limitations: [
        'Technical strength is not a calibrated probability.',
        'Demo data is synthetic and does not demonstrate market accuracy.',
        'Imported history is user-supplied and unverified.',
        'Backtest signals use prior closed bars, with next-open entry and same-candle-close exit. Neutrals are skipped.',
        'Slippage, taxes, borrowing, funding, liquidity and exchange restrictions are excluded.',
        'This is research, not financial advice, a guaranteed return, or an automated trading service.',
      ],
    };
    downloadFile(
      `vector-${asset.id}-${activeTimeframe}-research.json`,
      JSON.stringify(report, null, 2),
      'application/json',
    );
    notify('Research report exported, including its data source and limitations.');
  };
  const pageProps: MarketPageProps = {
    asset,
    timeframe: activeTimeframe,
    candles,
    analysis,
    multi,
    snapshots,
    watchlist,
    result,
    source,
    capital,
    riskPercent,
    onAsset: chooseAsset,
    onTimeframe: chooseTimeframe,
    onNavigate: navigate,
    onImport: () => setOverlay('data'),
    onExport: exportReport,
  };
  const navLabel = NAV.find((n) => n.id === page)!.label;

  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Skip to content
      </a>
      {mobileMenu && <div className="mobile-nav-backdrop" onClick={() => setMobileMenu(false)} />}
      <aside className={`sidebar ${mobileMenu ? 'is-open' : ''}`} aria-label="Main navigation">
        <a
          className="brand"
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            navigate('overview');
          }}
          aria-label="Vector home"
        >
          <svg viewBox="0 0 36 36" className="brand-symbol" aria-hidden="true">
            <path d="M3 8h8l9 21h-8z" fill="currentColor" />
            <path d="M23 8h10L21 29h-9z" fill="currentColor" />
          </svg>
          <span>
            VECTOR<small>MARKET INTELLIGENCE</small>
          </span>
        </a>
        <div className="sidebar-section-label">WORKSPACE</div>
        <nav>
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${page === n.id ? 'active' : ''}`}
              onClick={() => navigate(n.id)}
              aria-current={page === n.id ? 'page' : undefined}
              title={n.label}
            >
              <n.icon size={19} strokeWidth={1.65} />
              <span>{n.label}</span>
              {n.id === 'signals' && <small>8 TF</small>}
              {n.id === 'watchlist' && <span className="nav-count">{watchlist.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-grow" />
        <div className="sidebar-insight">
          <div className="insight-graphic">
            <FlaskConical size={20} />
            <svg viewBox="0 0 120 50" aria-hidden="true">
              <path
                d="M0 44L14 36L27 41L40 26L53 30L66 17L80 23L92 11L105 15L119 2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M0 44L14 36L27 41L40 26L53 30L66 17L80 23L92 11L105 15L119 2V50H0Z"
                fill="currentColor"
                opacity=".07"
              />
            </svg>
          </div>
          <strong>Conviction needs evidence.</strong>
          <p>Turn an interesting signal into a tested strategy.</p>
          <button onClick={() => navigate('backtesting')}>
            Open backtesting
            <ArrowRight size={14} />
          </button>
        </div>
        <button
          className="nav-item data-nav"
          onClick={() => {
            setOverlay('data');
            setMobileMenu(false);
          }}
          title="Data & privacy"
        >
          <Database size={18} strokeWidth={1.65} />
          <span>Data & privacy</span>
          <span className="data-status-dot" />
        </button>
        <div className="workspace-profile">
          <span className="workspace-avatar">V</span>
          <div>
            <strong>Personal workspace</strong>
            <span>Local research mode</span>
          </div>
          <ShieldCheck size={16} />
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu icon-button"
              aria-label="Open navigation"
              aria-expanded={mobileMenu}
              onClick={() => setMobileMenu(!mobileMenu)}
            >
              <Menu size={21} />
            </button>
            <div className="breadcrumbs">
              <LayoutDashboard size={16} />
              <span>Workspace</span>
              <ChevronRight size={13} />
              <strong>{navLabel}</strong>
            </div>
          </div>
          <div className="topbar-actions">
            <button className="search-trigger" onClick={() => setOverlay('search')}>
              <Search size={16} />
              <span>Search markets…</span>
              <kbd>⌘ K</kbd>
            </button>
            <button
              className={`data-mode ${source.toLowerCase().includes('demo') ? 'demo' : 'imported'}`}
              onClick={() => setOverlay('data')}
              title="Manage market data"
            >
              <span />
              {source}
            </button>
            <button
              className="icon-button notification-button"
              onClick={() => setOverlay('alerts')}
              aria-label={`Manage ${alerts.length} snapshot alerts`}
            >
              <Bell size={19} strokeWidth={1.6} />
              {alerts.length > 0 && <span>{alerts.length}</span>}
            </button>
            <div className="top-avatar" title="Local research workspace">
              V
            </div>
          </div>
        </header>
        <main id="main-content" className="content" key={page} tabIndex={-1}>
          {page === 'overview' && <Overview {...pageProps} />}
          {page === 'signals' && <Signals {...pageProps} />}
          {page === 'backtesting' && <Backtesting {...pageProps} />}
          {page === 'risk' && (
            <RiskAndIncome {...pageProps} onCapital={setCapital} onRiskPercent={setRiskPercent} />
          )}
          {page === 'watchlist' && (
            <Watchlist
              {...pageProps}
              onToggleWatch={toggleWatch}
              onAlerts={() => setOverlay('alerts')}
            />
          )}
          <footer className="app-footer">
            <div>
              <span className="mini-dot" />
              <span>
                {source.toLowerCase().includes('demo')
                  ? 'Simulated data. Not live market prices.'
                  : 'User-supplied history. Not independently verified.'}
              </span>
            </div>
            <p>
              For research only. Predictions can be wrong. Returns and passive income are not
              guaranteed.
            </p>
            <button onClick={() => navigate('signals')}>
              Model & limitations
              <ArrowRight size={12} />
            </button>
          </footer>
        </main>
      </div>
      {overlay === 'data' && (
        <DataDialog
          imported={imported}
          onImport={importMarket}
          onReset={() => {
            setImported(null);
            setSelectedId('btc');
            setTimeframe('1h');
            setWatchlist((w) => w.filter((id) => id !== 'imported'));
            setAlerts((a) => a.filter((alert) => alert.assetId !== 'imported'));
            setOverlay(null);
            notify('Imported data removed. The demo workspace is ready.');
          }}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay === 'search' && (
        <SearchDialog
          snapshots={snapshots}
          onSelect={(next) => {
            chooseAsset(next);
            navigate('overview');
          }}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay === 'alerts' && (
        <AlertsDialog
          snapshots={snapshots}
          asset={asset}
          alerts={alerts}
          onAdd={(alert) => setAlerts((a) => [...a, alert].slice(0, 20))}
          onRemove={(id) => setAlerts((a) => a.filter((alert) => alert.id !== id))}
          onClose={() => setOverlay(null)}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          <span>{toast}</span>
          <button aria-label="Dismiss notification" onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
