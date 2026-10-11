import { useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronDown,
  Chrome,
  Code2,
  ExternalLink,
  Globe2,
  Layers3,
  LockKeyhole,
  PanelRightOpen,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { ExtensionWorkspace, VectorMark } from './ui';

export default function ExtensionPreview() {
  const [guide, setGuide] = useState(false);
  return (
    <div className="ex-preview-site">
      <header className="ex-site-header">
        <a href="/" className="ex-brand">
          <VectorMark size={31} />
          <span>
            VECTOR<small>LIVE INTELLIGENCE</small>
          </span>
        </a>
        <nav>
          <a href="#install" onClick={() => setGuide(true)}>
            Installation
          </a>
          <a href="/options.html">
            Data &amp; privacy
            <ExternalLink size={12} />
          </a>
          <span>
            <Chrome size={15} />
            Chrome &amp; Edge
          </span>
        </nav>
      </header>
      <main className="ex-preview-main">
        <section className="ex-preview-hero">
          <div className="ex-install-eyebrow">
            <span />
            MANIFEST V3 BROWSER EXTENSION
          </div>
          <h1>
            Your next move.
            <br />
            <span>Now in your browser.</span>
          </h1>
          <p className="ex-hero-description">
            Live crypto and forex analysis, without another dashboard tab. A real extension. A
            native side panel. A clearer view across 12 timeframes.
          </p>
          <div className="ex-hero-actions">
            <a className="ex-button primary" href="/vector-live-extension.zip" download>
              <ArrowDownToLine size={17} />
              Download extension
              <ArrowRight size={15} />
            </a>
            <button className="ex-button secondary" onClick={() => setGuide(!guide)}>
              <PanelRightOpen size={16} />
              How to install
              <ChevronDown size={14} />
            </button>
          </div>
          <div className="ex-download-note">
            <Chrome size={14} />
            Chrome / Edge 116+<span>·</span>
            <Code2 size={13} />
            Load unpacked<span>·</span>No account required for crypto
          </div>
          <div className="ex-hero-features">
            <div>
              <span>
                <Globe2 size={20} />
              </span>
              <div>
                <strong>Actual market feeds</strong>
                <p>
                  Public crypto data. Private forex-provider setup. No simulated-price fallback.
                </p>
              </div>
            </div>
            <div>
              <span>
                <Layers3 size={20} />
              </span>
              <div>
                <strong>1 minute to 1 month</strong>
                <p>Choose your horizon. Forecasts use completed candles, not forming bars.</p>
              </div>
            </div>
            <div>
              <span>
                <Sparkles size={20} />
              </span>
              <div>
                <strong>A signal you can question</strong>
                <p>See indicators, historical evidence, costs, and uncertainty—not a black box.</p>
              </div>
            </div>
            <div>
              <span>
                <LockKeyhole size={20} />
              </span>
              <div>
                <strong>Data, not your trading account</strong>
                <p>No webpage scraping, exchange passwords, automatic orders or synced API keys.</p>
              </div>
            </div>
          </div>
          <div className="ex-install-guide" id="install" hidden={!guide}>
            <h2>From download to your toolbar.</h2>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <strong>Download and unzip</strong>
                  <p>Extract the ZIP to a folder you will keep on your computer.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Open your extensions page</strong>
                  <p>
                    <code>chrome://extensions</code> or <code>edge://extensions</code>
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Enable Developer mode → Load unpacked</strong>
                  <p>
                    Select the extracted <code>vector-live-extension</code> folder containing{' '}
                    <code>manifest.json</code>.
                  </p>
                </div>
              </li>
              <li>
                <span>04</span>
                <div>
                  <strong>Pin Vector and connect</strong>
                  <p>
                    Crypto connects without a key. For forex, open the extension's Settings and
                    enter your Twelve Data key privately.
                  </p>
                </div>
              </li>
            </ol>
            <p>
              <ShieldCheck size={14} />
              This is a locally loaded extension, not a Chrome Web Store listing. Live-feed access
              depends on your network and provider plan.
            </p>
          </div>
          <div className="ex-hero-caution">
            <ShieldCheck size={18} />
            <p>
              Live data, not certainty. No guaranteed prediction accuracy or passive income. The
              model is rule-based technical analysis, not trained AI.
            </p>
          </div>
        </section>
        <aside className="ex-preview-widget">
          <div className="ex-preview-window-bar">
            <div>
              <i />
              <i />
              <i />
            </div>
            <span>
              <PanelRightOpen size={13} />
              EXTENSION PREVIEW
            </span>
            <Check size={13} />
          </div>
          <ExtensionWorkspace preview />
          <div className="ex-preview-widget-caption">
            <span />
            <p>
              Install the ZIP to use the native toolbar popup, side panel, and private forex
              settings.
            </p>
          </div>
        </aside>
      </main>
      <footer className="ex-site-footer">
        <span>VECTOR LIVE · RESEARCH, NOT TRADE EXECUTION</span>
        <a
          href="https://github.com/vidu1999/CRYOTOFOREXMARKETPREDICTION"
          target="_blank"
          rel="noopener noreferrer"
        >
          Source &amp; documentation
          <ExternalLink size={12} />
        </a>
      </footer>
    </div>
  );
}
