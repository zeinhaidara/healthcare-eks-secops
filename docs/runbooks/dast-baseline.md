# Runbook: ZAP baseline scan (DAST)

`.github/workflows/dast.yml` runs the OWASP ZAP baseline scan against the dev app. It is report-only: it never fails a deploy and never blocks a merge.

## What it covers

- The dev URL in the repository variable `DEV_BASE_URL`, scanned from the internet with no login and no API key.
- ZAP's baseline: it spiders the pages it can reach and runs passive checks only (missing or weak security headers, cookie flags, information leaks, and similar). It sends no attack traffic.
- Not covered: anything behind the API key (the `/patients` data), and any active testing. Treat a clean report as "no passive findings on the public pages", not as "the app is secure".

## When it runs

- Weekly, Mondays at 05:17 UTC, and by hand: Actions tab, `dast`, Run workflow.
- Scheduled and manual runs need the file on `main`, so it starts after the first release that carries it.
- If `DEV_BASE_URL` is empty or not an `http(s)://` URL, the job fails at once with a message saying so.

## Where the report is

Open the run, then Artifacts. `zap-baseline-reports` holds the HTML, Markdown and JSON reports and is kept for 14 days. The action also uploads `zap_scan` with the same reports; that copy follows the repository's default artifact retention.

## Notes

- Findings are for triage, not automatic action. Record any accepted one the way `docs/security/triage-process.md` describes.
- The workflow has `contents: read` only, no secrets and no AWS access. The ZAP action is pinned to a commit (v0.15.0). The ZAP container image it pulls is the action's default `stable` tag, which is not pinned.
