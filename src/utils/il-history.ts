import { calculateImpermanentLoss } from './il-calculator.js';

export interface TokenPricePoint {
  timestamp: Date;
  token0PriceUsd: number;
  token1PriceUsd: number;
}

export interface IlHistoryPoint {
  timestamp: Date;
  token0PriceUsd: number;
  token1PriceUsd: number;
  priceRatio: number;
  ilPercentage: number;
  ilVsHoldPercentage: number;
  holdValueIndex: number;
  lpValueIndex: number;
}

export interface IlHistorySeries {
  entryPriceRatio: number | null;
  points: IlHistoryPoint[];
}

function round(value: number, precision: number): number {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

export function buildIlHistorySeries(
  token0: string,
  token1: string,
  pricePoints: TokenPricePoint[]
): IlHistorySeries {
  const validPoints = pricePoints
    .filter(
      (point) =>
        Number.isFinite(point.token0PriceUsd) &&
        Number.isFinite(point.token1PriceUsd) &&
        point.token0PriceUsd > 0 &&
        point.token1PriceUsd > 0
    )
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  if (validPoints.length === 0) {
    return {
      entryPriceRatio: null,
      points: [],
    };
  }

  const entryPriceRatio = validPoints[0].token0PriceUsd / validPoints[0].token1PriceUsd;

  const points: IlHistoryPoint[] = validPoints.map((point) => {
    const currentPriceRatio = point.token0PriceUsd / point.token1PriceUsd;
    const relativeRatio = currentPriceRatio / entryPriceRatio;
    const il = calculateImpermanentLoss({
      token0,
      token1,
      entryPriceRatio,
      currentPriceRatio,
    });

    return {
      timestamp: point.timestamp,
      token0PriceUsd: round(point.token0PriceUsd, 6),
      token1PriceUsd: round(point.token1PriceUsd, 6),
      priceRatio: round(currentPriceRatio, 6),
      ilPercentage: il.ilPercentage,
      ilVsHoldPercentage: il.ilVsHoldPercentage,
      holdValueIndex: round((1 + relativeRatio) / 2, 6),
      lpValueIndex: round(Math.sqrt(relativeRatio), 6),
    };
  });

  return {
    entryPriceRatio: round(entryPriceRatio, 6),
    points,
  };
}
