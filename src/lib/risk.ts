export interface PositionSize {
  units: number;
  riskBudget: number;
  actualRisk: number;
  notional: number;
  reward: number;
  rewardRisk: number;
  allocation: number;
  capitalLimited: boolean;
  valid: boolean;
}

/** A fixed quote-to-USD rate, or 'USDJPY' for conversion at each exit reference. */
export function positionSize(
  capital: number,
  riskPercent: number,
  entry: number,
  stop: number,
  target: number,
  feeBps = 10,
  quoteToUSD: number | 'USDJPY' = 1,
): PositionSize {
  const empty: PositionSize = {
    units: 0,
    riskBudget: 0,
    actualRisk: 0,
    notional: 0,
    reward: 0,
    rewardRisk: 0,
    allocation: 0,
    capitalLimited: false,
    valid: false,
  };
  const rateAtEntry = quoteToUSD === 'USDJPY' ? 1 / entry : quoteToUSD;
  const rateAtStop = quoteToUSD === 'USDJPY' ? 1 / stop : quoteToUSD;
  const rateAtTarget = quoteToUSD === 'USDJPY' ? 1 / target : quoteToUSD;
  if (
    ![
      capital,
      riskPercent,
      entry,
      stop,
      target,
      feeBps,
      rateAtEntry,
      rateAtStop,
      rateAtTarget,
    ].every(Number.isFinite) ||
    capital <= 0 ||
    entry <= 0 ||
    stop <= 0 ||
    target <= 0 ||
    riskPercent <= 0 ||
    riskPercent > 5 ||
    feeBps < 0 ||
    feeBps > 100 ||
    rateAtEntry <= 0 ||
    entry === stop
  )
    return empty;
  const sign = Math.sign(entry - stop);
  if ((target - entry) * sign <= 0) return empty;
  const feesAtStop = ((entry * rateAtEntry + stop * rateAtStop) * feeBps) / 10_000;
  const feesAtTarget = ((entry * rateAtEntry + target * rateAtTarget) * feeBps) / 10_000;
  const lossPerUnit = Math.abs(entry - stop) * rateAtStop + feesAtStop;
  const gainPerUnit = Math.abs(target - entry) * rateAtTarget - feesAtTarget;
  if (gainPerUnit <= 0) return empty;
  const riskBudget = (capital * riskPercent) / 100;
  const riskUnits = riskBudget / lossPerUnit;
  // Reserve estimated opening/closing fees: even the capital cap assumes no leverage.
  const capitalUnits = capital / (entry * rateAtEntry * (1 + (2 * feeBps) / 10_000));
  const units = Math.min(riskUnits, capitalUnits);
  const actualRisk = units * lossPerUnit;
  const reward = units * gainPerUnit;
  const notional = units * entry * rateAtEntry;
  const rewardRisk = reward / actualRisk;
  const allocation = (notional / capital) * 100;
  if (
    ![units, riskBudget, actualRisk, reward, notional, rewardRisk, allocation].every(
      Number.isFinite,
    ) ||
    units <= 0 ||
    actualRisk <= 0
  )
    return empty;
  return {
    units,
    riskBudget,
    actualRisk,
    notional,
    reward,
    rewardRisk,
    allocation,
    capitalLimited: capitalUnits < riskUnits,
    valid: true,
  };
}

export function projectCapital(
  principal: number,
  contribution: number,
  annualReturn: number,
  months: number,
  withdrawal = 0,
): { month: number; value: number }[] {
  if (
    ![principal, contribution, annualReturn, months, withdrawal].every(Number.isFinite) ||
    principal < 0 ||
    contribution < 0 ||
    withdrawal < 0 ||
    months < 0 ||
    annualReturn <= -100
  )
    return [];
  const rate = Math.pow(1 + annualReturn / 100, 1 / 12) - 1;
  const points = [{ month: 0, value: principal }];
  let value = principal;
  for (let month = 1; month <= Math.min(600, Math.floor(months)); month++) {
    value = Math.max(0, value * (1 + rate) + contribution - withdrawal);
    points.push({ month, value });
  }
  return points;
}
