# Page-based BUY / SELL / WAIT and forward paper results

Vector Live 1.1 uses **live candle data and an explainable technical model, not an external AI API**. It does not interpret screenshots, claim to understand every chart website, place orders, or guarantee accuracy/income.

## Record a call

1. Update/reload the unpacked **`vector-live-extension`** folder in desktop Chrome/Edge.
2. Open your chart website, **click the Vector toolbar icon**, and expand **Page → BUY / SELL / WAIT** in the popup or panel.
3. Click **Analyze current chart page**. This one-time top-frame read inspects only a bounded page title, approved chart toolbar symbol/interval labels and symbol/timeframe URL parameters. No full page, accounts/balances, cookies, screenshots or passwords are read. Nothing from the chart is sent to an AI service.
4. Check the detected symbol/timeframe and click **Use confirmed chart**. Supported metadata includes TradingView-style toolbar labels and `symbol`/`pair`/`market`, `interval`/`timeframe`/`tf` query hints. If the page cannot be identified, select them manually. Conflicting symbols or intervals require manual confirmation.
5. Set hypothetical notional, check the paper-research confirmation, then **Record BUY / SELL / WAIT prediction**. The worker retrieves fresh reference data and derives the final action itself; callers cannot supply a preferred BUY/SELL direction. It can differ from the previous screen if data changes during retrieval.
6. Later press **Check outcomes**, or opt in to **background prediction checks**. Background checks are off by default and run approximately once/minute while pending calls exist, subject to browser scheduling and provider quotas. Keeping the website preview open is not equivalent to an installed background worker.

A page may use a different venue or contract. **BTC/USD is not BTC/USDT; spot is not a perpetual/CFD/future.** Unsupported symbols and derivatives are not automatically substituted. Even a matching name is analyzed with **Binance spot / Twelve Data reference prices**, not broker executions. You must explicitly choose a supported reference market if it differs from your chart.

Only a hostname is retained as page provenance. The full title and URL are not saved in the prediction ledger. Page detection needs temporary `activeTab` permission granted by the toolbar click; browser/extension pages and inaccessible frames cannot be analyzed. No permanent all-sites permission or persistent content script is installed.

## What is frozen before future prices

Each call stores a unique ID/schema/model version, confirmed symbol/timeframe/provider, BUY/SELL/WAIT, technical strength, decision time, quote/source time, completed-candle basis, entry, ATR, stop, target, expiry, notional/units, account currency and both-side cost assumptions.

- A quote and retrieval must be **at most 30 seconds old**, not ahead of the device clock, with a live feed; forex additionally needs provider-confirmed open status. Analysis needs at least 50 candles and the most recent completed UTC candle for the selected interval. Feed errors, delayed/closed prices, old/undersampled history or invalid levels cannot create a directional record.
- Model: the existing causal EMA/MACD/RSI/momentum ensemble. Bullish → BUY; bearish → SELL; neutral → WAIT. Strength is not calibrated probability.
- BUY stop = entry − 1.2 ATR; target = entry + 2.4 ATR. SELL mirrors these. These **recorded** levels are rebased to the fresh reference entry; the ordinary forecast tab still shows completed-close reference levels.
- Expiry = **end of the current selected UTC candle**, not a full interval from the click. A 1M horizon ends at the next real calendar month boundary; a weekly horizon uses Monday UTC. A call recorded near the boundary can expire quickly.
- One immutable call per market/timeframe/expiry, including WAIT. Repeated clicks cannot replace a losing signal after prices move. Subsequent fee/market changes do not rewrite it.
- BUY/SELL are hypothetical 1×-notional positions, not executable orders or evidence that shorting/borrowing is available. WAIT opens no position and is excluded from the trade denominator.

## Honest scoring

The tracker fetches **closed 1-minute historical bars** starting with the decision minute, never backfills old backtests as forward predictions. It evaluates bars in chronological order and persists its cursor across worker/browser restarts.

