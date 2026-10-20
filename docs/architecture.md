# Architecture

> Torn down on 2026-10-20. Hosted zone and domain retained by decision; see docs/runbooks/teardown.md.

Five diagrams: traffic and workloads, data and logging, app delivery, infrastructure delivery, and access. Region us-east-2. Diagrams are Mermaid and render on GitHub. Status at 2026-10-18.

## 1. AWS stack

### 1a. Traffic and workloads

```mermaid
flowchart LR
    users["Users (HTTPS)"]
    r53["Route 53: dev and prod aliases set by hand; argocd alias by Terraform"]
    acm["ACM wildcard certificate, DNS-validated"]
    git["GitHub repo"]
    awsapi["AWS APIs: DynamoDB, Secrets Manager, KMS, ECR"]

    subgraph vpc["VPC, two AZs"]
        subgraph pub["Public subnets"]
            albdev["ALB dev"]
            albprod["ALB prod"]
            albargo["ALB Argo CD UI"]
            nat["NAT gateway, one, in us-east-2a: outbound for both private subnets"]
        end
        subgraph priv["Private subnets"]
            subgraph eks["EKS on Fargate, no nodes"]
                ks["kube-system: LB Controller, CoreDNS, metrics-server"]
                nsdev["dev namespace: healthcare-api"]
                nsprod["prod namespace: healthcare-api"]
                nsargo["argocd namespace: Argo CD"]
                nseso["external-secrets namespace"]
            end
            rot["Rotation Lambda"]
        end
    end

    users --> r53
    r53 --> albdev --> nsdev
    r53 --> albprod --> nsprod
    r53 --> albargo --> nsargo
    acm -. "HTTPS on every ALB; HTTP redirects" .-> pub
    ks -. "creates the ALBs" .-> pub
    nsargo -- "syncs" --> nsdev
    nsargo -- "syncs" --> nsprod
    nat -- "pods and Lambda" --> awsapi
    nat -- "Argo CD pulls desired state" --> git
```

### 1b. Data, encryption and logging

```mermaid
flowchart LR
    pods["healthcare-api pods (dev, prod)"]
    eso["External Secrets"]
    rot["Rotation Lambda"]

    ddb["DynamoDB patients table: synthetic, seeded by Terraform"]
    sm["Secrets Manager: API key, GitHub App key, Argo CD SSO secret"]
    ecr["ECR: immutable tags, scan on push"]
    dlq["SQS dead-letter queue"]
    kms["KMS project key, rotation on"]

    subgraph det["Logging and detection"]
        flow["VPC flow logs"]
        cwl["CloudWatch Logs: flow logs, EKS control plane, Lambda, trail. 365 days"]
        trail["CloudTrail: single region, log file validation"]
        trailb["S3 trail bucket"]
        accb["S3 access-log bucket (SSE-S3)"]
        sns["SNS topic (no subscriber yet)"]
        gd["GuardDuty: S3 data events, EKS audit logs"]
        sh["Security Hub: FSBP standard"]
    end

    pods -- "IRSA, read only, via NAT" --> ddb
    pods -- "IRSA, read the API key, via NAT" --> sm
    eso -- "IRSA, read two secrets, via NAT" --> sm
    ecr -- "image pinned by digest" --> pods
    rot -- "rotates the API key every 30 days, via NAT" --> sm
    rot -. "failed runs" .-> dlq
    flow --> cwl
    trail --> trailb
    trail --> cwl
    trail --> sns
    trailb -- "access logs" --> accb
    gd --> sh
    kms -. "encrypts" .-> ddb
    kms -. "encrypts" .-> sm
    kms -. "encrypts" .-> ecr
    kms -. "encrypts" .-> cwl
    kms -. "encrypts" .-> trailb
    kms -. "encrypts" .-> sns
    kms -. "encrypts" .-> dlq
```

**Network path.** Pods and the Lambda reach DynamoDB, Secrets Manager, KMS and ECR through the one NAT gateway, because no VPC endpoints are built. The per-namespace pod security groups are created in `terraform/modules/eks/main.tf`; the `SecurityGroupPolicy` that attaches them is owned by `terraform/cluster-addons` (SEC-032). Kubernetes NetworkPolicy is not enforced on Fargate (SEC-021). The EKS API endpoint stays public and private (EXC-005). Fargate profiles: kube-system, argocd, external-secrets, dev and prod.

**References.** SEC-001 and SEC-002 (network, flow logs); SEC-021, SEC-030 and SEC-032 (pod isolation, Pod Security); SEC-003 and SEC-027 (rotation; pods are restarted by hand after a rotation, SEC-034); SEC-022 and SEC-023 (read-only seeded table); SEC-035 to SEC-037 (detective controls); EXC-010 (single-region trail); EXC-014 (access-log bucket on SSE-S3, which S3 access logging requires). AWS Config, WAF and Inspector are not built.

### Availability: single NAT gateway

One NAT gateway in `us-east-2a` serves both private subnets, which share one private route table (`terraform/modules/network/main.tf`). It is one gateway for cost. If that AZ fails, outbound calls to DynamoDB, Secrets Manager, KMS and ECR fail for pods in both AZs. The table and the secret stay available, because both are regional services. Accepted as EXC-015.

