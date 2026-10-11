# Vector Live — Chrome / Edge Crypto & Forex Extension

An **installable Manifest V3 desktop browser extension**, not just a web dashboard. It provides a toolbar popup, native side panel, live-provider quote snapshots, 12-timeframe technical analysis, historical evidence, and hypothetical risk sizing.

**Real market data or an explicit error—never a demo-price fallback.** This is rule-based technical research, not trained AI, a calibrated prediction probability, an automated trader, or guaranteed passive income.

## Install the extension

The ready-to-load **[`vector-live-extension/`](vector-live-extension/)** folder is included in this GitHub branch—**no build tools are required to install it**. On GitHub, choose **Code → Download ZIP** for the branch containing this folder, extract the repository, and keep its inner `vector-live-extension` folder in a permanent location. See [the installation guide](docs/INSTALL_EXTENSION.md).

Alternatively, use **Download extension** in the running preview or `artifacts/vector-live-extension.zip` after a local build.

1. Extract the GitHub repository ZIP or extension ZIP to a permanent folder.
2. Open `chrome://extensions` or `edge://extensions` in **desktop Chrome/Edge 116+**.
3. Enable **Developer mode**, choose **Load unpacked**, and select the extracted **`vector-live-extension`** folder containing `manifest.json`.
4. Pin **Vector Live** from the browser's extension menu. Open its popup; use the expand button for the native side panel. If the browser cannot open the panel, a full extension tab is the fallback.
5. Crypto connects to public market data without an exchange login or API key.
6. For forex, open the **installed extension's Settings** and enter a **Twelve Data market-data API key privately**. Test and save it there. Never paste a key into chat or the website preview.

This is a locally loaded extension, **not a Chrome Web Store / Edge Add-ons listing**. No account or exchange connection is configured on your behalf.

## Data sources and coverage

| Feed   | Source                                                                                      | Access                                                                        |
| ------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Crypto | Binance public market-data-only `https://data-api.binance.vision` (`ticker/24hr`, `klines`) | No account/key; availability depends on provider, region and network          |
| Forex  | Twelve Data `https://api.twelvedata.com` (`quote`, `time_series`)                           | Private provider key; coverage, delay, quotas and history depend on your plan |

**Starter markets:** BTC/USDT, ETH/USDT, SOL/USDT, BNB/USDT, XRP/USDT, DOGE/USDT; EUR/USD, GBP/USD, USD/JPY, AUD/USD. This is not every traded instrument. USDT prices/accounts are labeled **USDT**, not assumed equivalent to USD.

**Timeframes:** `1m · 5m · 15m · 30m · 1h · 2h · 4h · 8h · 12h · 1d · 1w · 1mo`.

- Crypto uses native provider bars (case-sensitive `1M` for calendar months).
- Forex 12H is aggregated from **three complete UTC-aligned 4H bars**, because Twelve Data does not advertise a native 12h interval. Incomplete or gapped buckets are omitted, not interpolated.
- Native calendar-month closes are not approximated by rolling 30-day windows.
- Forming bars are excluded. A forecast requires **50 completed candles**; undersampled history returns **no signal**, not a guess.
- Up to 600 closed analysis bars are used; 12H forex requests up to 1,800 source bars. Provider plans may return fewer or reject an interval.
- Forex volume may be unavailable and is represented as unused zero; the model does not use volume.

### Freshness, polling and failures

This is **polled REST data, not tick-by-tick streaming**. Source quote time, retrieval time and forecast closed-candle basis are shown separately in UTC.

- Foreground automatic refresh: crypto **15s**, forex **60s**; paused by the user and skipped while the document is hidden. Manual refresh remains available.
- Background refresh is **off by default**. Opt-in Chrome alarms: crypto **1 minute**, forex **5 minutes**. Browser scheduling/network access is not guaranteed; there are no push alerts.
- Recent worker cache may be reused (12s crypto / 45s forex). Concurrent requests for the same selection are coalesced. Old requests cannot publish after a selection/key change or cache clear.
- Recent quote/retrieval thresholds are 90s crypto / 180s forex. These indicate snapshot freshness, **not a provider latency guarantee**. Closed markets, old quotes, old history, outages and timestamp/clock errors are labeled. Recent quotes do not make old candles current.
- Failed refreshes can retain the last received snapshot, but it is explicitly **offline/historical**, not a new live forecast.
- Default local forex budget: **6 HTTP requests/minute**. A refresh normally uses two requests; key testing uses one. Budgets survive worker suspension and are not reset by clearing market data. They do not override provider API-credit weights, daily quotas or subscription limits.
- Rate limits, regional restrictions, malformed data and unsupported plans produce visible errors. There is **no synthetic-price, guessed-candle or fake-accuracy fallback**.

## What the forecast means

A causal technical ensemble combines ATR-normalized EMA 20/50 trend (50%), MACD histogram (15%), RSI displacement (20%) and three-candle momentum (15%). Scores above +0.20 are bullish, below −0.20 bearish; otherwise it **abstains**.

**Strength = |score| × 100. It is not prediction accuracy or calibrated odds.** Agreement among correlated indicators does not make a trade certain. The outlook is for the next candle **after the latest loaded completed close**, whose timestamp is visible. It may refer to the already-forming current interval, not a fresh full interval from the moment you click.

Target/invalidation references are 2.4 / 1.2 ATR offsets from that completed close, not executable orders or guaranteed limits. Neutral signals suggest no directional setup. Independently validated real-world accuracy is **not established**.

