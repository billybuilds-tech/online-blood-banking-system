# Project Workflow

## User Preferences

- Continue work in this existing project directory and GitHub repository. Do not create
  duplicate project copies for updates.
- After completing requested changes, commit and push them to the configured GitHub
  remote unless the user explicitly requests local-only work or a different workflow.
- Use clear, accurate commit messages and keep README.md and CHANGELOG.md current.
  Describe the behavior changed and the verification performed; do not invent results.
- Preserve existing work and repository visibility. Never force-push or rewrite history
  without an explicit user request.

## Verification

- Run checks appropriate to the change. Frontend checks: `npm run lint` and `npm run build`.
- Backend rules: `npm run test:unit` from `server/`.
- API checks: `npm run test:api` from `server/`, against a dedicated test database and
  running API. Do not run the data-cleanup tests against a live production database.
- Keep credentials, `.env`, dependencies, build output and local logs out of commits.
