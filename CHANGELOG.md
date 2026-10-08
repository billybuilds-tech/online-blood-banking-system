# Changelog

## 2026-10-08

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
