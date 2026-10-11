import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures';
import { cryptoBars, cryptoTicker } from '../fixtures/live';
import type { Page, Route } from '@playwright/test';
import type { LiveTimeframe } from '../../src/extension/types';
import { LIVE_TIMEFRAMES } from '../../src/extension/catalog';

// Browser routes below are explicit test fixtures, never delivered as app/live data.
async function publicFeed(
  page: Page,
  options: { oldQuote?: boolean; oldHistory?: boolean; forming?: boolean } = {},
) {
  await page.route('https://data-api.binance.vision/**', async (route: Route) => {
    const url = new URL(route.request().url()),
      now = Date.now();
    const tf =
      LIVE_TIMEFRAMES.find((t) => t.binance === url.searchParams.get('interval'))?.id ?? '1h';
    await route.fulfill({
      json: url.pathname.endsWith('ticker/24hr')
        ? cryptoTicker(now - (options.oldQuote ? 600_000 : 0), url.searchParams.get('symbol')!)
        : cryptoBars(now - (options.oldHistory ? 172_800_000 : 0), tf, 80, options.forming ?? true),
    });
  });
}
async function connect(page: Page) {
  await page.getByRole('button', { name: 'Connect public crypto feed', exact: true }).click();
  await expect(page.locator('.ex-live-quote')).toBeVisible();
}

test('landing delivers the extension ZIP and an honest installation guide, not the research dashboard', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Your next move. Now in your browser.' }),
  ).toBeVisible();
  await expect(page.getByText('Real feeds. Zero demo prices.')).toBeVisible();
  await expect(page.locator('.ex-live-quote')).toHaveCount(0);
  await page.getByRole('button', { name: 'How to install' }).click();
  await expect(page.locator('#install')).toBeVisible();
  await expect(page.locator('#install')).toContainText('Load unpacked');
  await expect(page.locator('#install')).toContainText(/enter your Twelve Data key privately/i);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download extension' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('vector-live-extension.zip');
  expect((await readFile((await download.path())!)).subarray(0, 2).toString()).toBe('PK');
});

test('public preview fetches real-adapter-shaped data, excludes forming bars, and exposes model limitations', async ({
  page,
}) => {
  await publicFeed(page);
  await page.goto('/');
  await connect(page);
  await expect(page.locator('.ex-status')).toContainText('Live snapshot');
  await expect(page.locator('.ex-live-quote')).toContainText('108.12');
  await expect(page.locator('.ex-live-quote')).toContainText('USDT');
  await expect(page.getByText('Strength is not a success probability.')).toBeVisible();
  await expect(page.locator('.ex-basis')).toContainText('UTC');
  await expect(page.locator('.ex-candle-note')).toContainText('closed bars only');
  await expect(page.locator('.ex-chart svg')).toHaveAttribute(
    'aria-label',
    /No forming candles used/,
  );
  await page.getByRole('button', { name: 'Evidence', exact: true }).click();
  await expect(page.getByText('Evidence, not a promise.')).toBeVisible();
  await expect(page.locator('.ex-evidence-card')).toContainText('after costs');
  await expect(page.locator('.ex-evidence-card')).toContainText('Wilson');
  await page.getByText('How the signal is calculated').click();
  await expect(page.getByText(/not trained AI or calibrated probability/)).toBeVisible();
});

test('all twelve timeframe controls run the matching provider adapter', async ({ page }) => {
  await publicFeed(page);
  await page.goto('/panel.html');
  await connect(page);
  for (const tf of LIVE_TIMEFRAMES) {
    await page.getByRole('button', { name: tf.label, exact: true }).click();
    await expect(page.getByRole('button', { name: tf.label, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('.ex-chart>div>strong')).toHaveText(tf.label);
    await expect(page.locator('.ex-outlook-main p')).toContainText(`Next ${tf.label} candle`);
  }
});

test('timeframe switching while requests are pending finishes on the newest selection', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('https://data-api.binance.vision/**', async (route) => {
    const url = new URL(route.request().url()),
      tf = (url.searchParams.get('interval') ?? '1h') as LiveTimeframe;
    if (url.pathname.endsWith('klines') && tf === '1h') await gate;
    await route.fulfill({
      json: url.pathname.endsWith('ticker/24hr')
        ? cryptoTicker(Date.now())
        : cryptoBars(Date.now(), tf, 80, true),
    });
  });
  await page.goto('/panel.html');
  await page.getByRole('button', { name: 'Connect public crypto feed', exact: true }).click();
  await page.getByRole('button', { name: '4H', exact: true }).click();
  await expect(page.locator('.ex-chart>div>strong')).toHaveText('4H');
  release();
  await expect(page.locator('.ex-chart>div>strong')).toHaveText('4H');
});

test('foreground pause stops polling but manual refresh still works', async ({ page }) => {
  let count = 0;
  await publicFeed(page);
  page.on('request', (r) => {
    if (r.url().includes('data-api.binance.vision')) count++;
  });
  await page.goto('/panel.html');
  await connect(page);
  await page.getByRole('button', { name: 'Pause automatic refresh' }).click();
  await expect(page.locator('.ex-status')).toContainText('Paused');
  await page.clock.install();
  const before = count;
  await page.clock.fastForward(61_000);
  expect(count).toBe(before);
  await page.getByRole('button', { name: 'Refresh live data', exact: true }).click();
  await expect.poll(() => count).toBeGreaterThan(before);
  await expect(page.locator('.ex-status')).toContainText('Paused');
});

test('forex preview refuses credentials and never substitutes demo prices', async ({ page }) => {
  await page.goto('/panel.html');
  await page.getByRole('combobox', { name: 'Choose live market' }).selectOption('EURUSD');
  await page.getByRole('button', { name: 'Connect forex provider' }).click();
  await expect(page.getByRole('alert')).toContainText('Connect Twelve Data');
  await expect(page.locator('.ex-live-quote')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open private settings' }).click();
  await expect(page.getByLabel('Twelve Data API key')).toBeDisabled();
  await expect(page.getByText('API keys are disabled in this website preview.')).toBeVisible();
});

test('private-key controls stay disabled even if a website has Chrome-like APIs', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'chrome', {
      value: { runtime: { id: 'abcdefghijklmnopabcdefghijklmnop' }, storage: { local: {} } },
      configurable: true,
    });
  });
  await page.goto('/options.html');
  await expect(page.getByLabel('Twelve Data API key')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Test connection' })).toBeDisabled();
});

