import { expect, test as base } from '@playwright/test';

// Serverless Chromium cannot safely reuse a process across isolated contexts.
// Normal Playwright installations use the standard, faster worker-scoped browser.
const test = process.env.CHROMIUM_EXECUTABLE_PATH
  ? base.extend({
      context: async ({ playwright, launchOptions, baseURL, viewport }, use) => {
        const browser = await playwright.chromium.launch(launchOptions);
        const context = await browser.newContext({ baseURL, viewport: viewport ?? undefined });
        try {
          await use(context);
        } finally {
          await context.close();
          await browser.close();
        }
      },
    })
  : base;

const historyCSV = (count = 250) =>
  'timestamp,open,high,low,close,volume\n' +
  Array.from({ length: count }, (_, i) => {
    const open = 100 + i * 0.05;
    return `${new Date(Date.UTC(2026, 0, 1) + i * 3_600_000).toISOString()},${open},${open + 0.2},${open - 0.1},${open + 0.05},1000`;
  }).join('\n');

test.beforeEach(async ({ page }) => {
  await page.goto('/research.html');
  await expect(page.getByRole('heading', { name: 'Market overview' })).toBeVisible();
});

test('overview exposes demo status and working chart controls across all eight timeframes', async ({
  page,
}) => {
  await expect(page.getByRole('button', { name: 'Demo data', exact: true })).toBeVisible();
  for (const tf of ['1m', '5m', '15m', '1H', '4H', '1D', '1W', '1M']) {
    await page.getByRole('button', { name: tf, exact: true }).click();
    await expect(page.getByRole('button', { name: tf, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('.price-chart svg')).toHaveAttribute(
      'aria-label',
      /completed candles/,
    );
  }
  await page.getByRole('button', { name: 'Line chart', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Line chart', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Toggle EMA overlays', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Toggle EMA overlays', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
});

test('keyboard market search opens a forex analysis', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: 'Find your market' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search crypto or forex' }).fill('EUR/USD');
  await page.locator('.search-results button').click();
  await expect(page.locator('.instrument-title h2')).toHaveText('Euro / US Dollar');
  await expect(page.locator('.instrument-meta')).toContainText('EUR / USD');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('signal lab explains indicators and makes methodology expandable', async ({ page }) => {
  await page.getByRole('button', { name: /^Signal lab/ }).click();
  await expect(page.getByRole('heading', { name: 'Understand the next move.' })).toBeVisible();
  await expect(page.locator('.indicator-card')).toHaveCount(4);
  await expect(page.locator('.matrix-row')).toHaveCount(8);
  await page.getByRole('button', { name: /No black box/ }).click();
  await expect(page.locator('.methodology-content')).toContainText('not a probability');
  await expect(page.locator('.methodology-content')).toContainText('50%');
});

test('backtest applies costs, paginates trade history, and exports genuine computed results', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Backtesting', exact: true }).click();
  await page.getByLabel('Evaluation window').selectOption('100');
  await page.getByLabel(/Fee \/ spread per side/).fill('25');
  await expect(page.locator('.controls-note')).toContainText('Settings changed');
  await page.getByRole('button', { name: 'Run backtest' }).click();
  await expect(page.locator('.controls-note')).toContainText('25 bps per side');
  await expect(page.locator('.controls-note')).toContainText('Evaluated 100');
  const firstTrade = await page.locator('.trade-history tbody tr').first().innerText();
  await page.getByRole('button', { name: 'Next trades' }).click();
  expect(await page.locator('.trade-history tbody tr').first().innerText()).not.toEqual(firstTrade);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export results', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('vector-btc-1h-backtest.csv');
  expect(await download.failure()).toBeNull();
});

test('risk calculator sizes within the account budget and rejects an invalid stop', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Risk & income', exact: true }).click();
  await page.getByLabel('Entry reference').fill('100');
  await page.getByLabel('Stop reference').fill('95');
  await page.getByLabel('Target reference').fill('110');
  await page.getByLabel('Costs per side').fill('0');
  await expect(page.locator('.position-units > strong')).toHaveText('20');
  await expect(page.locator('.sizing-stats')).toContainText('$100.00');
  await expect(page.locator('.sizing-stats')).toContainText('2.00R');
  await page.getByLabel('Stop reference').fill('100');
  await expect(page.getByRole('alert')).toContainText('target opposite the stop');
  await expect(page.getByRole('button', { name: 'Export risk plan' })).toBeDisabled();
});

test('cashflow planner handles zero and negative returns without a guaranteed-income claim', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Risk & income', exact: true }).click();
  await page.getByRole('spinbutton', { name: /^Account balance/ }).fill('1000');
  await page.getByLabel('Monthly contribution').fill('100');
  await page.getByLabel('Monthly withdrawal goal').fill('0');
  await page.getByLabel('Hypothetical annual return').fill('0');
  await page.getByLabel('Planning horizon').selectOption('12');
  await expect(page.locator('.income-stat-row .stat').first()).toContainText('$2,200');
  await page.getByLabel('Hypothetical annual return').fill('-15');
  await expect(page.locator('.income-stat-row')).toContainText('No positive yield');
  await expect(page.locator('.income-stat-row')).not.toContainText('NaN');
  await expect(page.getByText('There is no guaranteed passive income from trading.')).toBeVisible();
});

test('watchlist filters and saved preferences survive reload', async ({ page }) => {
  await page.getByRole('button', { name: /^Watchlist/ }).click();
  await page.getByRole('button', { name: 'Remove Bitcoin from watchlist' }).click();
  await expect(page.getByRole('button', { name: 'Add Bitcoin to watchlist' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Add Bitcoin to watchlist' })).toBeVisible();
  await page.getByLabel('Filter markets').fill('nonesuch');
  await expect(page.getByRole('heading', { name: 'No markets found' })).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.locator('.universe-table tbody tr')).toHaveCount(8);
  await page.getByRole('button', { name: 'Forex', exact: true }).click();
  await expect(page.locator('.universe-table tbody tr')).toHaveCount(4);
});

test('alerts are local, snapshot-only, persistent and removable', async ({ page }) => {
  await page.getByRole('button', { name: 'Manage 0 snapshot alerts' }).click();
  await expect(page.getByText(/There is no live monitoring/)).toBeVisible();
  await page.getByLabel('Price threshold').fill('1');
  await page.getByRole('button', { name: 'Save threshold' }).click();
  await expect(page.locator('.saved-alert')).toContainText('Snapshot matches');
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: 'Manage 1 snapshot alerts' }).click();
  await expect(page.locator('.saved-alert')).toHaveCount(1);
  await page.getByRole('button', { name: 'Delete threshold for BTC / USD' }).click();
  await expect(page.locator('.saved-alert')).toHaveCount(0);
});

test('CSV import analyzes user history, disables unavailable timeframes, and can be removed', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Import data', exact: true }).click();
  await page.getByLabel(/Market label/).fill('ETH / USD');
  await page.getByLabel('OHLCV CSV file').setInputFiles({
    name: 'eth-history.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(historyCSV()),
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Imported CSV', exact: true })).toBeVisible();
  await expect(page.locator('.instrument-title h2')).toHaveText('ETH / USD');
  await expect(page.getByRole('button', { name: '1m', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '4H', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Imported CSV', exact: true }).click();
  await page.getByRole('button', { name: 'Remove imported data' }).click();
  await expect(page.getByRole('button', { name: 'Demo data', exact: true })).toBeVisible();
});

test('CSV import shows validation errors and allows retry without closing the dialog', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Import data', exact: true }).click();
  await page.getByLabel('OHLCV CSV file').setInputFiles({
    name: 'bad.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('timestamp,close\n2026-01-01,100'),
  });
  await expect(page.getByRole('alert')).toContainText('at least 50');
  await page
    .getByLabel('OHLCV CSV file')
    .setInputFiles({ name: 'valid.csv', mimeType: 'text/csv', buffer: Buffer.from(historyCSV()) });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Imported CSV', exact: true })).toBeVisible();
});

test('JSON research report labels its data source and limitations', async ({ page }) => {
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export report', exact: true }).click();
  const download = await event;
  const stream = await download.createReadStream();
  let content = '';
  for await (const chunk of stream!) content += chunk.toString();
  const report = JSON.parse(content);
  expect(report.source.live).toBe(false);
  expect(report.source.type).toBe('Demo data');
  expect(report.walkForwardBacktest.observations).toBeGreaterThan(0);
  expect(report.limitations.join(' ')).toContain('not a calibrated probability');
});

test('mobile pages stay within the viewport and navigation is usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const destination of ['overview', 'signals', 'backtesting', 'risk', 'watchlist']) {
    await page.goto(`/research.html#${destination}`);
    await expect(page.locator('main h1')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.locator('.sidebar')).toHaveClass(/is-open/);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Market overview' })).toBeVisible();
});

test('dialogs close with Escape and return focus to their launcher', async ({ page }) => {
  const launcher = page.getByRole('button', { name: 'Import data', exact: true });
  await launcher.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(launcher).toBeFocused();
});

test('the dev server accepts the proxied preview hostname', async ({ request }) => {
  const response = await request.get('/', { headers: { host: '5173-vector-test.e2b.app' } });
  expect(response.status()).toBe(200);
});

test('calendar-month CSVs stay monthly without fabricating lower-timeframe candles', async ({
  page,
}) => {
  const monthly =
    'timestamp,open,high,low,close,volume\n' +
    Array.from(
      { length: 60 },
      (_, i) => `${new Date(Date.UTC(2020, i, 1)).toISOString()},100,102,99,101,100`,
    ).join('\n');
  await page.getByRole('button', { name: 'Import data', exact: true }).click();
  await page.getByLabel('OHLCV CSV file').setInputFiles({
    name: 'monthly-history.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(monthly),
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '1M', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: '1H', exact: true })).toBeDisabled();
  await expect(page.locator('.price-chart svg')).toHaveAttribute('aria-label', /1mo/);
});
