import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  LoaderCircle,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { DEFAULT_PREFERENCES } from './catalog';
import { extensionRequest, installedExtension, updatePreferences } from './bridge';
import type { Preferences } from './types';
import { VectorMark } from './ui';

export default function ExtensionOptions() {
  const installed = installedExtension();
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void extensionRequest({ type: 'GET_OPTIONS' }).then((reply) => {
      if (!active) return;
      if (reply.ok) {
        setPreferences(reply.state.settings.preferences);
        setKey(reply.forexKey ?? '');
      } else setError(reply.error);
    });
    return () => {
      active = false;
    };
  }, []);
  const save = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (installed) {
        const reply = await extensionRequest({ type: 'SAVE_FOREX_KEY', key });
        if (!reply.ok) {
          setError(reply.error);
          return;
        }
      }
      const reply = await updatePreferences(preferences);
      if (reply.ok) {
        setPreferences(reply.state.settings.preferences);
        setNotice(
          installed
            ? 'Settings saved locally. Reopen the extension or refresh the selected forex market.'
            : 'Preview preferences saved for this tab. Forex keys are disabled outside the installed extension.',
        );
      } else setError(reply.error);
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const reply = await extensionRequest({ type: 'TEST_FOREX_KEY', key });
      if (reply.ok) setNotice(reply.testMessage ?? 'Provider responded.');
      else setError(reply.error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="ex-options">
      <header className="ex-options-header">
        <a className="ex-brand" href={installed ? chrome.runtime.getURL('panel.html') : '/'}>
          <VectorMark size={34} />
          <span>
            VECTOR<small>LIVE INTELLIGENCE</small>
          </span>
        </a>
        <span className="ex-install-badge">
          {installed ? 'PRIVATE EXTENSION SETTINGS' : 'SETTINGS PREVIEW'}
        </span>
      </header>
      <a className="ex-back-link" href={installed ? chrome.runtime.getURL('panel.html') : '/'}>
        <ArrowLeft size={14} />
        Back to analysis
      </a>
      <div className="ex-options-heading">
        <span>YOUR CONNECTION. YOUR CONTROL.</span>
        <h1>Bring the live market closer.</h1>
        <p>Connect data, not your trading account. Everything is configured in your browser.</p>
      </div>
      {!installed && (
        <div className="ex-options-preview">
          <ShieldCheck size={19} />
          <div>
            <strong>API keys are disabled in this website preview.</strong>
            <p>
              Download and install the extension first. Enter your key only in its native options
              page—never in chat or this website.
            </p>
          </div>
        </div>
      )}
      <section className="ex-options-card">
        <div className="ex-options-card-title">
          <span className="ex-options-icon">
            <Database size={22} />
          </span>
          <div>
            <h2>Public crypto feed</h2>
            <p>Binance's market-data-only endpoints · no API key or exchange login</p>
          </div>
          <span className="ex-provider-badge">NO KEY REQUIRED</span>
        </div>
        <div className="ex-options-details">
          <p>
            Actual USDT-quoted spot prices and native closed candles. Quotes refresh every 15
            seconds while the popup or panel is open. Provider outages and regional restrictions are
            shown, never replaced with simulated prices.
          </p>
          <code>data-api.binance.vision</code>
        </div>
      </section>
      <section className="ex-options-card">
        <div className="ex-options-card-title">
          <span className="ex-options-icon purple">
            <KeyRound size={22} />
          </span>
          <div>
            <h2>Forex connection</h2>
            <p>Twelve Data · live or delayed according to your provider plan</p>
          </div>
          <span className="ex-provider-badge purple">LOCAL KEY</span>
        </div>
        <div className="ex-options-details">
          <p>
            Get a market-data API key from{' '}
            <a href="https://twelvedata.com/" target="_blank" rel="noopener noreferrer">
              Twelve Data <ArrowRight size={11} />
            </a>
            . Your plan must allow forex quotes and historical candles for the selected timeframe.
            The extension cannot upgrade your provider's coverage or data latency.
          </p>
          <label>
            Twelve Data API key
            <div className="ex-key-input">
              <input
                type={showKey ? 'text' : 'password'}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                disabled={!installed || busy}
                maxLength={256}
                autoComplete="off"
                spellCheck={false}
                placeholder={
                  installed
                    ? 'Enter your key privately here'
                    : 'Install the extension to enable this field'
                }
              />
              <button
                className="ex-icon-button"
                onClick={() => setShowKey(!showKey)}
                aria-label={showKey ? 'Hide provider key' : 'Show provider key'}
                disabled={!installed}
              >
                {showKey ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
          <div className="ex-key-actions">
            <button
              className="ex-button secondary"
              onClick={() => {
                void test();
              }}
              disabled={!installed || !key.trim() || busy}
            >
              {busy ? <LoaderCircle size={14} className="ex-spin" /> : <CheckCircle2 size={14} />}
              Test connection
            </button>
            <button
              className="ex-key-remove"
              disabled={!installed || busy}
              onClick={() => {
                setKey('');
                setNotice(
                  'Key cleared from the form. Save settings to remove it from this browser.',
                );
              }}
            >
              <Trash2 size={13} />
              Remove key
            </button>
          </div>
          <p className="ex-key-privacy">
            <ShieldCheck size={13} />
            Stored in chrome.storage.local, not sync, and used only with api.twelvedata.com. A local
            stored key is not a vault; protect your browser profile. It is never included in
            exports, market snapshots, or logs.
          </p>
        </div>
      </section>
      <section className="ex-options-card">
        <div className="ex-options-card-title">
          <span className="ex-options-icon">
            <SettingsGraphic />
          </span>
          <div>
            <h2>Refresh &amp; research assumptions</h2>
            <p>Conservative defaults. No automatic trading.</p>
          </div>
        </div>
        <div className="ex-options-details">
          <div className="ex-option-switch">
            <div>
              <strong>Refresh while the panel is open</strong>
              <p>
                Crypto every 15s · forex every 60s. These are polled snapshots, not tick-by-tick
                streams.
              </p>
            </div>
            <input
              type="checkbox"
              aria-label="Automatic foreground refresh"
              checked={preferences.autoRefresh}
              onChange={(e) => setPreferences((p) => ({ ...p, autoRefresh: e.target.checked }))}
            />
          </div>
          <div className="ex-option-switch">
            <div>
              <strong>Refresh with the popup closed</strong>
              <p>
                Opt-in: crypto once/minute, forex once/5 minutes. Provider quotas still apply; no
                push alerts or guaranteed delivery.
              </p>
            </div>
            <input
              type="checkbox"
              aria-label="Background refresh"
              checked={preferences.backgroundRefresh}
              onChange={(e) =>
                setPreferences((p) => ({ ...p, backgroundRefresh: e.target.checked }))
              }
            />
          </div>
          <div className="ex-option-switch">
            <div>
              <strong>Check recorded paper predictions in background</strong>
              <p>
                Opt-in: once/minute while pending calls exist. Uses additional 1-minute history
                requests, not trades. Provider quotas can delay results; missing data is not a loss.
              </p>
            </div>
            <input
              type="checkbox"
              aria-label="Background prediction checks"
              disabled={!installed}
              checked={preferences.predictionAutoCheck}
              onChange={(e) =>
                setPreferences((p) => ({ ...p, predictionAutoCheck: e.target.checked }))
              }
            />
          </div>
          <div className="ex-options-input-grid">
            <label>
              Crypto costs / side · bps
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={preferences.cryptoFeeBps}
                onChange={(e) =>
                  setPreferences((p) => ({ ...p, cryptoFeeBps: Number(e.target.value) }))
                }
              />
            </label>
            <label>
              Forex costs / side · bps
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={preferences.forexFeeBps}
                onChange={(e) =>
                  setPreferences((p) => ({ ...p, forexFeeBps: Number(e.target.value) }))
                }
              />
            </label>
            <label>
              Forex HTTP requests / minute
              <select
                value={preferences.forexRequestsPerMinute}
                onChange={(e) =>
                  setPreferences((p) => ({ ...p, forexRequestsPerMinute: Number(e.target.value) }))
                }
              >
                <option value={6}>6 · conservative default</option>
                <option value={12}>12 · check your plan</option>
                <option value={60}>60 · paid plan required</option>
                <option value={120}>120 · check provider limits</option>
              </select>
            </label>
          </div>
          <p className="ex-key-privacy">
            <Info size={13} />
            Each forex refresh normally requests a quote and a time series. Request budgets are not
            a guarantee of API-credit availability; daily quotas and plan restrictions can still
            apply.
          </p>
        </div>
      </section>
      <div className="ex-settings-feedback" aria-live="polite">
        {notice && (
          <p className="success">
            <CheckCircle2 size={17} />
            {notice}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            <Info size={17} />
            {error}
          </p>
        )}
      </div>
      <div className="ex-options-save">
        <button
          className="ex-button secondary"
          disabled={busy}
          onClick={() => {
            void extensionRequest({ type: 'CLEAR_CACHE' }).then((reply) => {
              if (reply.ok)
                setNotice('Cached market data cleared. Provider request quotas were not reset.');
              else setError(reply.error);
            });
          }}
        >
          <Trash2 size={14} />
          Clear cached market data
        </button>
        <button
          className="ex-button primary"
          onClick={() => {
            void save();
          }}
          disabled={busy}
        >
          <Save size={15} />
          Save settings
        </button>
      </div>
      <section className="ex-options-disclosure">
        <ShieldCheck size={20} />
        <div>
          <strong>Live data does not make the future certain.</strong>
          <p>
            The forecast is an explainable, rule-based technical ensemble—not trained AI, a
            calibrated probability, or validated investment advice. Only an explicit Analyze Page
            click reads bounded chart metadata; balances, cookies and screenshots are never read. No
            orders are placed. Backtests and forward paper results omit slippage, funding,
            borrowing, tax and broker constraints. Stops, accuracy, returns and passive income are
            not guaranteed.
          </p>
          <p>
            12H forex candles are aggregated from complete 4H UTC buckets. Provider gaps are not
            filled. Market-closed and delayed quotes are explicitly labeled.
          </p>
        </div>
      </section>
    </main>
  );
}
function SettingsGraphic() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M4 7h16M4 17h16" />
      <circle cx="9" cy="7" r="3" fill="#172a30" />
      <circle cx="16" cy="17" r="3" fill="#172a30" />
    </svg>
  );
}
