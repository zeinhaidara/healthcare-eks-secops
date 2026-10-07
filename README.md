# healthcare-eks-secops

DevSecOps operating model for a healthcare API on EKS: OIDC-based CI/CD, Trivy/Checkov/Prowler gates, GuardDuty/Inspector/Security Hub, CloudWatch observability, and incident and cost runbooks. Synthetic data only. Controls are HIPAA-aligned, not HIPAA-compliant.

## Architecture (3-tier)

| Tier | What | Where |
|---|---|---|
| Frontend | Static single page (HTML/CSS/JS, strict CSP, no inline scripts) | `app/static/` |
| Backend | FastAPI service on port 8080 | `app/src/` |
| Database | DynamoDB table (in-memory store when `DYNAMODB_TABLE` is unset) | Terraform, Phase 2 |

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/` | none | Frontend |
| GET | `/health` | none | Liveness |
| GET | `/ready` | none | Readiness (200 once the API key is loaded) |
| GET | `/metrics` | none | Prometheus text format |
| GET | `/patients` | `x-api-key` | List patients |
| GET | `/patients/{id}` | `x-api-key` | One patient |
| POST | `/patients` | `x-api-key` | Add a patient |
| DELETE | `/patients/{id}` | `x-api-key` | Delete a patient |

Logs are JSON on stdout (request ID, method, path, status, latency). Patient fields are never logged.

## Configuration

| Env var | Default | Notes |
|---|---|---|
| `API_KEY_SECRET_NAME` | none | Secrets Manager secret holding the key (plaintext). The app fetches it at startup through its IRSA role and stays not-ready until it succeeds |
| `API_KEY` | none | Local run and unit test fallback only |
| `DYNAMODB_TABLE` | empty | Empty means in-memory store seeded from `app/data/patients.json` |
| `AWS_REGION` | `us-east-2` | |

## Run locally

```sh
docker build -t healthcare-api app/
docker run --rm -p 8080:8080 --read-only --tmpfs /tmp -e API_KEY=test-key healthcare-api
```

Open http://localhost:8080 and enter `test-key`.

## Test and lint

```sh
cd app
pip install -r requirements-dev.txt
pytest
ruff check . && ruff format --check .
```

## Branch flow and CI

`feature/*` -> PR into `dev` -> PR `dev` into `main` (merge commit, no squash) -> `app-release.yml` deploys with approvals. `dev` never deploys.

Two independent, AWS-free pipelines run on PRs to `main` or `dev` and on pushes to `dev`. Mark these job names as required checks on `main`:

| Workflow | Required checks |
|---|---|
| `app-ci.yml` | `app-test-lint`, `app-trivy`, `app-checkov` |
| `terraform-ci.yml` | `tf-validate`, `tf-checkov` |

Terraform plan and apply are manual only (`terraform-apply.yml`, Phase 2).

## Budget

$75 per month with alerts at 50%, 80% and 100% of actual spend and a 100% forecast alert. Destroy the stack after every session. Details: [docs/cost/budget.md](docs/cost/budget.md).

## Docs

- [Bootstrap (manual one-time setup)](docs/bootstrap.md)
- [Security controls, PR gate to approval gate](docs/security/controls.md)
- [Improvement log](docs/security/improvement-log.md), [exceptions](docs/security/exceptions-register.md), [triage](docs/security/triage-process.md)
- [Budget](docs/cost/budget.md)
