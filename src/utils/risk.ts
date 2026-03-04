import type { AuditStatus, PoolType } from '../types/index.js';

export interface RiskScoreFactors {
  smartContractRisk: number;
  impermanentLossRisk: number;
  liquidityDepth: number;
  protocolMaturity: number;
}

export interface HeuristicRiskInput {
  auditStatus: AuditStatus;
  poolType: PoolType;
  poolTvlUsd: number;
  protocolTvlUsd: number;
  hasTokenPair: boolean;
}

export interface HeuristicRiskScore {
  score: number;
  factors: RiskScoreFactors;
}

const FACTOR_WEIGHTS = {
  smartContractRisk: 0.35,
  impermanentLossRisk: 0.2,
  liquidityDepth: 0.25,
  protocolMaturity: 0.2,
} as const;

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreFromAuditStatus(status: AuditStatus): number {
  switch (status) {
    case 'audited':
      return 90;
    case 'partial':
      return 72;
    case 'unaudited':
      return 45;
    case 'unknown':
    default:
      return 58;
  }
}

function scoreFromPoolType(poolType: PoolType, hasTokenPair: boolean): number {
  if (poolType === 'lp' && hasTokenPair) {
    return 55;
  }

  switch (poolType) {
    case 'lending':
      return 80;
    case 'staking':
      return 85;
    case 'vault':
      return 72;
    case 'restaking':
      return 68;
    case 'lp':
    default:
      return 62;
  }
}

function scoreFromLiquidity(tvlUsd: number): number {
  if (tvlUsd >= 100_000_000) {
    return 95;
  }
  if (tvlUsd >= 10_000_000) {
    return 86;
  }
  if (tvlUsd >= 1_000_000) {
    return 72;
  }
  if (tvlUsd >= 100_000) {
    return 58;
  }

  return 42;
}

function scoreFromProtocolMaturity(protocolTvlUsd: number): number {
  if (protocolTvlUsd >= 10_000_000_000) {
    return 95;
  }
  if (protocolTvlUsd >= 1_000_000_000) {
    return 86;
  }
  if (protocolTvlUsd >= 100_000_000) {
    return 73;
  }
  if (protocolTvlUsd >= 10_000_000) {
    return 58;
  }

  return 40;
}

export function computeHeuristicRiskScore(input: HeuristicRiskInput): HeuristicRiskScore {
  const factors: RiskScoreFactors = {
    smartContractRisk: scoreFromAuditStatus(input.auditStatus),
    impermanentLossRisk: scoreFromPoolType(input.poolType, input.hasTokenPair),
    liquidityDepth: scoreFromLiquidity(Math.max(0, input.poolTvlUsd)),
    protocolMaturity: scoreFromProtocolMaturity(Math.max(0, input.protocolTvlUsd)),
  };

  const weightedScore =
    factors.smartContractRisk * FACTOR_WEIGHTS.smartContractRisk +
    factors.impermanentLossRisk * FACTOR_WEIGHTS.impermanentLossRisk +
    factors.liquidityDepth * FACTOR_WEIGHTS.liquidityDepth +
    factors.protocolMaturity * FACTOR_WEIGHTS.protocolMaturity;

  return {
    score: clampScore(weightedScore),
    factors,
  };
}

export function calculateRiskAdjustedApy(apyTotal: number, riskScore: number): number {
  const safeApy = Number.isFinite(apyTotal) ? apyTotal : 0;
  const safeScore = Math.max(0, Math.min(100, Number.isFinite(riskScore) ? riskScore : 0));
  return Number((safeApy * (safeScore / 100)).toFixed(4));
}

export function calculateSharpeLikeMetric(
  apyTotal: number,
  apyVolatility: number | null,
  riskScore: number
): number {
  const adjustedApy = calculateRiskAdjustedApy(apyTotal, riskScore);
  const safeVolatility =
    apyVolatility !== null && Number.isFinite(apyVolatility) && apyVolatility > 0
      ? apyVolatility
      : 1;

  return Number((adjustedApy / safeVolatility).toFixed(4));
}
