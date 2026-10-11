# Vector — Crypto & Forex Market Intelligence

A responsive, local-first research dashboard built with **React, TypeScript, and Vite**. It turns OHLCV history into explainable multi-timeframe signals, chronological backtests, and risk-first planning.

**This is a research tool, not an exchange connection, investment service, or automated trading bot. High prediction accuracy, profitable trades, and passive income are not guaranteed.**

## Run locally

Use **Node.js 22.18+** (Node 22 LTS recommended).

```bash
npm ci
npm run dev
```

The development server binds to `0.0.0.0`. Arena's proxied `.e2b.app` preview hosts are explicitly allowed. The app uses relative asset URLs and has no browser-to-localhost backend calls.

```bash
npm run build          # Type check and produce dist/
npm run preview        # Serve the production build
npm test               # Pure analytics, aggregation, CSV and risk tests
npm run test:watch
npm audit
```

Browser workflow tests:

```bash
npx playwright install chromium
npm run test:e2e
```

`PLAYWRIGHT_BASE_URL` can target an existing server. `CHROMIUM_EXECUTABLE_PATH` can use an existing Chromium binary. The latter gets an isolated browser process per test for serverless-browser compatibility; normal installations use Playwright's standard browser fixtures.

## Workspace

- **Overview:** crypto/forex market cards, candlestick or line chart, hover OHLC readout, zoom, EMA overlays, next-candle bias, timeframe alignment, and watchlist.
- **Signal lab:** RSI 14, EMA 20/50, MACD 12/26/9, ATR 14, a transparent signal thesis, and clearly labeled illustrative scenarios.
- **Backtesting:** causal one-candle signals, next-open entry, close exit, user-adjustable costs, directional hit rate, persistence baseline, net equity, drawdown, profit factor, sample uncertainty, and downloadable trades.
- **Risk & income:** account-capped position sizing, modeled stop/target P&L including fees, plus a hypothetical cashflow planner with negative and zero-return scenarios.
- **Watchlist:** saved markets, category/search filters, and local snapshot thresholds. These are **not live price alerts** or push notifications.
- **Data & privacy:** validated CSV import, a downloadable demo CSV, source disclosure, and removal of imported history.
- **Exports:** analysis JSON, backtest CSV, and hypothetical risk-plan JSON. Reports identify their source and limitations.
- **Navigation:** responsive mobile menu, keyboard market search (`Ctrl/⌘ K` or `/`), modal focus trapping, Escape dismissal, and a skip-to-content link.

### Markets and timeframes

The starter universe contains **BTC/USD, ETH/USD, SOL/USD, BNB/USD, EUR/USD, GBP/USD, USD/JPY, and AUD/USD**. This is not an exhaustive catalog of all traded instruments; additional **USD-quoted** markets can be analyzed via CSV import.

Supported chart/analysis timeframes:

`1m · 5m · 15m · 1h · 4h · 1d · 1w · 1mo`

Weekly aggregation starts on UTC Monday. Monthly candles use calendar months, not rolling 30-day windows. At least **50 completed candles** are required for an analytical signal. Unavailable or undersampled timeframes are disabled; the app never fabricates lower-timeframe candles from higher-timeframe data.

## Data sources: explicit and offline

### Built-in demo

All built-in prices and candles are **deterministic synthetic fixtures**, anchored at **11 October 2026, 00:00 UTC**. They are not real historical quotes, exchange feeds, or current market prices. Multi-timeframe fixtures share OHLC endpoints; finer recent candles reconcile to their hourly aggregates. Demo performance is not evidence of real-world predictive accuracy.

There are no remote market-data calls or API credentials. This application does not currently provide live analysis. Connecting an approved market-data feed and independently validating the strategy would be separate work.

### Import your own history

Use a CSV with a header:

```csv
timestamp,open,high,low,close,volume
2026-01-01T00:00:00Z,100,102,99,101,500
2026-01-01T01:00:00Z,101,103,100,102,600
```

The snippet shows the format only; provide at least **50 rows of completed candles**.

- `timestamp`, `time`, `datetime`, or `date` is accepted, case-insensitively.
- ISO dates and Unix seconds/milliseconds are supported. Timezone-free ISO datetimes are treated as UTC.
- Timestamps represent **candle openings**. Future and still-forming candles are rejected.
- Native calendar-month opening timestamps are recognized, including varying month lengths.
- Open/high/low/close must be positive, finite, and internally consistent. Volume is optional and must be nonnegative when supplied.
- Quoted fields, BOM, CRLF, chronological sorting, and duplicate detection are supported.
- Up to **8 MB / 100,000 candles** per file. The full import is available to aggregation; indicator history is capped to the most recent 5,000 bars per timeframe for browser responsiveness.
- Gaps are reported, not interpolated. Only complete, contiguous UTC aggregation buckets are used. This conservative rule also omits buckets spanning market-closure gaps in intraday forex history. Import vendor-provided native higher-timeframe candles when needed.
- Imported prices must be **USD-quoted** for correct account sizing. Convert non-USD-quoted CSVs externally before import. The built-in USD/JPY fixture has explicit JPY-to-USD account conversion.
- User history is **not independently verified**. Files labeled as demo remain labeled as imported demo data.
- One imported instrument is available at a time, held only in memory. Reloading clears imported candles. Replacing an import removes its old snapshot alerts.

