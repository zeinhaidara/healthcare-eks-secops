# healthcare-eks-secops

A small, read-only healthcare API (FastAPI) on Amazon EKS with Fargate in us-east-2, run with a DevSecOps operating model: OIDC-based CI/CD with no stored AWS keys, scan gates (Trivy, Checkov, CodeQL, Sonar), least-privilege IAM, detective controls, an evidence-based improvement log and an exceptions register. Synthetic data only. Controls are HIPAA-aligned, not HIPAA-compliant.

Diagrams (architecture, CI/CD, access model): [docs/architecture.md](docs/architecture.md).

## Architecture

| Component | What it does | Reference |
|---|---|---|
| VPC | Public subnets (internet-facing ALB, one NAT gateway) and private subnets (Fargate pods, rotation Lambda) in pinned availability zones; VPC flow logs to KMS-encrypted CloudWatch Logs, 365 days | SEC-001, SEC-002 |
| EKS on Fargate | One cluster, Fargate profiles for `kube-system` and the `dev` and `prod` app namespaces. Pod Security `restricted` on the app namespaces; per-namespace pod security groups attached by `SecurityGroupPolicy` | SEC-018, SEC-030, SEC-021, SEC-032 (EXC-007 closed) |
| Ingress | AWS Load Balancer Controller creates an internet-facing ALB per environment, HTTPS with an ACM certificate, HTTP redirected to HTTPS. Hostnames `dev.cloudbatch818.click` and `prod.cloudbatch818.click` | SEC-033 |
| ECR | Immutable tags, scan on push, KMS encryption. Deploys pin the image digest that passed the Trivy scan | SEC-031 |
| DynamoDB | Patients table, KMS-encrypted, point-in-time recovery, seeded by Terraform with synthetic records; the app only reads | SEC-022, SEC-023, SEC-026, EXC-008 |
| Secrets Manager | API key secret, rotated every 30 days by a VPC Lambda; pods roll when the secret version changes | SEC-003, SEC-027, SEC-034, EXC-009 |
| KMS | One project key for the table, secret, ECR, logs and the trail | SEC-005, EXC-001 |
| CloudTrail | Single-region trail (us-east-2), log file validation, KMS, delivered to S3, CloudWatch Logs and SNS | SEC-035, SEC-036, EXC-010, EXC-012 to EXC-014 |
| GuardDuty | Detector with S3 data events and EKS audit logs | SEC-035, EXC-011 |
| Security Hub | AWS Foundational Security Best Practices standard (control findings need AWS Config, which is deferred) | SEC-035 |
| Budget | $75 per month, alerts at 50%, 80% and 100% of actual spend and a 100% forecast alert | [docs/cost/budget.md](docs/cost/budget.md) |

Application pods use IRSA with read-only access to the table, the API key secret and the project key, nothing else.

## Application

