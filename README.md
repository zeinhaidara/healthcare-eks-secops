# healthcare-eks-secops

> Torn down on 2026-10-20. The diagrams and commands describe the platform as it was built; the teardown and rebuild path is in docs/runbooks/teardown.md.

A read-only patient lookup API (FastAPI) on Amazon EKS with Fargate in us-east-2, delivered through a secured platform: scan gates in CI, GitOps deploys with Argo CD, Terraform for everything, least-privilege IAM, detective controls, and a logged record of every change and accepted risk. All data is synthetic. No compliance claim is made.

## Repo map

| Path | What is there |
|---|---|
| `app/` | FastAPI backend (`src/`), static frontend (`static/`), tests, synthetic data |
| `helm/healthcare-api/` | App chart; `values-dev.yaml` and `values-prod.yaml` carry the image tag and digest |
| `terraform/` | Root stack: VPC, KMS, ECR, secrets and rotation, DynamoDB, budget, EKS, IRSA, ACM, detective controls |
| `terraform/cluster-addons/` | Second root: Load Balancer Controller, Argo CD and its apps, External Secrets, metrics-server |
| `.github/workflows/` | `ci.yml` checks, `cd.yml` build and bump, `dast.yml` ZAP, `terraform-apply.yml`, `terraform-destroy.yml`, `terraform-force-unlock.yml` |
| `security/`, `scripts/` | Scanner config, smoke test, securityContext check |
| `docs/` | Start at the [docs index](docs/README.md) |
| `evidence/security/` | Saved before and after scan output |

## How it fits together

- **Deploy:** a merge to `dev` builds, scans and pushes one image, then commits its digest to `dev`. Argo CD syncs dev automatically. Prod tracks `main` and syncs when an admin approves ([gitops-deploy.md](docs/runbooks/gitops-deploy.md)).
- **Gates:** every PR runs `ci.yml`. `main` requires 10 checks and 0 approvals: merges are gated by automated checks (EXC-003).
- **Infra:** `terraform-apply.yml` runs by hand: read-only plan, destructive plan guard, then apply behind the `infra` approval. `terraform-destroy.yml` plans the destroy, then destroys behind a second approval. It tore the stack down on 2026-10-20 ([teardown.md](docs/runbooks/teardown.md)).
- **AWS layout and access:** [architecture.md](docs/architecture.md).

## Application

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/` | none | Frontend (strict CSP, no inline scripts) |
| GET | `/health`, `/ready` | none | Liveness; readiness is 200 once the API key loads |
| GET | `/metrics` | none | Prometheus text |
| GET | `/patients`, `/patients/{id}` | `x-api-key` | Patient records |

Env vars: `API_KEY_SECRET_NAME` (read at startup through IRSA), `API_KEY` (local and tests only), `DYNAMODB_TABLE` (empty means an in-memory store from `app/data/patients.json`), `AWS_REGION` (default `us-east-2`).

## Run and test locally

```sh
docker build -t healthcare-api app/
docker run --rm -p 8080:8080 --read-only --tmpfs /tmp -e API_KEY=test-key healthcare-api
# open http://localhost:8080 and enter test-key

cd app && pip install -r requirements-dev.txt
pytest --cov=src && ruff check . && ruff format --check .
```

## Records

[Controls](docs/security/controls.md) · [Exceptions register](docs/security/exceptions-register.md) · [Improvement log](docs/security/improvement-log.md) · [Scans](docs/runbooks/security-scans.md) · [Cost](docs/cost/budget.md)

Not built yet: AWS Config, WAF, Inspector, alert delivery, an incident simulation.
