import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  Bell,
  Check,
  ChevronRight,
  CircleHelp,
  Database,
  FileSpreadsheet,
  FolderUp,
  Info,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { Asset, ImportedMarket, MarketSnapshot, PriceAlert } from '../lib/types';
import {
  ASSETS,
  DEMO_AS_OF,
  formatPrice,
  getCandles,
  getDemoCandles,
  marketMatches,
  TIMEFRAMES,
} from '../lib/market';
import { WARMUP } from '../lib/analytics';
import { candlesToCSV, parseCandleCSV } from '../lib/csv';
import { downloadFile } from '../lib/utils';
import { AssetIcon, Modal } from './UI';

export function DataDialog({
  imported,
  onImport,
  onReset,
  onClose,
}: {
  imported: ImportedMarket | null;
  onImport: (market: ImportedMarket) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [symbol, setSymbol] = useState('BTC / USD');
  const [category, setCategory] = useState<'Crypto' | 'Forex'>('Crypto');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const loadFile = async (file: File) => {
    if (working) return;
    setError('');
    const label = symbol
      .trim()
      .toUpperCase()
      .replace(/\s*\/\s*/g, ' / ');
    if (!/^[A-Z0-9][A-Z0-9 /._-]{1,26}USD$/.test(label)) {
      setError(
        'Use a USD-quoted market label, such as BTC / USD or EURUSD. Convert non-USD-quoted CSVs to USD before importing.',
      );
      return;
    }
    if (!/\.csv$/i.test(file.name)) {
      setError('Please choose a .csv file.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('The CSV must be smaller than 8 MB.');
      return;
    }
    setWorking(true);
    try {
      const parsed = parseCandleCSV(await file.text());
      const lastPrice = parsed.candles[parsed.candles.length - 1].close;
      const asset: Asset = {
        id: 'imported',
        name: `${label} · imported`,
        symbol: label.split(/[ /]/)[0],
        pair: label,
        category,
        color: '#86c6ef',
        mark: '↗',
        decimals: category === 'Forex' ? 5 : lastPrice < 1 ? 6 : lastPrice < 10 ? 4 : 2,
        referencePrice: lastPrice,
        volatility: 0,
        seed: 0,
      };
      const market: ImportedMarket = { asset, ...parsed, fileName: file.name };
      if (!TIMEFRAMES.some((tf) => getCandles(asset, tf.id, market).length >= WARMUP)) {
        throw new Error(
          'No supported timeframe has 50 complete candles. Add more rows or align timestamps to UTC candle openings.',
        );
      }
      if (mounted.current) onImport(market);
    } catch (err) {
      if (mounted.current)
        setError(
          err instanceof Error
            ? err.message
            : 'Could not read this CSV. Please check the file format.',
        );
    } finally {
      if (mounted.current) {
        setWorking(false);
        if (input.current) input.current.value = '';
      }
    }
  };
  return (
    <Modal
      title="Your data. Your research."
      subtitle="Explore the demo, or bring your own completed market history."
      onClose={onClose}
      wide
    >
      <div className="data-source-card">
        <span className="data-source-icon">
          <Database size={24} />
        </span>
        <div>
          <strong>{imported ? 'Imported market available' : 'Demo workspace'}</strong>
          <p>
            {imported
              ? `${imported.fileName} · ${imported.candles.length.toLocaleString()} candles · ${imported.gaps} interval gaps`
              : 'Reproducible synthetic crypto and forex data. No live exchange is connected.'}
          </p>
          <small>
            {imported
              ? 'CSV history is held only for this tab session.'
              : `Fixture snapshot: ${new Date(DEMO_AS_OF).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC`}
          </small>
        </div>
        <span className="subtle-tag">{imported ? 'LOCAL CSV' : 'DEMO'}</span>
      </div>
      <div className="import-form-grid">
        <label>
          Market label · USD quoted
          <input
            placeholder="BTC / USD"
            maxLength={30}
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
          />
        </label>
        <label>
          Asset class
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as 'Crypto' | 'Forex')}
          >
            <option>Crypto</option>
            <option>Forex</option>
          </select>
        </label>
      </div>
      <input
        className="visually-hidden"
        type="file"
        accept=".csv,text/csv"
        ref={input}
        onChange={(e) => {
          if (e.target.files?.[0]) void loadFile(e.target.files[0]);
        }}
        tabIndex={-1}
        aria-label="OHLCV CSV file"
      />
      <button
        className={`drop-zone ${dragging ? 'dragging' : ''}`}
        disabled={working}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files[0]) void loadFile(e.dataTransfer.files[0]);
        }}
      >
        <span>
          <FolderUp size={27} />
        </span>
        <strong>{working ? 'Validating your candles…' : 'Drop your OHLCV CSV here'}</strong>
        <p>
          or <u>browse files</u> · up to 8 MB / 100,000 candles
        </p>
        <small>At least 50 completed candles · UTC opening timestamps</small>
      </button>
      {error && (
        <div className="import-error" role="alert">
          <CircleHelp size={17} />
          <p>{error}</p>
        </div>
      )}
      <div className="csv-format">
        <div>
          <FileSpreadsheet size={16} />
          <strong>A simple, familiar format</strong>
          <button
            className="text-link"
            onClick={() =>
              downloadFile(
                'vector-DEMO-btc-1h-example.csv',
                candlesToCSV(getDemoCandles(ASSETS[0], '1h').slice(-250)),
                'text/csv',
              )
            }
          >
            <ArrowDownToLine size={14} />
            Example CSV
          </button>
        </div>
        <code>timestamp,open,high,low,close,volume</code>
        <p>
          ISO dates or Unix seconds/milliseconds. Volume is optional. Duplicate or invalid candles
          are rejected; gaps are not interpolated. Incomplete aggregation buckets are omitted.
          Imported history is user-supplied and unverified.
        </p>
      </div>
      <div className="data-privacy">
        <ShieldCheck size={17} />
        <p>
          Files are parsed locally, never uploaded. Preferences and alerts stay in your browser.
          Imported candles reset on reload. No API keys, account connection, or order execution.
        </p>
      </div>
      <div className="modal-footer">
        {imported ? (
          <button className="button secondary" onClick={onReset}>
            <Trash2 size={14} />
            Remove imported data
          </button>
        ) : (
          <span className="muted">
            <Info size={13} />
            Demo results are not real-world evidence.
          </span>
        )}
        <button className="button primary" onClick={onClose}>
          Back to workspace
          <ArrowRight size={14} />
        </button>
      </div>
    </Modal>
  );
}