test('network outages show explicit errors with no invented forecast', async ({ page }) => {
  await page.route('https://data-api.binance.vision/**', (route) => route.abort());
  await page.goto('/panel.html');
  await page.getByRole('button', { name: 'Connect public crypto feed', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No demo prices are substituted');
  await expect(page.locator('.ex-live-quote')).toHaveCount(0);
  await expect(page.locator('.ex-outlook')).toHaveCount(0);
});

test('old quotes and old completed history are not labeled current forecasts', async ({ page }) => {
  await publicFeed(page, { oldQuote: true });
  await page.goto('/panel.html');
  await connect(page);
  await expect(page.locator('.ex-status')).toContainText('Delayed / stale');
  await expect(page.locator('.ex-card-title')).toContainText('Historical technical bias');
  await page.unroute('https://data-api.binance.vision/**');
  await publicFeed(page, { oldHistory: true });
  await page.reload();
  await connect(page);
  await expect(page.locator('.ex-status')).toContainText('Live snapshot');
  await expect(page.locator('.ex-staleness')).toContainText('completed history is old');
  await expect(page.locator('.ex-card-title')).toContainText('Historical technical bias');
});

test('risk sizing is hypothetical, cash-capped, editable, and rejects bad setups', async ({
  page,
}) => {
  await publicFeed(page);
  await page.goto('/panel.html');
  await connect(page);
  await page.getByRole('button', { name: 'Risk sizing', exact: true }).click();
  await expect(page.getByText('Risk before conviction.')).toBeVisible();
  await page.getByLabel('Hypothetical balance · USDT').fill('2000');
  await page.getByLabel('Risk per setup · %').fill('2');
  await expect(page.locator('.ex-size-result')).toContainText('BTC units');
  await page.getByLabel('Stop reference').fill('0');
  await expect(page.getByRole('alert')).toContainText('Enter positive values');
  await expect(page.getByText(/No guaranteed passive income/)).toBeVisible();
});

test('snapshot export identifies sources, historical limits and contains no API key', async ({
  page,
}) => {
  await publicFeed(page);
  await page.goto('/panel.html');
  await connect(page);
  const wait = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export snapshot' }).click();
  const download = await wait;
  const text = await readFile((await download.path())!, 'utf8');
  const json = JSON.parse(text);
  expect(json.priceQuoteCurrency).toBe('USDT');
  expect(json.forecastClosedAt).toMatch(/Z$/);
  expect(json.model).toContain('Not a trained');
  expect(json.limitations).toContain('Historical hit rate is not future accuracy.');
  expect(text).not.toMatch(/apikey|forexKey/i);
});

test('mobile installation/preview and narrow side-panel UI have no horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await publicFeed(page);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Download extension' })).toBeVisible();
  await connect(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Evidence', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/panel.html');
  await page.setViewportSize({ width: 320, height: 740 });
  await connect(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Risk sizing', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('balanced history abstains rather than creating a directional setup', async ({ page }) => {
  await page.route('https://data-api.binance.vision/**', async (route) => {
    const now = Date.now();
    const rows = cryptoBars(now).map((row) => [row[0], '100', '100.1', '99.9', '100', '0', row[6]]);
    await route.fulfill({
      json: route.request().url().includes('ticker')
        ? { ...cryptoTicker(now), lastPrice: '100' }
        : rows,
    });
  });
  await page.goto('/panel.html');
  await connect(page);
  await expect(page.getByRole('heading', { name: 'Wait & observe' })).toBeVisible();
  await expect(page.getByText('No directional consensus')).toBeVisible();
  await expect(page.getByText('No directional setup')).toBeVisible();
  await page.getByRole('button', { name: 'Risk sizing', exact: true }).click();
  await expect(page.getByLabel('Stop reference')).toHaveValue('');
  await expect(page.getByLabel('Target reference')).toHaveValue('');
});