Planned fixes, not built: a second NAT gateway with its own private route table per AZ, a DynamoDB gateway endpoint, and interface endpoints for Secrets Manager, KMS, STS, ECR and CloudWatch Logs.

## 2. Delivery

### 2a. App delivery

```mermaid
flowchart LR
    feat["feature branch"] --> prdev["PR into dev"] --> devbr["dev branch"] --> prmain["PR dev into main (release)"] --> mainbr["main branch"]
    ci["ci.yml: tests, lint, Trivy, Checkov, CodeQL, Sonar, gitleaks, image build and scan, report-only scans. No AWS access"]
    prdev -. "runs" .-> ci
    prmain -. "runs; 10 checks required on main" .-> ci

    subgraph cd["cd.yml"]
        trig["Trigger: push to dev that changes app/, or a manual run with no inputs"] --> build["build and Trivy image scan, no credentials"] --> push["push to ECR by commit SHA, ECR push role"] --> bump["bump-image: commits the image tag and digest to dev"]
    end
    devbr --> trig
    bump --> devbr

    subgraph argo["Argo CD, no AWS role"]
        adev["healthcare-api-dev: tracks dev, automatic sync"]
        aprod["healthcare-api-prod: tracks main, sync approved by an admin"]
    end
    devbr -. "deploys from Git" .-> adev
    mainbr -. "deploys from Git" .-> aprod

    dast["dast.yml: ZAP baseline, API and full; manual; dev only; report only"] -. "scans" .-> adev
```

### 2b. Infrastructure delivery

```mermaid
flowchart LR
    operator["Operator"]

    subgraph tf["terraform-apply.yml"]
        plan["tf-plan: plan role, read only"] --> guard{"destructive plan guard"}
        guard -- "delete or replace of a bucket, key or table" --> blocked["job fails, no plan artifact"]
        guard -- "pass" --> gate1{"infra approval"} --> apply["tf-apply: apply role, applies the saved plan"]
        apply --> gate2{"infra approval"} --> aplan["addons-plan"] --> gate3{"infra approval"} --> aapply["addons-apply"]
    end

    subgraph td["terraform-destroy.yml"]
        dgate{"infra-destroy approval"} --> destroy["destroy the cluster add-ons, then the root"]
    end

    operator -- "workflow_dispatch, no inputs" --> plan
    operator -- "workflow_dispatch, no inputs" --> dgate
```

Environment approvals are set by hand in GitHub: `infra` and `infra-destroy` each have one required reviewer (the maintainer), self-review allowed and admin bypass on ([bootstrap.md](bootstrap.md), EXC-003). Deploys come from Git through Argo CD; no workflow runs Helm or kubectl against the cluster ([gitops-deploy.md](runbooks/gitops-deploy.md)). Some steps around a rebuild stay manual ([bootstrap.md](bootstrap.md), Manual steps around a rebuild). References: SEC-011 (CI and CD split), SEC-016 (apply uses the saved plan and Lambda zip), SEC-031 (deploy by digest), SEC-037 (destructive plan guard), EXC-003 (0 required approvals on `main`).

## 3. Access model

```mermaid
flowchart LR
    subgraph gha["GitHub Actions, OIDC"]
        jplan["tf-plan"]
        japply["tf-apply, add-ons jobs, destroy"]
        jpush["cd.yml push"]
    end

    keys["No stored AWS keys in GitHub"]
    planrole["Plan role: read only, no cluster access"]
    applyrole["Apply role: project-scoped write"]
    pushrole["ECR push role: trusts main and dev only"]
    operator["Operator IAM user: read only"]
    people["People: GitHub sign-in through Dex"]

    gha -.- keys
    jplan --> planrole --> awsread["AWS read APIs"]
    japply -- "infra or infra-destroy approval" --> applyrole
    jpush --> pushrole --> ecr["ECR repository"]

    subgraph eksapi["EKS API endpoint"]
        ep["Public 0.0.0.0/0 and private (EXC-005)"]
        authn["Authentication mode API: access entries only, no creator admin"]
        admin["AmazonEKSClusterAdminPolicy, cluster scope"]
        view["AmazonEKSViewPolicy, cluster scope"]
    end
    applyrole -- "EXC-006" --> admin
    operator -- "SEC-029" --> view

    removed["Removed: deploy-dev and deploy-prod AmazonEKSEditPolicy entries (#151); operator AmazonEKSAdminViewPolicy on argocd (#146)"]
    style removed stroke-dasharray: 5 5

    subgraph cluster["In the cluster"]
        argo["Argo CD RBAC: one admin, two read-only, default none"]
        apps["dev and prod namespaces"]
        irsa["IRSA roles: app pods (table, API key, key), LB controller, External Secrets (two secrets)"]
    end
    people --> argo
    argo -- "AppProject: one repo, dev and prod namespaces only, no cluster-scoped objects" --> apps
```

References: EXC-004 (the plan role trusts pull requests), EXC-005 and SEC-018 (public endpoint), EXC-006 and SEC-019 (the apply role is cluster admin), SEC-029 (operator access entry). The operator IAM user has a long-lived access key and no MFA (Prowler triage N2). The deploy-dev and deploy-prod IAM roles are unused since 2026-10-15; their EKS access was removed 2026-10-18 (#151, applied), and the roles remain until deleted by hand.
