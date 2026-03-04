import type { ApiTier } from '../types/index.js';

const HISTORY_LOOKBACK_DAYS: Record<ApiTier, number | null> = {
  free: 7,
  builder: 90,
  pro: null,
  enterprise: null,
};

const WEBHOOK_LIMITS: Record<ApiTier, number | null> = {
  free: 0,
  builder: 5,
  pro: 50,
  enterprise: null,
};

export function resolveApiTier(tier: string | undefined): ApiTier {
  switch (tier) {
    case 'builder':
    case 'pro':
    case 'enterprise':
      return tier;
    case 'free':
    default:
      return 'free';
  }
}

export function getHistoryLookbackDays(tier: string | undefined): number | null {
  return HISTORY_LOOKBACK_DAYS[resolveApiTier(tier)];
}

export function getDefaultHistoryLookbackDays(baseDays: number, tier: string | undefined): number {
  const maxDays = getHistoryLookbackDays(tier);
  if (maxDays === null) {
    return baseDays;
  }

  return Math.min(baseDays, maxDays);
}

export function isDateWithinHistoryWindow(
  from: Date,
  tier: string | undefined,
  now: Date = new Date()
): boolean {
  const maxDays = getHistoryLookbackDays(tier);
  if (maxDays === null) {
    return true;
  }

  const earliestAllowed = new Date(now.getTime() - maxDays * 24 * 60 * 60 * 1000);
  return from >= earliestAllowed;
}

export function buildHistoryLimitMessage(tier: string | undefined): string {
  const resolvedTier = resolveApiTier(tier);
  const maxDays = getHistoryLookbackDays(resolvedTier);
  if (maxDays === null) {
    return 'Historical data access is available';
  }

  return `${resolvedTier} tier supports up to ${maxDays} days of historical data`;
}

export function getWebhookLimit(tier: string | undefined): number | null {
  return WEBHOOK_LIMITS[resolveApiTier(tier)];
}

export function hasRiskAccess(tier: string | undefined): boolean {
  return resolveApiTier(tier) !== 'free';
}

export function hasAdvancedIlAccess(tier: string | undefined): boolean {
  return resolveApiTier(tier) !== 'free';
}
