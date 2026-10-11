import { describe, expect, it, vi } from 'vitest';
import { FIXTURE_NOW, forexBars } from '../../tests/fixtures/live';
import { MINUTE } from './predictions';
import { fetchOutcomeBars } from './prediction-feed';
const from = FIXTURE_NOW - 10 * MINUTE;
const row = (time: number) => [time, '100', '101', '99', '100', '0', time + MINUTE - 1];
describe('bounded reference-history outcome requests', () => {
  it('requests Binance 1m historical windows rather than latest analysis bars, omitting cookies and referrers', async () => {
    const network = vi.fn(
      async () => new Response(JSON.stringify([row(from), row(from + MINUTE)])),
    );
    const bars = await fetchOutcomeBars('BTCUSDT', from, FIXTURE_NOW, {
      fetcher: network,
      now: () => FIXTURE_NOW,
    });
    const [url, init] = network.mock.calls[0] as unknown as [string, RequestInit];
    const params = new URL(url).searchParams;
    expect(params.get('interval')).toBe('1m');
    expect(params.get('startTime')).toBe(String(from));
    expect(params.get('endTime')).toBe(String(FIXTURE_NOW - 1));
    expect(params.get('limit')).toBe('500');
    expect(init).toMatchObject({
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
    expect(bars.map((c) => c.time)).toEqual([from, from + MINUTE]);
  });
  it('caps long backlogs to 500 minutes and never includes a forming minute or pre-entry history', async () => {
    const now = from + 1000 * MINUTE,
      network = vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              row(from - MINUTE),
              row(from),
              row(from + 499 * MINUTE),
              row(from + 500 * MINUTE),
              row(now),
            ]),
          ),
      );
    const bars = await fetchOutcomeBars('BTCUSDT', from, now + 10 * MINUTE, {
      fetcher: network,
      now: () => now,
    });
    expect(bars.map((c) => c.time)).toEqual([from, from + 499 * MINUTE]);
    expect(
      new URL((network.mock.calls[0] as unknown as [string])[0]).searchParams.get('endTime'),
    ).toBe(String(from + 500 * MINUTE - 1));
  });
  it('does not query before a future minute closes', async () => {
    const network = vi.fn();
    expect(
      await fetchOutcomeBars('BTCUSDT', FIXTURE_NOW, FIXTURE_NOW + MINUTE, {
        fetcher: network,
        now: () => FIXTURE_NOW + 30_000,
      }),
    ).toEqual([]);
    expect(network).not.toHaveBeenCalled();
  });
  it('requires a private forex key, uses UTC date ranges and shares one HTTP-request reservation', async () => {
    const network = vi.fn(
        async () => new Response(JSON.stringify(forexBars(FIXTURE_NOW, '1m', 'EUR/USD', 10))),
      ),
      reserve = vi.fn(async () => undefined);
    await expect(
      fetchOutcomeBars('EURUSD', from, FIXTURE_NOW, { fetcher: network, now: () => FIXTURE_NOW }),
    ).rejects.toThrow(/key/);
    expect(network).not.toHaveBeenCalled();
    const bars = await fetchOutcomeBars('EURUSD', from, FIXTURE_NOW, {
      fetcher: network,
      forexKey: 'fixture-private-only',
      reserveForex: reserve,
      now: () => FIXTURE_NOW,
    });
    expect(reserve).toHaveBeenCalledWith(1);
    expect(bars).toHaveLength(10);
    const p = new URL((network.mock.calls[0] as unknown as [string])[0]).searchParams;
    expect(p.get('interval')).toBe('1min');
    expect(p.get('timezone')).toBe('UTC');
    expect(p.get('start_date')).toBe('2026-10-10 12:20:00');
    expect(p.get('end_date')).toBe('2026-10-10 12:29:59');
  });
  it('redacts keys from provider failures and rejects invalid windows', async () => {
    const key = 'fixture-private-only',
      network = vi.fn(
        async () =>
          new Response(JSON.stringify({ status: 'error', code: 401, message: `apikey=${key}` })),
      );
    await expect(
      fetchOutcomeBars('EURUSD', from, FIXTURE_NOW, {
        fetcher: network,
        forexKey: key,
        now: () => FIXTURE_NOW,
      }),
    ).rejects.not.toThrow(key);
    await expect(
      fetchOutcomeBars('BTCUSDT', from + 1, FIXTURE_NOW, { fetcher: network }),
    ).rejects.toThrow(/window/);
  });
});