| Observation                                                            | Result                                                         |
| ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| First unambiguous stop/target touch after entry                        | Hypothetical fill at that level                                |
| A later minute opens beyond a level                                    | Hypothetical exit at that open; stop prices are not guaranteed |
| Both levels touched in one minute, with no known first event           | **AMBIGUOUS**, no P&L or claimed win                           |
| A level is touched in the partially elapsed decision minute            | **AMBIGUOUS**; the touch may precede entry                     |
| A later returned bar follows missing expected minutes                  | **AMBIGUOUS**; the missing price path is unknown               |
| Fully contiguous history through expiry, no level touched              | Exit at the final minute's close                               |
| History absent/delayed, network error, missing key, quota/plan failure | **PENDING**, not a fabricated loss or win                      |
| Neutral call                                                           | **WAIT / abstained**, no trade                                 |

Opening-gap order is known only when the bar starts after the decision. Entry-minute order is not inferred. Expiry cannot be scored from a ticker, a forming bar, or price observed after the expiry window. Market closures/history gaps can leave a call ambiguous or unresolved indefinitely; the extension does not interpolate prices across them.

Each check processes **up to 3 pending calls** and **up to 500 minutes per request**, with cursor-based subsequent requests for long absences/horizons. Large backlogs need additional checks. Forex checks reserve one request from the same local budget as quote/history refreshes and key tests. The default budget is six HTTP requests/minute; it is not a provider-plan entitlement or API-credit guarantee.

### P&L and win rate

- Crypto uses **USDT**, forex uses **USD**; totals are separate, never converted/summed as if equivalent.
- Most markets: units = notional / entry; gross P&L = signed units × (exit − entry); cost = fee bps × (entry notional + exit notional).
- USDJPY: notional/units are base USD; JPY profit/loss converts to USD at the exit rate; both-side notional costs are in USD.
- **WIN / LOSS / FLAT is the sign of net P&L after frozen fees**, not merely whether a target was touched. A small target gain can be a net loss after costs.
- Measured net win rate = wins / (wins + losses + flat). Pending, WAIT and ambiguous calls are excluded but their counts remain visible. No scored outcomes means a dash, not an invented accuracy percentage.
- Approximate Wilson 95% intervals are displayed after scoring. Correlated/selected calls may violate independence; censored/ambiguous calls and selection can bias interpretation. This is descriptive forward paper evidence, not proven out-of-sample skill or future probability.
- Touch/open/expiry fills are **model assumptions**, not real broker fills. Spread beyond configured costs, slippage, funding, borrowing, liquidity, liquidation and taxes are not modeled. Gaps may exceed a stop-loss reference. No real account balance or passive income is measured.

## Storage, export and resets

The installed extension keeps up to **500 records in trusted-context `chrome.storage.local`**, not sync. Browser/worker restart, selected-market changes, fee changes and **Clear local quote cache** preserve the ledger. No pending/losing calls are automatically dropped to make space. When full, export and explicitly clear the **entire** ledger to begin a new evaluation period; there is no individual losing-record delete tool.

**Export all predictions** includes all records, source/model/timing/cost assumptions, statistics and limitations, but no provider key or whole-page content. The UI shows the newest 20 records; exports include all 500. Anyone with browser-profile access can edit local storage: it is **not encrypted or tamper-proof auditing**. Uninstall/profile deletion clears local data; preserve exports if needed.

The public website preview has no chart-page access or forex credentials, and its public-crypto records are **temporary in-memory state** lost on reload. Background prediction checking requires the installed extension.

## Verification boundary

Unit and browser tests use deterministic, explicitly test-only provider/history fixtures. They validate causal timing, ambiguity, cost/currency math, concurrency, permissions and persistence—not actual prediction accuracy. The sandbox cannot contact the live providers or run native extensions in its serverless browser. Verify your installed Chrome/Edge page access, real provider schema/coverage, freshness, forex key/plan and outcome history before relying on results.
