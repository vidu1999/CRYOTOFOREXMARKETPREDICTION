import { test, expect, chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { cryptoBars, cryptoTicker, forexBars, forexQuote } from '../fixtures/live';

// Native MV3 smoke test requires full Playwright Chromium, not serverless headless-shell.
// Data responses are patched test fixtures inside the actual extension worker.
test('packaged MV3 loads native worker, popup and private options with real browser APIs', async () => {
  test.skip(
    !!process.env.CHROMIUM_EXECUTABLE_PATH,
    'Custom serverless browser does not support native extensions. Run with full Playwright Chromium.',
  );
  const path = resolve('vector-live-extension');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${path}`, `--load-extension=${path}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const id = new URL(worker.url()).host,
      now = Date.now();
    await worker.evaluate(
      ({ ticker, bars, fxQuote, fxBars }) => {
        globalThis.fetch = async (input: string | URL | Request) => {
          const url = new URL(String(input));
          const data = url.pathname.endsWith('ticker/24hr')
            ? ticker
            : url.pathname.endsWith('klines')
              ? bars
              : url.pathname.endsWith('time_series')
                ? fxBars
                : fxQuote;
          return new Response(JSON.stringify(data), {
            headers: { 'content-type': 'application/json' },
          });
        };
      },
      {
        ticker: cryptoTicker(now),
        bars: cryptoBars(now, '1h', 80, true),
        fxQuote: forexQuote(now),
        fxBars: forexBars(now),
      },
    );
    const options = await context.newPage();
    await options.goto(`chrome-extension://${id}/options.html`);
    await expect(options.getByLabel('Twelve Data API key')).toBeEnabled();
    await options.getByLabel('Twelve Data API key').fill('fixture-native-only-key');
    await options.getByRole('button', { name: 'Save settings' }).click();
    await expect(options.locator('.ex-settings-feedback')).toContainText('Settings saved locally');
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await expect(popup.locator('.ex-live-quote')).toBeVisible();
    await expect(popup.locator('.ex-live-quote')).toContainText('108.12');
    const state = await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'GET_STATE' }));
    expect(JSON.stringify(state)).not.toContain('fixture-native-only-key');
    const denied = await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'GET_OPTIONS' }));
    expect(denied).toMatchObject({ ok: false });
    await options.getByRole('button', { name: 'Test connection' }).click();
    await expect(options.locator('.ex-settings-feedback')).toContainText('valid EUR/USD quote');
    await popup.getByRole('combobox', { name: 'Choose live market' }).selectOption('EURUSD');
    await expect(popup.locator('.ex-live-quote')).toContainText('1.10100');
    await expect(popup.locator('.ex-source')).toContainText('Twelve Data');
    await options.getByLabel('Background refresh').check();
    await options.getByRole('button', { name: 'Save settings' }).click();
    const alarm = await popup.evaluate(() => chrome.alarms.get('vector.live.refresh'));
    expect(alarm?.periodInMinutes).toBe(5);
    await options.getByRole('button', { name: 'Remove key' }).click();
    await options.getByRole('button', { name: 'Save settings' }).click();
    expect(
      await options.evaluate(
        async () =>
          (await chrome.storage.local.get('vector.live.forex-key'))['vector.live.forex-key'],
      ),
    ).toBe('');
    expect(await popup.evaluate(() => typeof chrome.sidePanel.open)).toBe('function');
  } finally {
    await context.close();
  }
});
