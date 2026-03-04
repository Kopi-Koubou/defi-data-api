/**
 * Impermanent Loss Calculator
 * 
 * IL formula: IL = 2 * sqrt(r) / (1 + r) - 1
 * where r = current_price_ratio / entry_price_ratio
 */

import type { ImpermanentLossInput, ImpermanentLossResult } from '../types/index.js';

export function calculateImpermanentLoss(
  input: ImpermanentLossInput
): ImpermanentLossResult {
  const { token0, token1, entryPriceRatio, currentPriceRatio } = input;
  
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
  return priceChanges.map((change) => {
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
  return priceChanges.map((change) => {
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
