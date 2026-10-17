# Architecture

Three views: the AWS architecture, the CI/CD flow and the access model. Mermaid, rendered by GitHub. Region us-east-2.

## 1. AWS architecture

```mermaid
flowchart TB
    users["Users (HTTPS)"]
    dns["Route 53 records and ACM certificate"]

    subgraph vpc["VPC, us-east-2"]
        subgraph pub["Public subnets"]
            alb["ALB per environment, internet-facing, HTTPS"]
            argoalb["ALB for the Argo CD UI at argocd.<domain>, internet-facing, HTTPS, GitHub sign-in"]
            nat["NAT gateway (one)"]
        end
        subgraph priv["Private subnets"]
            subgraph eks["EKS cluster on Fargate"]
                lbc["kube-system: AWS Load Balancer Controller"]
                appdev["dev namespace: healthcare-api pods"]
                appprod["prod namespace: healthcare-api pods"]
                argocdns["argocd namespace: Argo CD"]
            end
            rot["Rotation Lambda"]
        end
        flow["VPC flow logs"]
    end

    ecr["ECR repository (immutable tags, scan on push)"]
    ddb["DynamoDB patients table (synthetic data)"]
    sm["Secrets Manager: API key"]
    kms["KMS project key"]
    cwl["CloudWatch Logs"]

    subgraph det["Detective controls"]
        trail["CloudTrail, single region"]
        trailbucket["S3 trail bucket and access-log bucket"]
        sns["SNS topic (no subscriber yet)"]
        gd["GuardDuty: S3 data events, EKS audit logs"]
        sh["Security Hub: FSBP standard"]
    end

    users --> dns --> alb
    alb --> appdev
    alb --> appprod
    lbc -. "manages" .-> alb
    dns --> argoalb --> argocdns
    lbc -. "manages" .-> argoalb
    appdev -- "IRSA, read only, via NAT" --> ddb
    appprod -- "IRSA, read only, via NAT" --> ddb
    appdev -- "IRSA, read secret, via NAT" --> sm
    appprod -- "IRSA, read secret, via NAT" --> sm
    ecr -- "image pinned by digest" --> appdev
    ecr -- "image pinned by digest" --> appprod
    rot -- "rotates every 30 days" --> sm
    priv -- "outbound" --> nat
    flow --> cwl
    trail --> trailbucket
    trail --> cwl
    trail --> sns
    gd --> sh
    kms -. "encrypts" .-> ddb
    kms -. "encrypts" .-> sm
    kms -. "encrypts" .-> ecr
    kms -. "encrypts" .-> cwl
    kms -. "encrypts" .-> trailbucket
```

Network path: pods reach DynamoDB and Secrets Manager through the single NAT gateway, because no VPC endpoints are built. The per-namespace pod security groups are created in `terraform/modules/eks/main.tf`; only the `SecurityGroupPolicy` that attaches them is owned by `terraform/cluster-addons` (SEC-032). The EKS API endpoint stays public (EXC-005).

References: SEC-001, SEC-002 (network and flow logs), SEC-021, SEC-030, SEC-032 (pod isolation and Pod Security), SEC-003, SEC-027, SEC-034 (rotation), SEC-022, SEC-023 (read-only seeded table), SEC-035 to SEC-037 (detective controls). The access-log bucket uses SSE-S3, not the project key (EXC-014). AWS Config, WAF and Inspector are not part of the stack (deferred, see the README).

### Availability: single NAT gateway

One NAT gateway in `us-east-2a` serves both private subnets, which share one private route table (`terraform/modules/network/main.tf`). It is one gateway for cost. If that AZ fails, outbound calls to DynamoDB, Secrets Manager, KMS and ECR fail for pods in both AZs. The table and the secret themselves stay available, because both are regional services. The risk is accepted as EXC-015.

Planned fixes, not built (no Terraform exists for any of them): a second NAT gateway with its own private route table per AZ, a DynamoDB gateway endpoint, and interface endpoints for Secrets Manager, KMS, STS, ECR and CloudWatch Logs.

