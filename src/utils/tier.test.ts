import { describe, expect, it } from 'vitest';

import {
  buildHistoryLimitMessage,
  getDefaultHistoryLookbackDays,
  getHistoryLookbackDays,
  getWebhookLimit,
  hasAdvancedIlAccess,
  hasRiskAccess,
  isDateWithinHistoryWindow,
  resolveApiTier,
} from './tier.js';

describe('tier utils', () => {
  it('normalizes unknown tiers to free', () => {
    expect(resolveApiTier(undefined)).toBe('free');
    expect(resolveApiTier('custom-tier')).toBe('free');
    expect(resolveApiTier('builder')).toBe('builder');
  });

  it('returns tier lookback windows', () => {
    expect(getHistoryLookbackDays('free')).toBe(7);
    expect(getHistoryLookbackDays('builder')).toBe(90);
    expect(getHistoryLookbackDays('pro')).toBeNull();
    expect(getHistoryLookbackDays('enterprise')).toBeNull();
  });

  it('caps default lookback by tier allowance', () => {
    expect(getDefaultHistoryLookbackDays(90, 'free')).toBe(7);
    expect(getDefaultHistoryLookbackDays(30, 'builder')).toBe(30);
    expect(getDefaultHistoryLookbackDays(365, 'builder')).toBe(90);
    expect(getDefaultHistoryLookbackDays(365, 'pro')).toBe(365);
  });

  it('checks if a date falls within tier history window', () => {
    const now = new Date('2026-03-04T00:00:00.000Z');
    expect(isDateWithinHistoryWindow(new Date('2026-02-28T00:00:00.000Z'), 'free', now)).toBe(
      true
    );
    expect(isDateWithinHistoryWindow(new Date('2026-02-20T00:00:00.000Z'), 'free', now)).toBe(
      false
    );
    expect(isDateWithinHistoryWindow(new Date('2025-01-01T00:00:00.000Z'), 'pro', now)).toBe(
      true
    );
  });

  it('builds user-facing history limit messages', () => {
    expect(buildHistoryLimitMessage('free')).toContain('7 days');
    expect(buildHistoryLimitMessage('builder')).toContain('90 days');
  });

  it('returns webhook limits by tier', () => {
    expect(getWebhookLimit('free')).toBe(0);
    expect(getWebhookLimit('builder')).toBe(5);
    expect(getWebhookLimit('pro')).toBe(50);
    expect(getWebhookLimit('enterprise')).toBeNull();
  });

  it('grants advanced analytics and tools access for paid tiers only', () => {
    expect(hasRiskAccess('free')).toBe(false);
    expect(hasRiskAccess('builder')).toBe(true);
    expect(hasAdvancedIlAccess('free')).toBe(false);
    expect(hasAdvancedIlAccess('pro')).toBe(true);
  });
});
