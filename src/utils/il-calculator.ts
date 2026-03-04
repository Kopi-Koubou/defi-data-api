/**
 * Impermanent Loss Calculator
 * 
 * IL formula: IL = 2 * sqrt(r) / (1 + r) - 1
 * where r = current_price_ratio / entry_price_ratio
 */

import type { ImpermanentLossInput, ImpermanentLossResult } from '../types/index.js';

export class InvalidImpermanentLossInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidImpermanentLossInputError';
  }
}

function assertFinitePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new InvalidImpermanentLossInputError(`${name} must be a finite number greater than 0`);
  }
}

function assertFiniteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new InvalidImpermanentLossInputError(`${name} must be a finite number greater than or equal to 0`);
  }
}

function assertFiniteIntegerPositive(name: string, value: number): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new InvalidImpermanentLossInputError(`${name} must be a positive integer`);
  }
}

export function calculateImpermanentLoss(
  input: ImpermanentLossInput
): ImpermanentLossResult {
  const { token0, token1, entryPriceRatio, currentPriceRatio } = input;

  assertFinitePositive('entryPriceRatio', entryPriceRatio);
  assertFinitePositive('currentPriceRatio', currentPriceRatio);
  
  // Price ratio change factor
  const r = currentPriceRatio / entryPriceRatio;
  
  // Impermanent loss formula: IL = 2*sqrt(r)/(1+r) - 1
  const ilRatio = (2 * Math.sqrt(r)) / (1 + r) - 1;
  const ilPercentage = ilRatio * 100;
  
  // IL vs holding: if you just held instead of LP
  // Holding return = (1 + r) / 2 - 1 = (r - 1) / 2
  const holdingReturn = (r - 1) / 2;
  const lpReturn = holdingReturn + ilRatio;
  const ilVsHoldPercentage = (lpReturn - holdingReturn) * 100;
  
  return {
    token0,
    token1,
    entryPriceRatio,
    currentPriceRatio,
    ilPercentage: Number(ilPercentage.toFixed(4)),
    ilVsHoldPercentage: Number(ilVsHoldPercentage.toFixed(4)),
  };
}

export function calculateILWithFees(
  input: ImpermanentLossInput,
  feeApr: number,
  days: number
): ImpermanentLossResult & { feeIncomePercentage: number; netReturnPercentage: number } {
  assertFiniteNonNegative('feeApr', feeApr);
  assertFiniteIntegerPositive('days', days);

  const ilResult = calculateImpermanentLoss(input);
  
  // Calculate fee income over the period
  const feeIncomePercentage = (feeApr * days) / 365;
  
  // Net return = fee income - IL
  const netReturnPercentage = feeIncomePercentage + ilResult.ilPercentage;
  
  return {
    ...ilResult,
    feeIncomePercentage: Number(feeIncomePercentage.toFixed(4)),
    netReturnPercentage: Number(netReturnPercentage.toFixed(4)),
  };
}

// Batch simulation for different price scenarios
export function simulateILScenarios(
  baseInput: Omit<ImpermanentLossInput, 'currentPriceRatio'>,
  priceChanges: number[] // percentage changes, e.g., [-0.5, -0.25, 0, 0.25, 0.5]
): Array<ImpermanentLossResult & { priceChangePercent: number }> {
  assertFinitePositive('entryPriceRatio', baseInput.entryPriceRatio);

  return priceChanges.map((change) => {
    if (!Number.isFinite(change) || change <= -1) {
      throw new InvalidImpermanentLossInputError(
        'Each price change must be a finite number greater than -1'
      );
    }

    const currentPriceRatio = baseInput.entryPriceRatio * (1 + change);
    const result = calculateImpermanentLoss({
      ...baseInput,
      currentPriceRatio,
    });
    return {
      ...result,
      priceChangePercent: change * 100,
    };
  });
}

export function simulateILScenariosWithFees(
  baseInput: Omit<ImpermanentLossInput, 'currentPriceRatio'>,
  priceChanges: number[],
  feeApr: number,
  days: number
): Array<
  ImpermanentLossResult & {
    feeIncomePercentage: number;
    netReturnPercentage: number;
    priceChangePercent: number;
  }
> {
  assertFiniteNonNegative('feeApr', feeApr);
  assertFiniteIntegerPositive('days', days);

  return priceChanges.map((change) => {
    if (!Number.isFinite(change) || change <= -1) {
      throw new InvalidImpermanentLossInputError(
        'Each price change must be a finite number greater than -1'
      );
    }

    const currentPriceRatio = baseInput.entryPriceRatio * (1 + change);
    const result = calculateILWithFees(
      {
        ...baseInput,
        currentPriceRatio,
      },
      feeApr,
      days
    );

    return {
      ...result,
      priceChangePercent: change * 100,
    };
  });
}
