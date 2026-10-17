# DAST baseline: before and after the header fixes

The ZAP baseline (`.github/workflows/dast.yml`, runbook `docs/runbooks/dast-baseline.md`) was run against dev twice on 2026-10-17: once before and once after the response-header PR (#127). It is passive and unauthenticated, so it sees the public pages only. Report-only: nothing fails on a finding. The full reports are the `zap_scan` artifact of each run (repository default retention) and are not copied into the repo.

| Risk | Before | After |
|---|---|---|
| High | 0 | 0 |
| Medium | 1 | 0 |
| Low | 5 | 1 |
| Informational | 4 | 4 |

## What changed

- **Medium, gone:** the CSP had no `form-action`, a directive that does not fall back to `default-src`. It is now `form-action 'self'`.
- **Low, four gone:** missing Strict-Transport-Security, Permissions-Policy, Cross-Origin-Opener-Policy and Cross-Origin-Resource-Policy.
- **Low, one left:** Cross-Origin-Embedder-Policy (COEP).
- **Informational, unchanged (4):** comments in `app/static/app.js` that match SQL-like words, the modern-web-application note, `no-store` marking responses non-storable, and the cache-control note. All four are open.

## Where the headers are set

All in the `observe` middleware of `app/src/main.py`: the CSP constant (`:24`, set at `:100`) and the `SECURITY_HEADERS` dict (`:28-32`, applied at `:103`). They are `Strict-Transport-Security: max-age=31536000; includeSubDomains` (no preload), `Permissions-Policy` denying camera, microphone, geolocation, payment and usb, and `same-origin` for Cross-Origin-Opener-Policy and Cross-Origin-Resource-Policy. `test_security_headers_are_on_every_kind_of_response` checks them. The controls rows are in `docs/security/controls.md`.

## Why COEP is out

`Cross-Origin-Embedder-Policy: require-corp` makes the browser refuse any cross-origin resource that does not opt in. The page loads nothing cross-origin (no external URL in the static files, and the CSP allows only same-origin), so it looks safe, but it was left out until it can be checked on the deployed host. The app uses no feature that needs cross-origin isolation, so the gain is small. It stays open as one Low.
