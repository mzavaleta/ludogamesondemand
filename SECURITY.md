# Security Policy

## Reporting a vulnerability

Please report security issues privately via GitHub's "Report a vulnerability" feature
on this repository, or by emailing the maintainer. Do not open public issues for
security problems.

## Supported versions

Only the latest `main` is supported.

## Notes

- AI provider credentials are stored only in the user's browser `localStorage` and are
  never persisted by the backend.
- The `LUDO_ADMIN_KEY` environment variable must be set to a strong value in any
  deployment; the default is intended for local development only.
- Game HTML is served with a `connect-src 'none'` CSP and the player iframe does not
  grant `allow-same-origin`.