### Historical evidence

The Evidence tab evaluates the latest available 250 bars after a 50-bar warm-up. Previous-close signals enter at next open and exit at that candle's close, at 1× current equity with costs on both sides. Neutral signals abstain; flat returns are excluded from directional scoring. It displays sample count, directional hit rate, previous-candle baseline, approximate Wilson 95% interval, net return and drawdown.

This is not independent out-of-sample validation and **not a stop/target execution backtest**. Wilson assumes independent observations, which markets may violate. Slippage, spread beyond the configured cost, funding, borrowing, tax, liquidity and broker/liquidation constraints are omitted. Short gaps can lose beyond equity; the ledger preserves negative balances and stops at nonpositive equity. **100% directional accuracy can still lose after costs.**

Default per-side cost assumptions: 10 bps crypto / 1 bp forex, adjustable. Crypto account math is in USDT, other forex in USD; USDJPY JPY P&L converts to USD at the exit rate.

### Risk sizing and income

Sizing is hypothetical, cash-capped, includes modeled costs and adds no leverage. USDJPY stop/target conversions use reference exit rates. It does not read your exchange balance or submit any order. **Stops can slip and do not guarantee a loss limit. Trading returns and passive income are never guaranteed.**

## Credentials, permissions and privacy

- Only `storage`, `alarms`, `sidePanel` permissions and two exact market-provider host permissions.
- No content scripts, page scraping, exchange authentication, transaction signing, order execution, telemetry, analytics, external fonts or backend.
- Key entry/read/save/test is allowed only on the **same-extension native options page**. The website preview cannot accept/store a forex key, even when Chrome-like APIs are injected into it.
- Keys use **`chrome.storage.local`**, restricted to trusted extension contexts—not sync. This is **not encrypted secret-vault storage**: anyone with access to your browser profile may access it. Use a dedicated, least-privilege market-data key.
- Quotes/history/errors and request budget use `chrome.storage.session` (browser-session cache). Public state and exports exclude the key. Provider error messages redact known/query-style API keys.
- Requests omit cookies and referrers. Twelve Data's API uses the key as an HTTPS query parameter; it is visible in your own browser network tools and to that provider.
- Remove key → **Save settings** to delete it. Clear cache removes snapshots/errors without bypassing request budgets. Removing the extension removes its local profile storage.

## Build and develop

Use **Node.js 22.18+**.

```bash
npm ci
npm run build:extension  # Typecheck; refresh vector-live-extension/ + dist/extension + ZIP
npm run dev              # Installation site and public-only crypto preview, port 5173
npm run build            # Extension package, then website in dist/site
npm run preview          # Serve production website (including ZIP download)
```

To develop the native extension, load `vector-live-extension` (or `dist/extension`) unpacked, rebuild after edits and click **Reload** in the browser's extensions page. The root website is only the installer/public preview; its API-key controls are intentionally disabled. Arena preview hosts are allowed, and browser requests never target sandbox localhost backends.

```bash
npm test                  # Analytics, providers, protocol, privacy, concurrency and package
npm run format:check
npm audit --audit-level=high
npx playwright install --with-deps chromium
npm run test:e2e          # Preview + preserved research + native MV3 smoke test
```

`PLAYWRIGHT_BASE_URL` can target an existing dev server. `CHROMIUM_EXECUTABLE_PATH` supports a serverless test browser with a fresh process per test. The **native MV3 smoke test is skipped in that mode** because headless-shell lacks extension support; use full Playwright Chromium (the test uses `channel: 'chromium'`). Build before native/package tests. CI builds and runs the full-browser smoke test and uploads the extension ZIP.

### Verification boundary

Automated tests use **explicit deterministic provider fixtures and in-memory storage**; they test behavior, not real-market accuracy. The sandbox's allowed network hosts exclude Binance/Twelve Data, and its available headless-shell browser cannot run native extensions. Therefore **real provider connectivity, real forex entitlement/credentials and installed Chrome/Edge behavior have not been verified in this sandbox**. The native smoke test is supplied for full-browser environments. Complete the installed-browser check in the [installation guide](docs/INSTALL_EXTENSION.md) before relying on data. No live key or trading account has been configured here.

## Source layout

```text
vector-live-extension/        Checked-in, ready-to-load build for GitHub downloads
extension/manifest.json       Source manifest: MV3, popup, options, side panel, hosts
src/extension/                Live-only catalog, adapters, worker, storage, UI, private options
src/lib/analytics.ts          Reusable causal model and chronological ledger
src/lib/risk.ts               Currency-aware hypothetical sizing
vite.extension.config.ts      Relative, self-contained extension build; module service worker
scripts/package-extension.mjs PNG icons, bundled licenses, validation, installer and ZIP
tests/fixtures/               Test-only fixtures, never in the shipped extension
src/extension/*.test.ts       Adapter/security/protocol/concurrency/package unit tests
tests/e2e/                    Browser UI, native package and research regression tests
```

The `vector-live-extension/` directory is intentionally checked in so GitHub users can install without Node.js. Do not hand-edit its hashed bundles; `npm run build:extension` replaces it from source, removing stale assets. Other build directories, dependency caches, generated ZIPs and test results remain ignored.

The older **offline research/demo workspace** is preserved separately at `/research.html` with its [own documentation](docs/research-workspace.md). It is not the live extension, is not shipped inside it, and does not supply its prices or candles.