| Tier | What | Where |
|---|---|---|
| Frontend | Static single page (HTML/CSS/JS, strict CSP, no inline scripts) | `app/static/` |
| Backend | FastAPI service on port 8080 | `app/src/` |
| Database | DynamoDB table, seeded by Terraform; the app only reads (in-memory store from `app/data/patients.json` when `DYNAMODB_TABLE` is unset) | `terraform/modules/dynamodb` |

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/` | none | Frontend |
| GET | `/health` | none | Liveness |
| GET | `/ready` | none | Readiness (200 once the API key is loaded) |
| GET | `/metrics` | none | Prometheus text format |
| GET | `/patients` | `x-api-key` | List patients |
| GET | `/patients/{id}` | `x-api-key` | One patient |

Logs are JSON on stdout (request ID, method, path, status, latency). Patient fields are never logged.

| Env var | Default | Notes |
|---|---|---|
| `API_KEY_SECRET_NAME` | none | Secrets Manager secret holding the key (plaintext). The app fetches it at startup through its IRSA role and stays not-ready until it succeeds |
| `API_KEY` | none | Local run and unit test fallback only |
| `DYNAMODB_TABLE` | empty | Empty means a local in-memory store loaded from `app/data/patients.json` |
| `AWS_REGION` | `us-east-2` | |

## CI/CD

Branch flow: `feature/*` -> PR into `dev` -> PR `dev` into `main` (merge commit, no squash). `dev` never deploys.

| Workflow | Trigger | AWS access | What it does |
|---|---|---|---|
| `ci.yml` | PRs to `main` or `dev`, pushes to `dev` | none | `app-test-lint`, `lambda-test`, `app-trivy`, `app-build`, `app-image-scan`, `app-checkov`, `tf-validate`, `tf-checkov`, `codeql`, `sonar` |
| `cd.yml` | push to `main` changing `app/`, or run by hand | OIDC role | `build` (Trivy image scan, no credentials) -> `push` (ECR push role, reads the digest) -> `bump-image` (pull request to `dev` that sets the image tag and digest). Argo CD deploys from Git; CI never runs Helm or kubectl (`docs/runbooks/gitops-deploy.md`) |
| `terraform-apply.yml` | manual, no inputs | OIDC roles | `tf-plan` (read-only plan role, destructive plan guard) -> `tf-apply` (environment `infra`, apply role) -> `addons-plan` and `addons-apply` (environment `infra`) |
| `terraform-destroy.yml` | manual, no inputs | OIDC role | `tf-destroy` behind its own `infra-destroy` approval |

The destructive plan guard fails `tf-plan` before the plan artifact exists if the plan deletes or replaces an S3 bucket or bucket sub-resource, a KMS key or a DynamoDB table, and fails closed on a missing plan or a grep error (SEC-037). GitHub environment approvals and branch protection are set by hand and documented in [docs/security/controls.md](docs/security/controls.md); required approvals on `main` are 0 (EXC-003).

Required checks on `main`: `app-test-lint`, `app-trivy`, `app-checkov`, `tf-validate`, `tf-checkov`, `codeql`, `sonar`.

## Access model

| Identity | Access | Reference |
|---|---|---|
| Plan role | Read-only AWS access for `tf-plan`; no cluster access (SEC-019). Copy of the live policy: [plan-policy.json](docs/bootstrap-policies/plan-policy.json) | EXC-004, SEC-037 |
| Apply role | Project-scoped write for Terraform; EKS cluster admin, used only behind the `infra` and `infra-destroy` approvals | EXC-006, SEC-019 |
| Deploy roles | One per environment, `AmazonEKSEditPolicy` scoped to that environment's namespace; no AWS write access beyond the deploy | SEC-019, SEC-031 |
| ECR push role | Pushes the scanned image to the project repository | [docs/bootstrap.md](docs/bootstrap.md) |
| Operator | Read-only: `AmazonEKSViewPolicy` at cluster scope, read-only AWS | SEC-029 |
| EKS API endpoint | Public (0.0.0.0/0) and private, because GitHub-hosted runners need it; authentication mode API with access entries only, no creator admin | EXC-005, SEC-018 |

All CI roles are created by hand ([docs/bootstrap.md](docs/bootstrap.md)) and assumed through GitHub OIDC. The Prowler triage found that the operator IAM user has no MFA; see N2 in [docs/security/prowler-triage.md](docs/security/prowler-triage.md).

## Security documentation

- [Exceptions register](docs/security/exceptions-register.md): every accepted risk with owner and expiry (EXC-001 to EXC-014; EXC-007 closed).
- [Improvement log](docs/security/improvement-log.md): every change with source, before, fix and evidence (SEC-000 to SEC-041).
- [Prowler triage](docs/security/prowler-triage.md): the 2026-10-10 scan against the register, with proposed new items N1 to N8.
- [Security controls](docs/security/controls.md), [triage process](docs/security/triage-process.md), [findings report](docs/security/findings-report.md), [RBAC review](docs/security/rbac-review.md).
- Scan evidence: `evidence/security/` (Checkov, Trivy, CodeQL, Sonar). Raw Prowler output stays local and is gitignored.

## Planned (not built)

| Item | Status |
|---|---|
| AWS Config | Not enabled, so Security Hub FSBP control findings show no data |
| AWS WAF | Not deployed in front of the ALBs |
| Amazon Inspector | Not enabled; image scanning is Trivy in CI and CD plus ECR scan on push |
| CloudWatch alarms and alert delivery | The CloudTrail SNS topic has no subscriber yet |
| Full incident simulation | Not run; runbooks exist in [docs/runbooks/](docs/runbooks/) |

## Terraform layout

Two roots, each with its own state: `terraform/` (modules `network`, `kms`, `ecr`, `secrets`, `secret-rotation`, `dynamodb`, `budget`, `eks`, `irsa`, `acm`, `detective`) and `terraform/cluster-addons/` (namespaces, the AWS Load Balancer Controller and the `SecurityGroupPolicy` objects that attach the pod security groups, which `terraform/modules/eks` creates). Values come from GitHub variables as `TF_VAR_*`; nothing account-specific is hardcoded. The state bucket and region reach `terraform init` through `-backend-config`. Destroy the stack after every session.

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

## Docs

- [Docs index](docs/README.md), [phase map](docs/phase-map.md)
- [Architecture diagrams](docs/architecture.md)
- [Bootstrap (manual one-time setup)](docs/bootstrap.md), [CI role policies](docs/bootstrap-policies/README.md)
- [Budget](docs/cost/budget.md)
- Runbooks: [API key rotation](docs/runbooks/rotation.md), [cluster access](docs/runbooks/cluster-access.md), [failed deploy](docs/runbooks/failed-deploy.md), [deploy check](docs/runbooks/gitops-deploy.md#check-a-deploy), [detective controls](docs/runbooks/detective-controls.md), [operator import](docs/runbooks/eks-operator-import.md)
