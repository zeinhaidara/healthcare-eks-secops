# Runbook: report-only security scans

These jobs report; they never fail the build on a finding. Each has `contents: read` only, no secrets and no AWS credentials. Actions are pinned to commit SHAs, and the tools downloaded by hand (gitleaks, Kubescape) are pinned by SHA-256. The ZAP scans run against dev only, never prod.

| Job | What it covers | Trigger | Where the report is |
|---|---|---|---|
| `ci.yml` / `tflint` | Both Terraform roots and every module: terraform ruleset (recommended) and AWS ruleset (pinned in `.tflint.hcl`) | Every pull request; every push to `dev` and `main` | Job summary (count by rule); artifact `tflint-report`, 14 days |
| `ci.yml` / `kubescape` | Rendered Helm output of `helm/healthcare-api` (dev values) and Argo CD (`values/argocd.yaml`), as files, NSA and CIS `cis-v1.12.0`. No cluster | Same as tflint | Job summary (failed controls by ID); artifact `kubescape-reports` with the rendered YAML, 14 days |
| `ci.yml` / `pip-audit` | Known vulnerabilities in `app/requirements.txt` | Same as tflint | Job summary |
| `dast.yml` / `zap-baseline` | Passive scan of dev's public pages, no login | Mondays 05:17 UTC; by hand (`baseline` or `all`) | Artifact `zap_scan` |
| `dast.yml` / `zap-api` | Active scan of the endpoints in dev's `/openapi.json`; no API key, so keyed endpoints answer 403 | Wednesdays 05:17 UTC; by hand (`api` or `all`) | Artifact `zap_api_scan` |
| `dast.yml` / `zap-full` | Spider plus active attack traffic against dev. Never prod. 60-minute timeout | Sundays 02:37 UTC; by hand (`full` or `all`) | Artifact `zap_full_scan` |

Not run: npm audit (no frontend package file). Prowler stays manual (one run on 2026-10-10 with the operator's read-only profile; triage in `docs/security/prowler-triage.md`). Already in `ci.yml`: gitleaks, Trivy, Checkov, CodeQL and SonarCloud.

## Notes

- `dast.yml` is one workflow (concurrency group `dast`). With `all`, the three jobs run one after another, so two ZAP scans never hit dev at once; `zap-full` also has its own group. The API and full jobs refuse a `DEV_BASE_URL` that names prod.
- The ZAP actions upload their own artifacts and have no retention setting, so those follow the repository default. Download what you want to keep.
- Scheduled and manual `dast.yml` runs use the file on `main`, so a change starts after the release that carries it.
- The Argo CD render uses `values/argocd.yaml` only; the ingress, Dex and RBAC values Terraform adds in `terraform/cluster-addons/main.tf` are not in it.
- Kubescape runs one framework per command: a comma-separated list drops the second. The EKS CIS benchmark checks nodes, so it finds nothing in files.

## Open Kubescape findings

Fixed: Argo CD sets `runAsGroup` (C-0013), CPU limits (C-0270, C-0271) and no token for redis (one of C-0034 and C-0190); healthcare-api sets `fsGroup` and `fsGroupChangePolicy`. Open on purpose:

- `C-0211` (both charts): needs `seLinuxOptions`, which cannot be checked on EKS Fargate without deploying it.
- `C-0012` (healthcare-api, `argocd-cm`): false positives; the values are a secret's name and a label key.
- `C-0034`, `C-0190` (6 Argo CD pods): each has a Role or ClusterRole binding and reads the API, so it keeps its token.
- `C-0002`, `C-0035`, `C-0186` to `C-0188`, `C-0191`, `C-0278` to `C-0282`: Argo CD's own RBAC; narrowing it could break syncs.
- `C-0207` (4 Argo CD workloads): redis credentials come from the `argocd-redis` Secret as environment variables, by the chart's design.
- `C-0030`: the default Argo CD NetworkPolicy gap (ApplicationSet controller, redis init Job). A known gap until the needed traffic is shown from the manifests.

## Reading a finding

Open the run, read the job summary, then download the artifact. Triage it as `docs/security/triage-process.md` describes: fix it, accept it in `docs/security/exceptions-register.md`, or mark it a false positive with the reason.
