import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures';
import { cryptoBars, cryptoTicker, FIXTURE_NOW } from '../fixtures/live';
import { LIVE_TIMEFRAMES } from '../../src/extension/catalog';
import type { Page } from '@playwright/test';
import type { PaperPrediction } from '../../src/extension/types';

// Fixture-only forward paths; never bundled as market prices or performance claims.
async function exportRecords(page: Page): Promise<{
  records: PaperPrediction[];
  stats: { winRate: number | null; wins: number; losses: number };
}> {
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export all predictions', exact: true }).click();
  const download = await waiting;
  return JSON.parse(await readFile((await download.path())!, 'utf8'));
}
async function setup(
  page: Page,
  options: { flat?: boolean; stale?: boolean; both?: boolean } = {},
) {
  let now = FIXTURE_NOW + 30_000,
    saved: PaperPrediction | null = null;
  await page.clock.setFixedTime(new Date(now));
  await page.route('https://data-api.binance.vision/**', async (route) => {
    const url = new URL(route.request().url()),
      params = url.searchParams;
    if (params.has('startTime')) {
      const from = Number(params.get('startTime')),
        end = Number(params.get('endTime')) + 1,
        p = saved!;
      const bars = Array.from({ length: Math.min(500, (end - from) / 60_000) }, (_, i) => {
        const time = from + i * 60_000,
          first = time < p.createdAt;
        return [
          time,
          String(p.entry),
          String(first ? p.entry + 0.01 : p.target! + 0.1),
          String(options.both && !first ? p.stop! - 0.1 : p.entry - 0.01),
          String(p.entry),
          '0',
          time + 59_999,
        ];
      });
      await route.fulfill({ json: bars });
      return;
    }
    const tf = LIVE_TIMEFRAMES.find((t) => t.binance === params.get('interval'))?.id ?? '1h';
    const bars = cryptoBars(now, tf).map((row) =>
      options.flat ? [row[0], '100', '100.1', '99.9', '100', '0', row[6]] : row,
    );
    await route.fulfill({
      json: url.pathname.endsWith('ticker/24hr')
        ? {
            ...cryptoTicker(now - (options.stale ? 60_000 : 0), params.get('symbol')!),
            ...(options.flat ? { lastPrice: '100' } : {}),
          }
        : bars,
    });
  });
  await page.goto('/panel.html');
  await page.getByRole('button', { name: 'Connect public crypto feed', exact: true }).click();
  await expect(page.locator('.ex-live-quote')).toBeVisible();
  await page.getByRole('button', { name: /Page → BUY \/ SELL \/ WAIT/ }).click();
  return {
    setRecord: (p: PaperPrediction) => {
      saved = p;
    },
    advance: async () => {
      now = FIXTURE_NOW + 2 * 60_000;
      await page.clock.setFixedTime(new Date(now));
    },
  };
}

