# Runbook: report-only security scans

These jobs report. They never fail the build on a finding. Each has `contents: read` only, no secrets and no AWS credentials. Actions are pinned to commit SHAs. Tools downloaded by hand (gitleaks, Kubescape) and the ZAP image are pinned by SHA-256. ZAP scans run against dev only, never prod.

| Job | What it covers | Trigger | Report |
|---|---|---|---|
| `ci.yml` / `tflint` | Both Terraform roots and every module, terraform and AWS rulesets | Every PR; pushes to `dev` and `main` | Job summary; artifact `tflint-report`, 14 days |
| `ci.yml` / `kubescape` | Rendered `healthcare-api` (dev values) and Argo CD charts, NSA and `cis-v1.12.0`, files only | Same | Job summary; artifact `kubescape-reports`, 14 days |
| `ci.yml` / `pip-audit` | Known vulnerabilities in `app/requirements.txt` | Same | Job summary |
| `dast.yml` / `zap-baseline` | Passive scan of dev's public pages, no login, no attack traffic | By hand (`baseline` or `all`) | Artifact `zap_scan` |
| `dast.yml` / `zap-api` | Active scan of the endpoints in dev's `/openapi.json`; no API key, so keyed endpoints answer 403 | By hand (`api` or `all`) | Artifact `zap_api_scan` |
| `dast.yml` / `zap-full` | Spider plus active attack traffic against dev, 60-minute timeout | By hand (`full` or `all`) | Artifact `zap_full_scan` |

The weekly schedule was removed on 2026-10-20, when the stack was torn down: dev no longer exists, so a scheduled scan would only fail.

Gating scans (gitleaks, Trivy, Checkov, CodeQL, SonarCloud) are in [controls.md](../security/controls.md). Prowler stays manual; see [prowler-triage.md](../security/prowler-triage.md). There is no npm audit, because there is no frontend package file.

## Notes

- `dast.yml` has one concurrency group. With `all`, the three jobs run one after another, so two scans never hit dev at once.
- The API and full jobs refuse a `DEV_BASE_URL` that names prod. Every job fails at once if it is empty or not an `http(s)://` URL.
- A manual run uses the file on the branch you pick.
- Before the teardown, ZAP ran four times: two baselines by hand on 2026-10-17, a full scan by schedule on 2026-10-18 and a baseline by schedule on 2026-10-19. The API scan never ran. The results above are from the 2026-10-17 baselines; the scheduled runs' reports were not reviewed here.
- ZAP artifacts follow the repository's default retention. Download what you want to keep.
- To update ZAP, read the new version's digest from `ghcr.io/zaproxy/zaproxy` and change `docker_name` in all three jobs.
- The Argo CD render uses `values/argocd.yaml` only. The ingress, Dex and RBAC values from `cluster-addons/main.tf` are not in it.

## Reading a finding

Open the run, read the job summary, then download the artifact. Triage it as [triage-process.md](../security/triage-process.md) says: fix it, accept it in the [exceptions register](../security/exceptions-register.md), or mark it a false positive with the reason.

## Last ZAP baseline result (dev, 2026-10-17)

| Risk | Before header fixes | After |
|---|---|---|
| High | 0 | 0 |
| Medium | 1 | 0 |
| Low | 5 | 1 |
| Informational | 4 | 4 |

- Fixed: CSP `form-action 'self'` (Medium), plus HSTS, Permissions-Policy, COOP and CORP (Low). The headers are set in the `observe` middleware in `app/src/main.py`.
- Open Low: Cross-Origin-Embedder-Policy. The page loads nothing cross-origin, but `require-corp` waits until it can be checked on the deployed host.
- Informational (4): SQL-like words in `app/static/app.js` comments, the modern-web-app note, and two cache notes from `no-store`.

## Open Kubescape findings

Fixed: Argo CD sets `runAsGroup` (C-0013), CPU limits (C-0270, C-0271) and no token for redis; healthcare-api sets `fsGroup`. Open on purpose:

- `C-0211` (both charts): needs `seLinuxOptions`, which cannot be checked on Fargate without deploying it.
- `C-0012` (healthcare-api, `argocd-cm`): false positives; the values are a secret's name and a label key.
- `C-0034`, `C-0190` (6 Argo CD pods): each reads the API through a Role, so it keeps its token.
- `C-0002`, `C-0035`, `C-0186` to `C-0188`, `C-0191`, `C-0278` to `C-0282`: Argo CD's own RBAC; narrowing it could break syncs.
- `C-0207` (4 Argo CD workloads): redis credentials come from a Secret as environment variables, by the chart's design.
- `C-0030`: the default Argo CD NetworkPolicy gap. Known, until the needed traffic is shown from the manifests.