## 2. CI/CD flow

```mermaid
flowchart LR
    feat["feature branch"]
    prdev["PR into dev"]
    devbr["dev branch"]
    prmain["PR dev into main"]
    mainbr["main branch"]
    ci["ci.yml: tests, lint, Trivy, Checkov, CodeQL, Sonar, gitleaks, image build and scan, report-only scans (no AWS access)"]

    feat --> prdev --> devbr --> prmain --> mainbr
    prdev -. "runs" .-> ci
    prmain -. "runs" .-> ci

    subgraph cd["cd.yml (push to dev changing app, or a manual run)"]
        build["build and Trivy image scan, no credentials"]
        push["push to ECR by commit SHA, ECR push role"]
        bump["bump-image: commits the image tag and digest to dev"]
        build --> push --> bump
    end
    devbr --> build
    bump --> devbr

    subgraph argo["Argo CD in the cluster, no AWS role"]
        adev["healthcare-api-dev: tracks dev, automatic sync"]
        aprod["healthcare-api-prod: tracks main, sync approved by hand"]
    end
    devbr -. "deploys from Git" .-> adev
    mainbr -. "deploys from Git" .-> aprod

    subgraph tf["terraform-apply.yml (manual, no inputs)"]
        plan["tf-plan: plan role, read only"]
        guard{"destructive plan guard"}
        gate{"infra approval"}
        apply["tf-apply: apply role, applies the reviewed plan"]
        addons["addons-plan and addons-apply: infra approval"]
        plan --> guard
        guard -- "pass" --> gate
        guard -- "delete or replace of bucket, key or table" --> blocked["job fails, no plan artifact"]
        gate --> apply --> addons
    end
    operator["Operator"] -- "workflow_dispatch" --> plan
```

`terraform-destroy.yml` is separate: manual, no inputs, behind its own `infra-destroy` approval. Environment approvals are configured by hand in GitHub (documented in [security/controls.md](security/controls.md)). Deploys come from Git through Argo CD; no workflow runs Helm or kubectl against the cluster ([runbooks/gitops-deploy.md](runbooks/gitops-deploy.md)). References: SEC-011 (ci and cd split), SEC-031 (deploy by digest), SEC-037 (destructive plan guard), EXC-003 (0 required approvals on `main`).

## 3. Access model

```mermaid
flowchart LR
    subgraph gha["GitHub Actions, OIDC, no stored AWS keys"]
        jplan["tf-plan"]
        japply["tf-apply, tf-destroy, addons jobs"]
        jpush["cd push"]
    end

    planrole["Plan role: read only, no cluster access"]
    applyrole["Apply role: project-scoped write"]
    pushrole["ECR push role"]
    operator["Operator IAM user: read only"]
    argo["Argo CD: in-cluster RBAC, no AWS role"]
    people["People: GitHub sign-in, RBAC by username"]

    jplan --> planrole
    japply -- "infra or infra-destroy approval" --> applyrole
    jpush --> pushrole

    subgraph eksapi["EKS API endpoint: public 0.0.0.0/0 and private (EXC-005)"]
        authn["Authentication mode API, access entries only, no creator admin"]
        admin["AmazonEKSClusterAdminPolicy, cluster scope"]
        view["AmazonEKSViewPolicy, cluster scope"]
    end

    applyrole -- "EXC-006" --> admin
    operator -- "SEC-029" --> view
    pushrole --> ecr["ECR repository"]
    planrole --> awsread["AWS read APIs"]
    people --> argo
    argo -- "AppProject: dev and prod namespaces only" --> apps["App namespaces"]
```

References: EXC-004 (plan role trust for pull requests), EXC-005 and SEC-018 (public endpoint), EXC-006 and SEC-019 (apply role is cluster admin), SEC-029 (operator access entry). The operator IAM user has a long-lived access key and no MFA (Prowler triage N2). The old deploy-dev and deploy-prod roles are unused.
