# Security Review — 2026-10-10

The connected `billybuilds-tech` Snyk organization reported 41 code findings:
20 high, 7 medium and 14 low. All were addressed without adding issue ignores or
excluding application source. Local credentials, scan outputs and test artifacts are
kept out of version control.

| Original finding group | Count | Changes |
| --- | ---: | --- |
| Server and DOM XSS | 18 | Validate numeric notification IDs; safely serialize stream data; escape exported HTML; use protected downloads and validated telephone links. |
| Fixed passwords/secrets, including fixtures and labels | 19 | Generate private demo/test credentials; remove password fallbacks; use HttpOnly browser sessions; clarify language labels and non-sensitive preference names. |
| Input types | 3 | Validate strings before trimming/splitting; reject malformed search/month values. |
| Timer code injection | 1 | Use explicit function callbacks for polling. |

## Additional Account Protections

- Enforce HS256 and well-formed, expiring session claims; reload roles/status from the database.
- Use session versions to revoke same-second tokens on logout, password change or reset.
- Stop notification streams on token expiry, account status changes or session revocation.
- Require signed-cookie CSRF tokens and JSON writes; reject untrusted browser origins.
- Limit authentication attempts and return retry information.
- Reject passwords beyond bcrypt's byte limit and require stronger manager credentials.
- Disable mail file/URL access, require production SMTP TLS and remove confidential mail logging.
- Use security/no-store headers and restrict API listening to localhost by default.
- Upgrade jsPDF to 4.2.1, Nodemailer to 10.0.16 and express-rate-limit to 8.7.1.
- Keep test creation/cleanup within disposable `obbs_test*` databases.

## Verification

- Snyk Code, including ignored issues: zero findings and zero ignores.
- Snyk dependencies, including development packages: both npm projects clean.
- npm audits in root and server: zero vulnerabilities.
- 38 unit/security checks and 72 API/security checks passed.
- 10 browser checks passed: cookie login/reload, CSRF recovery, password changes,
  desktop/mobile donor views, escaped certificate/card downloads, server logout and PDF export.
- Load test: 25 concurrent clients, 400 requests, zero failures.
- Lint and the production build passed.

All API/browser/load fixtures used disposable databases and private generated credentials;
no live email was sent. Raw Snyk reports are in `.local/snyk-review/`.

## Existing Local Installation

The existing local `obbs` database received the additive `users.session_version` column.
All 44 demo accounts still using the published password received new random credentials
in `.local/demo-credentials.json`. The custom manager password was preserved. Before/after
counts for users, appointments, donations, stock, bags, requests, transfers, notifications
and campaigns were unchanged, including total stock units. No clinical rules were changed.

Windows setup creates a persistent random session secret and new-manager password only
when `server/.env` is absent. Existing manager accounts are preserved; `ADMIN_PASSWORD`
applies when explicitly running the create/reset command. Manual upgrades must run
`npm run db:migrate` before starting the new API.

**Snyk Secrets is disabled for this organization.** Its scan returned HTTP 403
(`SNYK-CLI-0016`); no successful Secrets scan is claimed. HTTPS hosting and real SMTP
delivery were not exercised by the local test fixtures.
