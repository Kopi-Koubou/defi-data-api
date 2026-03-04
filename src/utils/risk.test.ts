import { describe, expect, it } from 'vitest';

import {
  calculateRiskAdjustedApy,
  calculateSharpeLikeMetric,
  computeHeuristicRiskScore,
} from './risk.js';

describe('risk utils', () => {
  it('computes higher heuristic scores for mature audited pools', () => {
    const strong = computeHeuristicRiskScore({
      auditStatus: 'audited',
      poolType: 'lending',
      poolTvlUsd: 250_000_000,
      protocolTvlUsd: 12_000_000_000,
      hasTokenPair: false,
    });

    const weak = computeHeuristicRiskScore({
      auditStatus: 'unaudited',
      poolType: 'lp',
      poolTvlUsd: 50_000,
      protocolTvlUsd: 5_000_000,
      hasTokenPair: true,
    });

    expect(strong.score).toBeGreaterThan(weak.score);
    expect(strong.score).toBeGreaterThan(80);
    expect(weak.score).toBeLessThan(60);
  });

  it('scales APY by risk score', () => {
    expect(calculateRiskAdjustedApy(12.5, 80)).toBe(10);
    expect(calculateRiskAdjustedApy(12.5, 0)).toBe(0);
  });

  it('uses fallback volatility when unavailable', () => {
    const metric = calculateSharpeLikeMetric(10, null, 70);
    expect(metric).toBe(7);
  });
});