## What the numbers mean

### Technical signal, not an AI accuracy claim

For each closed candle, a causal ensemble combines:

- **50%** bounded EMA trend: `tanh((EMA20 − EMA50) / ATR × 0.32)`
- **15%** bounded MACD histogram: `tanh(histogram / ATR × 4)`
- **20%** RSI displacement: `(RSI − 50) / 50`
- **15%** bounded three-candle momentum: `tanh((close − close[-3]) / ATR × 0.6)`

Forecasts are relative to the latest **loaded completed candle**, whose closing timestamp is shown. Old imports do not become current-market predictions.

Scores above `+0.20` are bullish, below `−0.20` bearish, otherwise neutral. **Strength = abs(score) × 100, not a calibrated probability or a success rate.** This is a rule-based technical model, not trained machine learning. Indicators are correlated and can agree while being wrong.

Reference stop and target levels are 1.2 ATR and 2.4 ATR away, oriented by the score. Nonpositive references are floored at 0.1% of the close. Scenario paths use score × ATR, with outer paths widening by square root of time × ATR. Their coverage is unmeasured: **they are not statistical confidence bands**.

### Backtesting and accuracy

After a 50-candle warm-up, each nonneutral signal at the prior close enters at the following candle's open and exits at its close. Position notional equals current equity (1×), with fees/spread on both entry and exit. USDJPY JPY profits/losses convert to account USD at the exit price; other instruments are USD quoted.

- **Directional hit rate:** correct open-to-close directions on nonflat, nonneutral observations, before costs.
- **Persistence baseline:** the prior candle's direction, evaluated on the same scored observations.
- **Net winning trades:** positive P&L after modeled costs; distinct from correct direction.
- **Net return, drawdown, and profit factor:** calculated from the trade ledger, not hard-coded.
- **Approximate 95% accuracy interval:** Wilson interval; assumes independent observations, which financial series may violate.

The test is **not a target/stop execution backtest**. It excludes slippage, funding, borrowing, taxes, liquidity, and broker liquidation rules. Short trades require a suitable product and can lose beyond initial equity; the simulation preserves such negative balances and stops trading at nonpositive equity. Default costs are 10 bps per side for crypto and 1 bp for forex, purely illustrative and adjustable.

A unit test explicitly demonstrates that **100% directional accuracy can still produce losses after costs**. Use independently sourced history, appropriate trading costs, and an untouched evaluation period before making any performance claim. Repeatedly selecting favorable windows or parameters is not out-of-sample validation.

### Risk and cashflow

Position sizing caps modeled risk at the chosen budget and notional at account capital, reserves estimated costs, and adds no leverage. USDJPY stop/target P&L converts at the corresponding reference exit FX rate. **Stops do not guarantee a maximum loss.** Gaps and other execution risks remain.

The cashflow planner applies a constant hypothetical annual return through monthly compounding, with end-of-month contributions and scheduled withdrawals. It compares a user scenario with −15% and 0% annual references. It excludes tax, fees, inflation, and stochastic volatility. Balances floor at zero and withdrawals can become unfundable. The annual-withdrawal/assumed-return calculation is arithmetic, not evidence of sustainable income.

**Trading is active, not guaranteed passive income. Staking and yield products add market, custody, liquidity, and smart-contract risks.**

## Privacy and architecture

No account, telemetry, backend, external fonts, exchange authentication, or trade execution is included. Fonts and icons are bundled locally. CSVs are processed in the browser. Watchlist, account/risk preferences, and demo-asset snapshot alerts persist in local storage; users can clear site data to remove them. Imported-market alerts are session-only.

```text
src/
  App.tsx                         Workspace state, navigation, source handling
  components/
    Charts.tsx                    Responsive SVG charts and hover interactions
    MarketPages.tsx               Overview and signal lab
    ResearchPages.tsx             Backtests, risk/cashflow, watchlist
    WorkspaceDialogs.tsx          Data import, market search, snapshot alerts
    UI.tsx                        Accessible dialogs and shared components
  lib/
    analytics.ts                  Causal indicators and chronological backtests
    market.ts                     Demo fixtures, UTC aggregation, formatting
    csv.ts                        Validated local OHLCV parsing/export
    risk.ts                       Account sizing and cashflow scenarios
    *.test.ts                     Calculation and edge-case tests
tests/e2e/                        Browser workflows and responsive checks
```

Production is a static build in `dist/`. Deployment does not require a backend. Generated browser reports, build output, caches, and dependencies are ignored by Git.