test('records a forward paper call only after confirmation, rejects hindsight replacement, scores later prices and exports all fields', async ({
  page,
}) => {
  const fixture = await setup(page),
    button = page.getByRole('button', { name: 'Record BUY prediction', exact: true });
  await expect(button).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Analyze current chart page', exact: true }),
  ).toBeDisabled();
  await expect(page.getByText('Preview records last only in this tab.')).toBeVisible();
  await page
    .getByLabel('I confirm this market/timeframe and understand these are paper results.')
    .check();
  await button.click();
  await expect(page.locator('.ex-outcome')).toHaveText('PENDING');
  const before = await exportRecords(page);
  expect(before.stats.winRate).toBeNull();
  expect(before.records).toHaveLength(1);
  expect(before.records[0]).toMatchObject({
    status: 'pending',
    action: 'BUY',
    createdAt: FIXTURE_NOW + 30_000,
    accountCurrency: 'USDT',
    feeBps: 10,
    outcome: null,
  });
  expect(JSON.stringify(before)).not.toMatch(/forexKey|apikey/i);
  fixture.setRecord(before.records[0]);
  await button.click();
  await expect(page.locator('.ex-forward [role="alert"]')).toContainText(
    'One prediction per market/timeframe/expiry',
  );
  await expect(page.locator('.ex-forward-row')).toHaveCount(1);
  await fixture.advance();
  await page.getByRole('button', { name: 'Check outcomes', exact: true }).click();
  await expect(page.locator('.ex-outcome')).toHaveText('WIN');
  const after = await exportRecords(page);
  expect(after.stats).toMatchObject({ winRate: 100, wins: 1, losses: 0 });
  expect(after.records[0].outcome?.netPnl).toBeGreaterThan(0);
  for (const key of [
    'id',
    'createdAt',
    'entryAsOf',
    'basisClosedAt',
    'entry',
    'stop',
    'target',
    'expiresAt',
    'feeBps',
    'notional',
  ] as const)
    expect(after.records[0][key]).toEqual(before.records[0][key]);
  await page.reload();
  await page.getByRole('button', { name: /Page → BUY \/ SELL \/ WAIT/ }).click();
  await expect(page.locator('.ex-forward-row')).toHaveCount(0);
  await expect(page.getByText('No forward calls recorded yet.', { exact: false })).toBeVisible();
});
test('both-level future bars remain ambiguous and do not produce a manufactured win or P&L', async ({
  page,
}) => {
  const fixture = await setup(page, { both: true });
  await page
    .getByLabel('I confirm this market/timeframe and understand these are paper results.')
    .check();
  await page.getByRole('button', { name: 'Record BUY prediction', exact: true }).click();
  const before = await exportRecords(page);
  fixture.setRecord(before.records[0]);
  await fixture.advance();
  await page.getByRole('button', { name: 'Check outcomes', exact: true }).click();
  await expect(page.locator('.ex-outcome')).toHaveText('AMBIGUOUS');
  await expect(page.locator('.ex-forward-row')).toContainText(
    'Both levels in one minute; order unknown',
  );
  const after = await exportRecords(page);
  expect(after.stats.winRate).toBeNull();
  expect(after.stats.wins).toBe(0);
  expect(after.records[0].outcome?.netPnl).toBeNull();
});
test('WAIT is recorded as an abstention, not a guessed trade or an accuracy win', async ({
  page,
}) => {
  await setup(page, { flat: true });
  await page
    .getByLabel('I confirm this market/timeframe and understand these are paper results.')
    .check();
  await page.getByRole('button', { name: 'Record WAIT prediction', exact: true }).click();
  await expect(page.locator('.ex-outcome')).toHaveText('WAIT');
  const result = await exportRecords(page);
  expect(result.records[0]).toMatchObject({
    action: 'WAIT',
    status: 'abstained',
    notional: 0,
    units: 0,
    stop: null,
    target: null,
  });
  expect(result.stats.winRate).toBeNull();
  await expect(page.getByRole('button', { name: 'Check outcomes', exact: true })).toBeDisabled();
});
test('stale entry data cannot create a forward prediction, even if the old snapshot is visible', async ({
  page,
}) => {
  await setup(page, { stale: true });
  await page
    .getByLabel('I confirm this market/timeframe and understand these are paper results.')
    .check();
  await page.getByRole('button', { name: 'Record BUY prediction', exact: true }).click();
  await expect(page.locator('.ex-forward [role="alert"]')).toContainText('at most 30s old');
  await expect(page.locator('.ex-forward-row')).toHaveCount(0);
});
test('changing the market resets confirmation, and only whole-ledger clearing is offered', async ({
  page,
}) => {
  await setup(page);
  await page
    .getByLabel('I confirm this market/timeframe and understand these are paper results.')
    .check();
  await page.getByRole('button', { name: 'Record BUY prediction', exact: true }).click();
  await page.getByRole('combobox', { name: 'Choose live market' }).selectOption('ETHUSDT');
  await expect(
    page.getByLabel('I confirm this market/timeframe and understand these are paper results.'),
  ).not.toBeChecked();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Clear entire prediction ledger', exact: true }).click();
  await expect(page.locator('.ex-forward-row')).toHaveCount(0);
  await expect(page.locator('.ex-forward [role="status"]')).toContainText('Entire ledger cleared');
});
test('expanded prediction workflow has no horizontal overflow in a narrow side panel', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await setup(page);
  await page
    .getByLabel('I confirm this market/timeframe and understand these are paper results.')
    .check();
  await page.getByRole('button', { name: 'Record BUY prediction', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
