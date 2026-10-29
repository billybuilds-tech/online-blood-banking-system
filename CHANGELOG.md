# Changelog

## 2026-10-29 — Online Hosting

- Serve the built frontend from the API when `SERVE_CLIENT=1`, with long caching for hashed
  assets, `no-cache` for pages and the service worker, and app routes outside `/api`.
- Connect to hosted MySQL over verified TLS with `DB_SSL_CA`.
- Keep `NOW()` and `TIMESTAMP` values in Tanzanian time with `DB_TIME_ZONE` on UTC servers.
- Give hosted connections the XAMPP SQL mode with `DB_SQL_MODE`, since Aiven defaults to ANSI
  modes (`ANSI_QUOTES`, `PIPES_AS_CONCAT`, `ONLY_FULL_GROUP_BY`).
- Add a Render Blueprint (`render.yaml`) that creates tables and runs migrations on each start.

Validation: lint, build and the 38 unit checks passed. A production-mode run (Secure cookies,
CSP, `SERVE_CLIENT=1`) against a disposable copy of the local database served the home page and
the manager, blood bank, donor and recipient dashboards in Edge with no page errors or blocked
resources. The copy kept every row count and stock total, and the disposable database was dropped.
All 72 API checks also passed against Aiven MySQL 8.4 with `DB_TIME_ZONE` and `DB_SQL_MODE` set.

## 2026-10-10 — Security Recommendations and Snyk Findings

- Resolve all 41 Snyk code findings without ignoring them or excluding application source.
- Upgrade vulnerable PDF dependencies and use patched mail/rate-limit libraries.
- Move browser sessions to HttpOnly cookies with signed-cookie CSRF protection.
- Add server logout, session-version revocation, strict JWT algorithms/claims and stream expiry.
- Add authentication rate limits, security headers and no-store private API responses.
- Enforce bcrypt byte limits and stronger manager passwords; remove public password fallbacks.
- Generate private demo/test credentials and refuse production demo seeding.
- Validate notification IDs, safely serialize events and protect certificate/card downloads.
- Reject malformed input types and encode validated phone links while retaining valid local formats.
- Remove confidential email/reset-link logging and require production SMTP TLS.
- Add isolated API/load/browser test environments and safe Windows setup with locked dependencies.
- Upgrade the local session schema and rotate 44 published demo passwords; preserve the custom
  manager password, all record counts and stock totals.
- Document configuration changes and validation in [SECURITY.md](docs/SECURITY.md).

Validation: Snyk Code reported zero findings and zero ignores; both Snyk dependency scans
and npm audits were clean. All 38 unit checks, 72 API checks and 10 browser checks passed,
as did lint/build. The 400-request load check had zero failures. Tests used disposable
databases and never sent live email. Snyk Secrets remains disabled (HTTP 403).

## 2026-10-08

### Project Documentation

- Added the maintainer's GitHub profile to the README.
- Recorded documentation and commit attribution preferences for future updates.

### Tanzanian Mobile Number Validation

Registration and profile forms previously accepted invalid numbers such as `00000000`.
Doctor phone checks allowed arbitrary country codes, and courier phone numbers were not
validated. These fields now use the same rules in React and the Express API.

- Accept local mobile numbers with exactly 10 digits starting with `06` or `07`.
- Accept international equivalents starting with `+2556` or `+2557`.
- Allow spaces and hyphens, and save accepted numbers in canonical `+255` format.
- Reject invalid prefixes, country codes, lengths and non-string values before saving.
- Show validation messages in English or Swahili.
- Keep existing records intact; normalization applies to new registrations and updates.

Examples: `0612345678` becomes `+255612345678`, and `0712 345 678` becomes
`+255712345678`. This validates the format; it does not verify phone ownership.

### Validation

- 28 unit tests passed, including accepted formats and malformed inputs.
- 64 API tests passed, including registration for all three roles, profile updates,
  doctors' numbers and courier dispatches.
- Production build and lint passed.
- 120 browser phone checks passed across all four forms at desktop (1440 px) and
  mobile (390 px) widths, with no JavaScript errors.
