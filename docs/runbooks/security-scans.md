# Runbook: scheduled and report-only security scans

These scans report; they never fail the build on a finding. Each runs with `contents: read` only, no secrets and no AWS credentials. Actions are pinned to commit SHAs, and the tools downloaded by hand (gitleaks, Kubescape) are pinned by SHA-256. Dynamic scans (ZAP) run against dev only, never prod.

| Scan | What it covers | When it runs | Where the report is | Who reads it |
|---|---|---|---|---|
| tflint (`security-scans.yml`, job `tflint`) | Both Terraform roots and every module: the terraform ruleset (recommended preset) and the AWS ruleset (pinned in `.tflint.hcl`) | Every pull request, every push to `dev`, Mondays 04:43 UTC, by hand | Job summary (count by rule); artifact `tflint-report`, 14 days | Owner (Moulaye), in the PR |
| Kubescape (`security-scans.yml`, job `kubescape`) | The rendered Helm output of `helm/healthcare-api` (dev values) and of Argo CD (`values/argocd.yaml`), scanned as files with the NSA and CIS (`cis-v1.12.0`) frameworks. No cluster access | Same as tflint | Job summary (failed controls by ID and count); artifact `kubescape-reports` with the rendered YAML, 14 days | Owner, in the PR |
| pip-audit (`security-scans.yml`, job `pip-audit`) | Known vulnerabilities in `app/requirements.txt` (PyPI advisory data) | Same as tflint | Job summary | Owner, in the PR |
| npm audit | Not run: the repo has no frontend package file | - | - | - |
| ZAP baseline (`dast.yml`) | Passive scan of the public pages of the dev app, no login | Mondays 05:17 UTC, by hand | Artifact `zap_scan` | Owner; summary in `docs/security/dast-baseline-results.md` |
| ZAP API scan (`dast-api.yml`) | The API endpoints listed in dev's `/openapi.json`, with an active scan. No API key is sent, so keyed endpoints answer 403 | Wednesdays 05:17 UTC, by hand | Artifact `zap_api_scan` | Owner |
| ZAP full scan (`dast-full.yml`) | Spider plus active attack traffic against dev. Never prod | Sundays 02:37 UTC (off-hours), by hand; 60-minute timeout | Artifact `zap_full_scan` | Owner |
| Prowler | AWS account posture | Not scheduled: there is no CI setup or CI role for it. One manual run on 2026-10-10 with the operator's read-only profile | Local only (`evidence/security/prowler/`, gitignored); triage in `docs/security/prowler-triage.md` | Owner |

## Notes

- The three ZAP workflows share the concurrency group `dast`, so two ZAP scans never hit dev at the same time. Each refuses a `DEV_BASE_URL` that is empty, not `http(s)://`, or names prod.
- ZAP artifacts are uploaded by the ZAP actions, which have no retention setting, so they follow the repository's default artifact retention. Download what you want to keep.
- The Kubescape render of Argo CD uses `values/argocd.yaml` only. The ingress, Dex and RBAC values that Terraform adds in `terraform/cluster-addons/main.tf` are not in it.
- Kubescape runs one framework at a time: a comma-separated list drops the second framework. The EKS CIS benchmark (`cis-eks-*`) checks nodes and the cluster, so it finds nothing in files; `cis-v1.12.0` is used instead.
- Scheduled runs and manual runs use the workflow files on `main`, so a scan starts after the release that carries it.
- Already in CI and not repeated here: gitleaks, Trivy, Checkov, CodeQL and SonarCloud (`ci.yml`).

## Reading a finding

Open the run, read the job summary, then download the artifact for detail. Triage it the way `docs/security/triage-process.md` describes. A finding stays a report until someone decides to fix it, accept it in `docs/security/exceptions-register.md`, or mark it a false positive with the reason.
