# Install Vector Live in Chrome / Edge

## 1. Get the ready-to-load folder

**From GitHub (no build required):**

1. Open the [branch containing the installable folder](https://github.com/vidu1999/CRYOTOFOREXMARKETPREDICTION/tree/arena/06524d3c-cryotoforexmarketprediction/vector-live-extension).
2. Download the [repository ZIP for that branch](https://github.com/vidu1999/CRYOTOFOREXMARKETPREDICTION/archive/refs/heads/arena/06524d3c-cryotoforexmarketprediction.zip), or choose **Code → Download ZIP** from the branch's repository page.
3. Extract the repository ZIP and find **`vector-live-extension`** inside the extracted repository. Select this inner folder when loading the extension—not the outer repository folder.

**Alternatively:** use **Download extension** in the preview, or `artifacts/vector-live-extension.zip` after a local build, then extract that ZIP.

Keep the **`vector-live-extension`** folder in a permanent location. It contains `manifest.json`, the popup/panel/options pages, `background.js`, `assets/`, and `icons/`. No npm/build command is needed for the checked-in folder. Do not select the ZIP itself or the repository's source `extension/` folder.

## 2. Load unpacked

In desktop **Chrome / Chromium Edge 116+**:

1. Type `chrome://extensions` or `edge://extensions` into the address bar.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select **`vector-live-extension`** (the folder immediately containing `manifest.json`).
4. Pin **Vector Live — Crypto & Forex** using the browser's extension menu.

The source package is locally loaded, not distributed through a browser add-on store. Moving/removing its directory can break it. To update, replace files in the same folder and click **Reload** on the extensions page.

## 3. Open live crypto

Click the Vector toolbar icon. Defaults are **BTC/USDT · 1H** with automatic foreground refresh on. Use the symbol selector and any of the 12 timeframe controls.

The feed uses Binance's public **market-data-only** API. It does not ask for an exchange account, password or trading API key. Click Refresh if automatic polling is paused. Source quote/retrieval times and the latest completed-bar basis must be visible before considering an outlook.

Use the expand button for the native **side panel**. If your browser/version refuses native opening, it opens a full extension tab instead. `Alt+Shift+V` opens the popup if the browser/OS has assigned the shortcut; customize it under the browser's extensions-shortcuts page if needed.

## 4. Connect forex privately

1. Create a market-data API key with **Twelve Data** using your own provider account.
2. Open the **installed extension's Settings** (sliders icon).
3. Enter the key in the native options page, not chat or a website. Its URL begins **`chrome-extension://`** and ends in `options.html`.
4. Click **Test connection**, then **Save settings**. Testing consumes one provider request and checks a EUR/USD quote, not every interval/plan entitlement.
5. Reopen the popup/panel, choose EUR/USD, GBP/USD, USD/JPY or AUD/USD, and refresh.

The key stays in this browser profile's local extension storage, not sync/export. This storage is **not encrypted**. Use a least-privilege market-data key and protect your browser profile. Your provider sees the key as part of its HTTPS request URL; your browser network tools also show it.

Forex coverage, latency, history and quotas depend on your plan. A successful key test does not guarantee 600 candles or access to every timeframe. No paid plan or live connection has been set up for you. The website preview deliberately disables API-key entry.

## 5. Read a chart and measure future predictions

Open your chart tab, click the Vector toolbar icon to grant temporary page access, and expand **Page → BUY / SELL / WAIT**. Click **Analyze current chart page**, verify the detected pair/timeframe (or choose manually), then **Use confirmed chart**. No screenshot or AI API/key is used. Reference feeds may differ from your chart's broker; BTC/USD is not BTC/USDT.

Check the paper-research confirmation, set a hypothetical notional, and click **Record BUY / SELL / WAIT prediction**. Entry, stop, target, expiry, source/decision times and costs are saved before future prices. Later press **Check outcomes**, or opt in to background prediction checks for automatic updates. Unknown both-level/entry-minute order is ambiguous, never invented as a win. Results are paper P&L, not your real account profit.

The installed ledger survives restart and price-cache clearing. Export all predictions before clearing the entire ledger. See [the detailed prediction/scoring guide](PAPER_PREDICTIONS.md). If updating from v1.0, reload the replaced folder and approve Chrome's new temporary `activeTab` / `scripting` permissions if prompted; no permanent all-sites permission is requested.

## 6. Check the installed runtime and actual feeds

The provided package has automated fixture-based validation, but this sandbox could not run native Chrome extensions or contact real market-provider endpoints. In your installed browser, check:

- [ ] Extension page shows no manifest/service-worker errors.
- [ ] Popup opens; expand opens the panel (or documented tab fallback).
- [ ] Crypto price comes from Binance with a recent source timestamp—not just an attractive number.
- [ ] Timeframe changes load closed candles; the source/basis timestamp changes appropriately.
- [ ] Forex key test succeeds with your provider account; selected forex quote/history are available under your plan.
- [ ] Weekend/closed quotes are labeled closed or delayed; old completed history is historical, not current.
- [ ] Pause stops automatic refresh; manual refresh still works.
- [ ] Background polling stays off unless you explicitly enable it.
- [ ] Disconnecting the network produces a visible error rather than invented prices.
- [ ] After a toolbar click on your chart, Analyze Page shows only chart metadata; confirm detection manually if missing/ambiguous.
- [ ] Recording creates exactly one paper call with locked entry/stop/target/expiry; repeated clicks cannot overwrite it.
- [ ] Check outcomes uses later minute history; ambiguous/pending calls are not reported as wins.
- [ ] Close/reopen the browser and clear only quote cache: the ledger remains; USD/USDT totals are separate.
- [ ] Both background quote refresh and prediction checks stay off until explicitly enabled.
- [ ] Snapshot/ledger exports contain timestamps/limitations and no API key.

None of these checks establishes future predictive accuracy. Compare provider quotes with an independent source and use paper trading/untouched historical evaluation before risking capital.

## Troubleshooting

| Symptom                     | What to check                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Cannot find `manifest.json` | Select the extracted inner `vector-live-extension` folder, not the ZIP/repository/source folder                                 |
| Chart page cannot be read   | Return to a normal website, click the Vector toolbar icon and retry; use manual confirmation for unsupported metadata           |
| Prediction remains pending  | Wait for closed minute history; check key/plan/quota/connectivity. Repeated checks advance long backlogs; no loss is fabricated |
| Worker unavailable          | Reload on the browser's extensions page and reopen the popup; inspect the service-worker error list                             |
| Side panel does not open    | Update Chrome/Edge; native opening requires a user click; use the extension-tab fallback                                        |
| Crypto feed unavailable     | Provider outage, regional/network restrictions or offline device; no simulated substitute is used                               |
| Forex setup required        | Save the key in the installed extension's native settings, then manually refresh                                                |
| HTTP/provider/plan error    | Verify Twelve Data key validity, forex access, interval/history coverage and provider quotas                                    |
| Rate-limit/cooldown         | Wait for the window, reduce refresh/requests or check your plan; clearing cache does not reset quota                            |
| Valid quote, old history    | The outlook is historical; check provider history coverage, date/clock and requested interval                                   |
| Fewer than 50 closed bars   | Choose another timeframe/history plan; no directional signal is generated                                                       |
| Timestamp ahead of device   | Check system time; do not use a falsely fresh signal                                                                            |

**No guaranteed accuracy, profitable next move or passive income.** This extension performs explainable technical research and hypothetical sizing, not order execution or investment management.
