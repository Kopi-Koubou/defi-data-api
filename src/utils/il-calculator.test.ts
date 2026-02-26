/**
 * Tests for Impermanent Loss Calculator
 */

import { describe, it, expect } from 'vitest';
import { calculateImpermanentLoss, simulateILScenarios } from './il-calculator.js';

describe('calculateImpermanentLoss', () => {
  it('should calculate IL correctly when price doubles', () => {
    const result = calculateImpermanentLoss({
      token0: 'ETH',
      token1: 'USDC',
      entryPriceRatio: 2000,
      currentPriceRatio: 4000,
    });

    // When price doubles (r=2), IL ≈ -5.72%
    expect(result.ilPercentage).toBeCloseTo(-5.72, 1);
    expect(result.token0).toBe('ETH');
    expect(result.token1).toBe('USDC');
  });

  it('should calculate IL correctly when price halves', () => {
    const result = calculateImpermanentLoss({
      token0: 'ETH',
      token1: 'USDC',
      entryPriceRatio: 2000,
      currentPriceRatio: 1000,
    });

    // When price halves (r=0.5), IL ≈ -5.72%
    expect(result.ilPercentage).toBeCloseTo(-5.72, 1);
  });

  it('should return 0 IL when price unchanged', () => {
    const result = calculateImpermanentLoss({
      token0: 'ETH',
      token1: 'USDC',
      entryPriceRatio: 2000,
      currentPriceRatio: 2000,
    });

    expect(result.ilPercentage).toBe(0);
  });
});

describe('simulateILScenarios', () => {
  it('should simulate multiple price scenarios', () => {
    const scenarios = simulateILScenarios(
      {
        token0: 'ETH',
        token1: 'USDC',
        entryPriceRatio: 2000,
      },
      [-0.5, 0, 0.5, 1] // -50%, 0%, +50%, +100%
    );

    expect(scenarios).toHaveLength(4);
    expect(scenarios[0].priceChangePercent).toBe(-50);
    expect(scenarios[1].priceChangePercent).toBe(0);
    expect(scenarios[2].priceChangePercent).toBe(50);
    expect(scenarios[3].priceChangePercent).toBe(100);
  });
});