export function SearchDialog({
  snapshots,
  onSelect,
  onClose,
}: {
  snapshots: MarketSnapshot[];
  onSelect: (asset: Asset) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const matches = snapshots.filter(
    (m) => marketMatches(m.asset, query) && (category === 'All' || m.asset.category === category),
  );
  return (
    <Modal
      title="Find your market"
      subtitle="Select a market to open its multi-timeframe analysis."
      onClose={onClose}
    >
      <label className="search-input large">
        <Search size={19} />
        <input
          ref={ref}
          autoFocus
          aria-label="Search crypto or forex"
          placeholder="Search BTC, Ethereum, EUR/USD…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="search-tabs segmented">
        {['All', 'Crypto', 'Forex'].map((c) => (
          <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="search-results">
        {matches.map((m) => (
          <button key={m.asset.id} onClick={() => onSelect(m.asset)}>
            <AssetIcon asset={m.asset} />
            <span>
              <strong>{m.asset.pair}</strong>
              <small>
                {m.asset.name} · {m.asset.category}
              </small>
            </span>
            <strong>{formatPrice(m.price, m.asset, true)}</strong>
            <ChevronRight size={16} />
          </button>
        ))}
        {!matches.length && (
          <div className="inline-empty">No matching markets. Try another symbol.</div>
        )}
      </div>
      <div className="search-footnote">
        <span>{matches.length} markets in your research universe</span>
        <span>
          <kbd>esc</kbd> to close
        </span>
      </div>
    </Modal>
  );
}

export function AlertsDialog({
  snapshots,
  asset,
  alerts,
  onAdd,
  onRemove,
  onClose,
}: {
  snapshots: MarketSnapshot[];
  asset: Asset;
  alerts: PriceAlert[];
  onAdd: (alert: PriceAlert) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const [assetId, setAssetId] = useState(asset.id);
  const [condition, setCondition] = useState<'above' | 'below'>('above');
  const [price, setPrice] = useState(
    String((snapshots.find((m) => m.asset.id === asset.id)!.price * 1.01).toFixed(asset.decimals)),
  );
  const [added, setAdded] = useState(false);
  const valid = Number.isFinite(Number(price)) && Number(price) > 0 && alerts.length < 20;
  const snapshot = snapshots.find((m) => m.asset.id === assetId)!;
  return (
    <Modal
      title="A little less watching."
      subtitle="Local price thresholds for your loaded research snapshots."
      onClose={onClose}
    >
      <div className="notice-banner compact-notice">
        <Info size={18} />
        <p>
          These alerts check loaded demo or CSV snapshots only. There is no live monitoring, push
          notification, or automatic trade.
        </p>
      </div>
      <form
        className="alert-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) {
            onAdd({
              id: crypto.randomUUID(),
              assetId,
              condition,
              price: Number(price),
              createdAt: Date.now(),
            });
            setAdded(true);
          }
        }}
      >
        <label>
          Market
          <select
            value={assetId}
            onChange={(e) => {
              const s = snapshots.find((m) => m.asset.id === e.target.value)!;
              setAssetId(e.target.value);
              setPrice((s.price * 1.01).toFixed(s.asset.decimals));
              setAdded(false);
            }}
          >
            {snapshots.map((m) => (
              <option key={m.asset.id} value={m.asset.id}>
                {m.asset.pair}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label>
            Notify when snapshot is
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value as 'above' | 'below')}
            >
              <option value="above">At or above</option>
              <option value="below">At or below</option>
            </select>
          </label>
          <label>
            Price threshold
            <input
              type="number"
              step="any"
              min="0"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                setAdded(false);
              }}
            />
          </label>
        </div>
        <div className="alert-submit">
          <span>Loaded price: {formatPrice(snapshot.price, snapshot.asset, true)}</span>
          <button className="button primary" type="submit" disabled={!valid}>
            <Plus size={14} />
            Save threshold
          </button>
        </div>
        {added && (
          <p className="positive alert-saved" role="status">
            <Check size={14} />
            Threshold saved locally.
          </p>
        )}
        {alerts.length >= 20 && (
          <p className="validation-error">
            20 thresholds maximum. Remove one before adding another.
          </p>
        )}
      </form>
      <div className="saved-alerts-heading">
        <strong>Your thresholds</strong>
        <span>{alerts.length} / 20</span>
      </div>
      <div className="saved-alerts">
        {alerts.length ? (
          alerts.map((alert) => {
            const market = snapshots.find((m) => m.asset.id === alert.assetId);
            const triggered =
              market &&
              (alert.condition === 'above'
                ? market.price >= alert.price
                : market.price <= alert.price);
            return (
              <div className="saved-alert" key={alert.id}>
                <span className={`alert-state-icon ${triggered ? 'triggered' : ''}`}>
                  <Bell size={16} />
                </span>
                <div>
                  <strong>{market?.asset.pair ?? 'Imported market'}</strong>
                  <p>
                    {alert.condition === 'above' ? 'At or above' : 'At or below'}{' '}
                    {market ? formatPrice(alert.price, market.asset) : alert.price}
                  </p>
                </div>
                <span className={`alert-status ${triggered ? 'positive' : 'muted'}`}>
                  {!market ? 'Re-import data' : triggered ? 'Snapshot matches' : 'Not matched'}
                </span>
                <button
                  className="icon-button"
                  aria-label={`Delete threshold for ${market?.asset.pair ?? 'imported market'}`}
                  onClick={() => onRemove(alert.id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })
        ) : (
          <div className="alerts-empty">
            <Bell size={26} />
            <strong>More focus. Less noise.</strong>
            <p>Add your first threshold to track a research level.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
