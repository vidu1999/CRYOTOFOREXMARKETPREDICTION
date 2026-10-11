import { describe, expect, it } from 'vitest';
import { positionSize, projectCapital } from './risk';

describe('conservative USD account sizing', () => {
  it('keeps modeled loss within the risk budget including fees', () => {
    const size = positionSize(10_000, 1, 100, 95, 110, 10);
    expect(size.valid).toBe(true);
    expect(size.riskBudget).toBe(100);
    expect(size.actualRisk).toBeLessThanOrEqual(100.0000001);
    expect(size.rewardRisk).toBeLessThan(2);
    expect(size.notional).toBeLessThanOrEqual(10_000);
  });
  it('caps position size at capital without adding leverage', () => {
    const size = positionSize(1000, 1, 100, 99.99, 110, 0);
    expect(size.capitalLimited).toBe(true);
    expect(size.units).toBe(10);
    expect(size.actualRisk).toBeLessThan(size.riskBudget);
  });
  it('sizes hypothetical bearish setups as well as bullish ones', () => {
    const size = positionSize(10_000, 1, 100, 105, 90, 0);
    expect(size.valid).toBe(true);
    expect(size.rewardRisk).toBe(2);
  });
  it('converts JPY quote risk to USD for a USDJPY position', () => {
    const size = positionSize(10_000, 1, 150, 149, 152, 0, 1 / 150);
    expect(size.valid).toBe(true);
    expect(size.notional).toBeLessThanOrEqual(10_000);
    expect(size.units).toBeCloseTo(size.notional, 8);
  });
  it('rejects invalid setups and risk over five percent', () => {
    expect(positionSize(1000, 6, 100, 95, 110).valid).toBe(false);
    expect(positionSize(0, 1, 100, 95, 110).valid).toBe(false);
    expect(positionSize(1000, 1, 100, 100, 110).valid).toBe(false);
    expect(positionSize(1000, 1, 100, 95, 90).valid).toBe(false);
    expect(positionSize(1000, 1, NaN, 95, 110).valid).toBe(false);
    expect(positionSize(1000, 1, 100, 99, 100.1, 100).valid).toBe(false);
  });
});

describe('explicitly hypothetical cashflow projection', () => {
  it('handles zero return without division by zero', () => {
    const points = projectCapital(1000, 100, 0, 12, 50);
    expect(points.at(-1)!.value).toBe(1600);
  });
  it('compounds an annual assumption into twelve monthly periods', () => {
    expect(projectCapital(1000, 0, 6, 12).at(-1)!.value).toBeCloseTo(1060, 8);
  });
  it('allows a negative-return scenario and never produces negative capital', () => {
    expect(projectCapital(1000, 0, -15, 12).at(-1)!.value).toBeCloseTo(850, 8);
    expect(projectCapital(1000, 0, 0, 12, 200).at(-1)!.value).toBe(0);
  });
  it('bounds excessive horizons and rejects invalid assumptions', () => {
    expect(projectCapital(1000, 0, 6, 9999)).toHaveLength(601);
    expect(projectCapital(-100, 0, 6, 12)).toEqual([]);
    expect(projectCapital(100, 0, -100, 12)).toEqual([]);
    expect(projectCapital(100, 0, NaN, 12)).toEqual([]);
  });
});

it('converts USDJPY stop and target P&L at their respective exit reference rates', () => {
  const size = positionSize(1_000_000, 0.1, 150, 149, 152, 0, 'USDJPY');
  expect(size.valid).toBe(true);
  expect(size.units).toBeCloseTo(149_000, 6);
  expect(size.actualRisk).toBeCloseTo(1000, 8);
  expect(size.reward).toBeCloseTo((149_000 * 2) / 152, 8);
  expect(size.notional).toBeCloseTo(size.units, 8);
});

it('rejects finite inputs whose sizing arithmetic overflows instead of promising infinite reward', () => {
  expect(positionSize(1000, 1, 100, 99, 1e308, 0).valid).toBe(false);
});
