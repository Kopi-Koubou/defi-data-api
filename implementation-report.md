# Implementation Report

## Summary
- Read `PRD.md` before coding and confirmed `design-spec.md` and `tech-spec.md` are not present in the repository.
- Implemented tier-entitlement policies from the current product scope:
  - Added shared tier policy utilities for `free`, `builder`, `pro`, and `enterprise`.
  - Enforced free-tier IL restrictions:
    - Free can use basic single-pair IL only.
    - Batch IL simulation and fee-adjusted IL are paid-tier only.
  - Enforced historical data lookback limits across historical endpoints:
    - Free: 7 days
    - Builder: 90 days
    - Pro/Enterprise: unlimited (endpoint defaults still applied where relevant).
  - Enforced risk endpoint access for paid tiers only.
  - Enforced webhook active-subscription caps:
    - Builder: 5
    - Pro: 50
    - Enterprise: unlimited
- Added tests for tier utility behavior and expanded tools route tests for tier-gated IL behavior.
- Executed work in small commits with test/build validation after each implementation step.

## Changed Files
- `src/utils/tier.ts`
- `src/utils/tier.test.ts`
- `src/routes/tools.ts`
- `src/routes/tools.test.ts`
- `src/routes/yields.ts`
- `src/routes/protocols.ts`
- `src/routes/chains.ts`
- `src/routes/tokens.ts`
- `src/routes/pools.ts`
- `src/routes/webhooks.ts`
- `implementation-report.md`

## Tests Run
- After commit `feat(tiers): add shared entitlement policy utilities`:
  - `npm test` -> pass (`9` files, `38` tests)
  - `npm run build` -> pass
- After commit `feat(tools): enforce free-tier IL access limits`:
  - `npm test` -> pass (`9` files, `40` tests)
  - `npm run build` -> pass
- After commit `feat(api): enforce tier limits on history, risk, and webhooks`:
  - `npm test` -> pass (`9` files, `40` tests)
  - `npm run build` -> pass

## Known Risks
- `design-spec.md` and `tech-spec.md` are still missing, so this implementation used `PRD.md` plus current repository behavior as the source of truth.
- The new history/risk/webhook entitlement paths are covered by compile/test passes but do not yet have dedicated DB-backed integration tests for all endpoints.
- Webhook cap enforcement is implemented per `userId` active subscriptions; if the intended cap should be scoped differently (for example per API key), this should be clarified.

## Next Steps
1. Add integration tests (with seeded DB fixtures) for historical endpoints, risk endpoints, and webhook cap enforcement.
2. Enforce the free-tier chain access constraint (`ETH + 2 chains`) if that remains in-scope for the current release.
3. Restore `design-spec.md` and `tech-spec.md` so future implementation scope decisions are unambiguous.
