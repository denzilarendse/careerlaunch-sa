# CareerLaunch SSRF and authorization hardening — evidence record

- Date: 2026-10-31 (Africa/Johannesburg, UTC+02:00)
- Repository: denzilarendse/careerlaunch-sa
- Isolated branch: security/ssrf-authorization-hardening
- Current PR head at successful CI run: bb8eba1127b724fdc08576d423d42ce361df831e. Relevant helper blob: 7139fd224d7454ad8423b674f678ee3d445abbcd; SSRF test blob: 2dd7b430152d6fab6ab88c9527404b51046841db; patched smoke-test blob: 08a907e49e6263b5685b7501b4058c9db3c2a5d6.
- Runtime: Node.js v22.16.0, npm 10.9.2. GitHub clone was unavailable from this runner because DNS/network access to github.com failed. Focused tests were executed in a local synthetic harness; they were not executed against the live Edge Function.

## Original failure evidence (preserved)
The pre-fix predicate allowed an IPv4-mapped IPv6 loopback hostname. Baseline test result: 1 passed, 1 failed; exit code 1. Exact failure: expected true for blocked hostname, actual false. The raw test output is preserved in `security/evidence/ssrf-baseline-failure.txt`.

## Changes on isolated branch
- Centralized URL validation in `supabase/functions/generate-cv/ssrf-guard.mjs`.
- Rejects IPv6 literals (including IPv4-mapped IPv6), loopback/private/link-local/reserved IPv4 ranges, local-use hostnames, URL credentials, and non-HTTP(S) schemes.
- Applies URL validation to the original vacancy URL and every redirect target.
- Replaced unbounded `response.text()` followed by slicing with a streaming byte limit that cancels the body when it exceeds 1,500,000 bytes.
- Added focused SSRF regression tests and a synthetic two-account authorization policy model test.

## Retest results
- SSRF guard suite: 5 tests passed, 0 failed; `node --test tests/ssrf-guard.test.mjs`.
- Authorization policy model suite: 5 tests passed, 0 failed; `node --test tests/authorization-policy-model.test.mjs`.
- Tests use synthetic data and do not make outbound requests. Authorization tests assert the migration's expected policy text and model ownership isolation for two synthetic identities; they are not live PostgreSQL/Supabase RLS tests.
- Local focused harness: 5/5 SSRF tests and 5/5 authorization policy-model tests passed. The first GitHub CI attempt failed because an existing smoke test still expected the extracted helper name in index.ts; that failure is preserved in `security/evidence/ci-smoke-assertion-failure-2026-10-31.txt`. After updating the assertion, GitHub Actions run 41197582407 (run 114) passed `npm run check`, the complete `npm test` suite, `npm run build`, release identity validation, and artifact upload.

## Important remaining security limitations / release gate
- DNS rebinding and hostnames resolving to private/restricted IPs are not fully prevented by this patch. A resolver-pinned HTTP transport or strict trusted-host allowlist is required before claiming SSRF resistance is complete. The branch intentionally remains unmerged and release status remains HOLD.
- The deployed CareerLaunch project could not be identified or accessed safely. The runtime config references project ref `rqyvfbuvdhbtwakkqnok`, but that ref was absent from the connected Supabase project list; an attempt to inspect that exact project returned a permissions error. No other project was queried for CareerLaunch policies, and no production database was modified.
- Consequently, effective deployed RLS/storage policies and real two-account operations (read/write/delete draft, shortlist ownership, storage download/upload/update/delete) remain BLOCKED pending access to the correct authorized staging project. The migration source is evidence of intended policies, not proof of deployment.
- No internal production endpoints were contacted. No database test accounts or records were created.

## Decision
**HOLD.** Source-level defects were patched and focused local regressions passed, but DNS-rebinding defense, live effective-policy inspection, live two-account authorization, live Edge Function verification remains outstanding.
