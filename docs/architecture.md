# Architecture

Three views: the AWS stack, the delivery flow and the access model. Region us-east-2. Diagrams are Mermaid and render on GitHub.

## 1. AWS stack

```mermaid
flowchart TB
    users["Users (HTTPS)"]
    git["GitHub repo"]

    subgraph vpc["VPC, 2 AZs"]
        subgraph pub["Public subnets"]
            albapp["ALB per app environment (dev, prod): HTTPS, ACM"]
            albargo["ALB for the Argo CD UI: HTTPS, GitHub sign-in"]
            nat["NAT gateway (one)"]
        end
        subgraph priv["Private subnets"]
            subgraph eks["EKS on Fargate (no nodes)"]
                lbc["AWS Load Balancer Controller"]
                api["healthcare-api pods: dev and prod namespaces"]
                argo["Argo CD"]
                eso["External Secrets"]
            end
            rot["Rotation Lambda"]
        end
    end

    ecr["ECR: immutable tags, scan on push"]
    ddb["DynamoDB: synthetic patients, read-only app"]
    sm["Secrets Manager: API key, GitHub App key, SSO secret"]
    kms["KMS: one project key"]

    subgraph det["Logging and detection"]
        flow["VPC flow logs, 365 days"]
        trail["CloudTrail, single region"]
        gd["GuardDuty"]
        sh["Security Hub (FSBP)"]
        sns["SNS topic (no subscriber yet)"]
    end

    users --> albapp --> api
    users --> albargo --> argo
    lbc -. "creates" .-> albapp
    lbc -. "creates" .-> albargo
    argo -- "pulls desired state" --> git
    argo -- "syncs" --> api
    api -- "IRSA, read only" --> ddb
    api -- "IRSA, read the API key" --> sm
    eso -- "IRSA, two secrets" --> sm
    ecr -- "image by digest" --> api
    rot -- "every 30 days" --> sm
    priv -- "outbound" --> nat
    trail --> sns
    gd --> sh
    kms -. "encrypts" .-> ddb
    kms -. "encrypts" .-> sm
    kms -. "encrypts" .-> ecr
    kms -. "encrypts" .-> det
```

- Pods reach AWS APIs through the one NAT gateway. No VPC endpoints are built.
- Each app namespace has its own pod security group, attached by a `SecurityGroupPolicy` (SEC-032). Kubernetes NetworkPolicy is not enforced on Fargate (SEC-021).
- The EKS API endpoint is public and private, with access entries only (EXC-005).
- AWS Config, WAF and Inspector are not built.

### Single NAT gateway

One NAT in `us-east-2a` serves both private subnets (`terraform/modules/network/main.tf`). If that AZ fails, pods in both AZs lose outbound calls to DynamoDB, Secrets Manager, KMS and ECR. Accepted for cost as EXC-015. The fix, not built: a NAT and route table per AZ, plus VPC endpoints.

## 2. Delivery flow

```mermaid
flowchart LR
    feat["Feature branch"] --> prdev["PR into dev"] --> devbr["dev branch"] --> prmain["Release PR: dev into main"] --> mainbr["main branch"]
    ci["ci.yml: tests, scanners, image build and scan. No AWS access"]
    prdev -. "runs" .-> ci
    prmain -. "runs, 10 checks required" .-> ci

    subgraph cd["cd.yml (push to dev that changes app/)"]
        build["Build and Trivy scan"] --> push["Push to ECR"] --> bump["Commit tag and digest to dev"]
    end
    devbr --> build
    bump --> devbr

    subgraph argocd["Argo CD (in the cluster)"]
        adev["dev: automatic sync"]
        aprod["prod: admin approves the sync"]
    end
    devbr -. "tracks" .-> adev
    mainbr -. "tracks" .-> aprod

    dast["dast.yml: weekly ZAP scans of dev"] -. "scans" .-> adev

    subgraph tf["terraform-apply.yml (manual)"]
        plan["Plan: read-only role"] --> guard{"Destructive plan guard"}
        guard -- "pass" --> gate{"infra approval"} --> apply["Apply the planned changes"] --> addons["Add-ons plan and apply"]
        guard -- "bucket, key or table deleted" --> blocked["Job fails"]
    end
    destroy["terraform-destroy.yml (manual, infra-destroy approval). Never run as of 2026-10-18"]
```

- No workflow runs Helm or kubectl against the cluster. Argo CD deploys from Git ([gitops-deploy.md](runbooks/gitops-deploy.md)).
- Merges are gated by automated checks; `main` requires 0 approvals (EXC-003).

## 3. Access model

```mermaid
flowchart LR
    subgraph gha["GitHub Actions: OIDC, no stored AWS keys"]
        jplan["tf-plan"]
        japply["tf-apply, add-ons, destroy"]
        jpush["cd push"]
    end

    planrole["Plan role: read only"]
    applyrole["Apply role: project-scoped write"]
    pushrole["ECR push role"]
    operator["Operator IAM user"]
    people["People: GitHub sign-in"]

    jplan --> planrole --> awsread["AWS read APIs"]
    japply -- "infra or infra-destroy approval" --> applyrole
    jpush --> pushrole --> ecr["ECR"]

    subgraph eksapi["EKS access entries (no creator admin)"]
        admin["Cluster admin (EXC-006)"]
        view["Cluster-wide view"]
    end
    applyrole --> admin
    operator --> view

    subgraph cluster["In the cluster"]
        argo["Argo CD RBAC: named users, default none"]
        irsa["Pod roles (IRSA): app read only, External Secrets two secrets"]
    end
    people --> argo
```

- The plan role trusts pull requests (EXC-004). The apply role is cluster admin (EXC-006).
- The operator has a long-lived access key and no MFA (Prowler triage N2).
- Removed: the operator's break-glass read on `argocd` (#146), and EKS access for the deploy-dev and deploy-prod roles, removed 2026-10-18 (#151, applied). The two IAM roles remain until deleted by hand.
