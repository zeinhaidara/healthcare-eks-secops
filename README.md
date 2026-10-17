# healthcare-eks-secops

A small, read-only healthcare API (FastAPI) on Amazon EKS with Fargate in us-east-2, run with a DevSecOps model: OIDC-based CI/CD with no stored AWS keys, scan gates, GitOps deploys through Argo CD, least-privilege IAM, detective controls, and a logged record of every change and accepted risk. Synthetic data only. HIPAA-aligned, not HIPAA-compliant.

## Repo map

| Path | What is there |
|---|---|
| `app/` | FastAPI backend (`src/`), static frontend (`static/`), tests (`tests/`), synthetic data and its generator |
| `helm/healthcare-api/` | The app chart; `values-dev.yaml` and `values-prod.yaml` carry the image tag and digest |
| `terraform/` | Root stack: VPC, KMS, ECR, secrets and rotation, DynamoDB, budget, EKS, IRSA, ACM, detective controls |
| `terraform/cluster-addons/` | Second root: namespaces, Load Balancer Controller, Argo CD and its Applications, External Secrets, metrics-server |
| `.github/workflows/` | `ci.yml` (checks), `cd.yml` (build and bump), `dast.yml` (ZAP), `terraform-apply.yml`, `terraform-destroy.yml` |
| `security/` | Scanner config: Checkov, Trivy, the CodeQL gate |
| `scripts/` | Smoke test and the securityContext check |
| `docs/` | Architecture, bootstrap, runbooks, security records, budget. Start at the [docs index](docs/README.md) |
| `evidence/security/` | Saved before and after scan output |

## How it fits together

- **AWS:** one VPC (private subnets for pods, one NAT), EKS on Fargate with `dev` and `prod` namespaces, an HTTPS ALB per environment, DynamoDB, Secrets Manager with 30-day rotation, one KMS key, CloudTrail, GuardDuty and Security Hub. Diagrams: [architecture.md](docs/architecture.md).
- **Deploy:** a merge to `dev` builds, scans and pushes the image, then commits the new digest to `dev`. Argo CD syncs dev at once. Prod tracks `main` and syncs when approved in Argo CD. Details: [gitops-deploy.md](docs/runbooks/gitops-deploy.md).
- **Branches:** `feature/*` to `dev` by PR, then `dev` to `main` by PR with a merge commit.
- **Infra:** `terraform-apply.yml` runs by hand: read-only plan, destructive plan guard, then apply behind the `infra` approval. Destroy the stack after every session.
- **Access:** CI roles are made by hand ([bootstrap.md](docs/bootstrap.md)). Pods use IRSA with read-only access to the table, the secret and the key. Argo CD sign-in is GitHub only.

## Application

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/` | none | Frontend (strict CSP, no inline scripts) |
| GET | `/health` | none | Liveness |
| GET | `/ready` | none | Readiness (200 once the API key is loaded) |
| GET | `/metrics` | none | Prometheus text format |
| GET | `/patients`, `/patients/{id}` | `x-api-key` | Patient records |

Logs are JSON on stdout with request metadata only, never patient fields.

| Env var | Default | Notes |
|---|---|---|
| `API_KEY_SECRET_NAME` | none | Secrets Manager secret with the key, read at startup through IRSA |
| `API_KEY` | none | Local runs and tests only |
| `DYNAMODB_TABLE` | empty | Empty means an in-memory store from `app/data/patients.json` |
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
pytest --cov=src --cov-report=term-missing
ruff check . && ruff format --check .
```

## Security records

- [Controls](docs/security/controls.md): what protects the system, with status and evidence.
- [Exceptions register](docs/security/exceptions-register.md): accepted risks with owner and expiry.
- [Improvement log](docs/security/improvement-log.md): every security change with before and after evidence.
- [Scans](docs/runbooks/security-scans.md): report-only scans and their latest results.

## Not built yet

AWS Config, WAF, Inspector, alarms with alert delivery (the CloudTrail SNS topic has no subscriber), and an incident simulation.
