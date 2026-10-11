# Install Vector Live in Chrome / Edge

## 1. Get the ZIP

Use **Download extension** on the preview, or `artifacts/vector-live-extension.zip`.

Extract it. Keep the extracted **`vector-live-extension`** folder in a permanent location. It contains `manifest.json`, the popup/panel/options pages, `background.js`, `assets/`, and `icons/`. Do not select the ZIP itself or the repository's source `extension/` folder.

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

## 5. Check the installed runtime and actual feeds

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
- [ ] Export contains timestamps/limitations and no API key.

None of these checks establishes future predictive accuracy. Compare provider quotes with an independent source and use paper trading/untouched historical evaluation before risking capital.

## Troubleshooting

| Symptom                     | What to check                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| Cannot find `manifest.json` | Select the extracted inner `vector-live-extension` folder, not the ZIP/repository/source folder      |
| Worker unavailable          | Reload on the browser's extensions page and reopen the popup; inspect the service-worker error list  |
| Side panel does not open    | Update Chrome/Edge; native opening requires a user click; use the extension-tab fallback             |
| Crypto feed unavailable     | Provider outage, regional/network restrictions or offline device; no simulated substitute is used    |
| Forex setup required        | Save the key in the installed extension's native settings, then manually refresh                     |
| HTTP/provider/plan error    | Verify Twelve Data key validity, forex access, interval/history coverage and provider quotas         |
| Rate-limit/cooldown         | Wait for the window, reduce refresh/requests or check your plan; clearing cache does not reset quota |
| Valid quote, old history    | The outlook is historical; check provider history coverage, date/clock and requested interval        |
| Fewer than 50 closed bars   | Choose another timeframe/history plan; no directional signal is generated                            |
| Timestamp ahead of device   | Check system time; do not use a falsely fresh signal                                                 |

**No guaranteed accuracy, profitable next move or passive income.** This extension performs explainable technical research and hypothetical sizing, not order execution or investment management.
