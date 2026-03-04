/**
 * Tests for Impermanent Loss Calculator
 */

import { describe, it, expect } from 'vitest';
import {
  InvalidImpermanentLossInputError,
  calculateILWithFees,
  calculateImpermanentLoss,
  simulateILScenarios,
  simulateILScenariosWithFees,
} from './il-calculator.js';

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

  it('throws for invalid ratios', () => {
    expect(() =>
      calculateImpermanentLoss({
        token0: 'ETH',
        token1: 'USDC',
        entryPriceRatio: 2000,
        currentPriceRatio: 0,
      })
    ).toThrowError(InvalidImpermanentLossInputError);
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

  it('throws when scenario implies a non-positive price ratio', () => {
    expect(() =>
      simulateILScenarios(
        {
          token0: 'ETH',
          token1: 'USDC',
          entryPriceRatio: 2000,
        },
        [-1]
      )
    ).toThrowError(InvalidImpermanentLossInputError);
  });
});

describe('calculateILWithFees', () => {
  it('should include fee income and net return', () => {
    const result = calculateILWithFees(
      {
        token0: 'ETH',
        token1: 'USDC',
        entryPriceRatio: 2000,
        currentPriceRatio: 4000,
      },
      20,
      30
    );

    expect(result.ilPercentage).toBeCloseTo(-5.7191, 4);
    expect(result.feeIncomePercentage).toBeCloseTo(1.6438, 4);
    expect(result.netReturnPercentage).toBeCloseTo(-4.0753, 4);
  });

  it('throws for invalid fee inputs', () => {
    expect(() =>
      calculateILWithFees(
        {
          token0: 'ETH',
          token1: 'USDC',
          entryPriceRatio: 2000,
          currentPriceRatio: 2500,
        },
        -1,
        30
      )
    ).toThrowError(InvalidImpermanentLossInputError);
  });
});

describe('simulateILScenariosWithFees', () => {
  it('should simulate scenarios with fee-adjusted metrics', () => {
    const scenarios = simulateILScenariosWithFees(
      {
        token0: 'ETH',
        token1: 'USDC',
        entryPriceRatio: 2000,
      },
      [-0.5, 0, 0.5],
      12,
      30
    );

    expect(scenarios).toHaveLength(3);
    expect(scenarios[0].priceChangePercent).toBe(-50);
    expect(scenarios[1].ilPercentage).toBe(0);
    expect(scenarios[2].feeIncomePercentage).toBeCloseTo(0.9863, 4);
    expect(scenarios[2].netReturnPercentage).toBeCloseTo(-1.0341, 4);
  });

  it('throws for invalid scenario changes', () => {
    expect(() =>
      simulateILScenariosWithFees(
        {
          token0: 'ETH',
          token1: 'USDC',
          entryPriceRatio: 2000,
        },
        [-1.5],
        12,
        30
      )
    ).toThrowError(InvalidImpermanentLossInputError);
  });
});
