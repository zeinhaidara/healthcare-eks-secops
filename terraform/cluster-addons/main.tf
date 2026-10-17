# Looked up by tag and name, never by ID.
data "aws_vpc" "this" {
  tags = {
    Name = var.name_prefix
  }
}

data "aws_iam_role" "lb_controller" {
  name = "${var.name_prefix}-lb-controller"
}

# App namespaces, enforced at Pod Security "restricted".
resource "kubernetes_namespace_v1" "app" {
  for_each = toset(var.app_namespaces)

  metadata {
    name = each.key
    labels = {
      "pod-security.kubernetes.io/enforce"         = "restricted"
      "pod-security.kubernetes.io/enforce-version" = "latest"
      "pod-security.kubernetes.io/audit"           = "restricted"
      "pod-security.kubernetes.io/audit-version"   = "latest"
      "pod-security.kubernetes.io/warn"            = "restricted"
      "pod-security.kubernetes.io/warn-version"    = "latest"
    }
  }
}

# AWS Load Balancer Controller on Fargate: no instance metadata, so region and VPC are set
# explicitly, and targets are IPs (Fargate supports only IP targets).
resource "helm_release" "lb_controller" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  version    = var.lbc_chart_version
  namespace  = "kube-system"
  atomic     = true
  wait       = true
  timeout    = 600

  values = [yamlencode({
    clusterName       = var.cluster_name
    region            = var.aws_region
    vpcId             = data.aws_vpc.this.id
    defaultTargetType = "ip"
    image = {
      tag = var.lbc_image_tag
    }
    serviceAccount = {
      create = true
      name   = "aws-load-balancer-controller"
      annotations = {
        "eks.amazonaws.com/role-arn" = data.aws_iam_role.lb_controller.arn
      }
    }
  })]
}

# Security groups for pods on Fargate (closes EXC-007 once the smoke test proves attachment).
# Owned here, not by the chart: the deploy roles use AmazonEKSEditPolicy, which has no rule for the
# vpcresources.k8s.aws API group. The apply role (cluster admin, behind the infra approval) creates
# these. The groups are found by name in the project VPC and from the cluster, never by ID.
data "aws_security_group" "pods" {
  for_each = toset(var.app_namespaces)

  name   = "${var.name_prefix}-pods-${each.key}"
  vpc_id = data.aws_vpc.this.id
}

locals {
  # Must match the chart's selector labels (helm/healthcare-api/templates/_helpers.tpl):
  # app.kubernetes.io/name is the chart name and app.kubernetes.io/instance is the release name.
  app_selector_labels = {
    "app.kubernetes.io/name"     = var.app_name
    "app.kubernetes.io/instance" = var.app_name
  }
  cluster_security_group_id = data.aws_eks_cluster.this.vpc_config[0].cluster_security_group_id
}

# Pods created after this policy get the groups; running pods need a restart to pick them up.
# The pod group comes first, then the cluster group, which Fargate pods need to reach the control
# plane (https://repost.aws/knowledge-center/eks-configure-fargate-pod-security-group).
resource "kubernetes_manifest" "security_group_policy" {
  for_each = toset(var.app_namespaces)

  manifest = {
    apiVersion = "vpcresources.k8s.aws/v1beta1"
    kind       = "SecurityGroupPolicy"
    metadata = {
      name      = var.app_name
      namespace = each.key
      labels    = local.app_selector_labels
    }
    spec = {
      podSelector = {
        matchLabels = local.app_selector_labels
      }
      securityGroups = {
        groupIds = [
          data.aws_security_group.pods[each.key].id,
          local.cluster_security_group_id,
        ]
      }
    }
  }

  depends_on = [kubernetes_namespace_v1.app]
}

# ---------- metrics-server (kubectl top, and the HPA when it is enabled) ----------
# Runs on Fargate in kube-system; the values file moves it off port 10250, which Fargate reserves.
resource "helm_release" "metrics_server" {
  name       = "metrics-server"
  repository = "https://kubernetes-sigs.github.io/metrics-server/"
  chart      = "metrics-server"
  version    = var.metrics_server_chart_version
  namespace  = "kube-system"
  atomic     = true
  wait       = true
  timeout    = 600

  values = [file("${path.module}/values/metrics-server.yaml")]
}

# ---------- Argo CD ----------
# The UI is an internet-facing ALB at argocd.<domain>, behind the wildcard certificate and a TLS 1.2+ policy,
# with no CIDR allowlist. Sign-in is GitHub through Argo's built-in Dex, and the local admin login is off
# (admin.enabled below; docs/runbooks/gitops-deploy.md). argocd-server runs plain HTTP behind the ALB
# (server.insecure); the ALB ends TLS. Host, certificate and the OAuth credential come from variables, the
# certificate lookup and the Secret below, so none is committed.
locals {
  argocd_host    = "argocd.${var.domain_name}"
  argocd_lb_name = "${var.project_name}-argocd"
  argocd_sso_k8s = "argocd-github-sso" # the Kubernetes Secret External Secrets builds for Dex
  argocd_rbac_csv = join("\n", concat(
    [for user, role in var.argocd_rbac : "g, ${user}, ${role}"],
    [""],
  ))
}

# Argo has no AWS role. It reads Git as a GitHub App; the Secret "healthcare-repo" is built by External
# Secrets below (docs/runbooks/argocd.md). It deploys with the in-cluster RBAC from its own
# install. The "argocd" Fargate profile is created in the root.
resource "kubernetes_namespace_v1" "argocd" {
  metadata {
    name = "argocd"
    labels = {
      "pod-security.kubernetes.io/enforce" = "baseline"
      "pod-security.kubernetes.io/audit"   = "restricted"
      "pod-security.kubernetes.io/warn"    = "restricted"
    }
  }
}

resource "helm_release" "argocd" {
  name       = "argocd"
  repository = "https://argoproj.github.io/argo-helm"
  chart      = "argo-cd"
  version    = var.argocd_chart_version
  namespace  = kubernetes_namespace_v1.argocd.metadata[0].name
  atomic     = true
  wait       = true
  timeout    = 900

  values = [
    file("${path.module}/values/argocd.yaml"),
    yamlencode({
      global = { domain = local.argocd_host }
      configs = {
        cm = {
          url             = "https://${local.argocd_host}"
          "admin.enabled" = "false"
          # Dex with a GitHub connector. The client ID and secret are read from the Kubernetes Secret
          # built by External Secrets ($<secret>:<key>); no value is written here. No orgs or teams: the
          # repo is on a personal account, so access is by GitHub username in the RBAC below.
          "dex.config" = yamlencode({
            connectors = [{
              type = "github"
              id   = "github"
              name = "GitHub"
              config = {
                clientID     = format("$%s:dex.github.clientID", local.argocd_sso_k8s)
                clientSecret = format("$%s:dex.github.clientSecret", local.argocd_sso_k8s)
              }
            }]
          })
        }
        params = { "server.insecure" = true }
        rbac = {
          "policy.default" = "role:none"
          "policy.csv"     = local.argocd_rbac_csv
          # Dex puts the GitHub login in the preferred_username claim; match the users on it.
          scopes = "[groups, preferred_username]"
        }
      }
      server = {
        ingress = {
          enabled          = true
          ingressClassName = "alb"
          hostname         = local.argocd_host
          annotations = {
            "alb.ingress.kubernetes.io/scheme"             = "internet-facing"
            "alb.ingress.kubernetes.io/target-type"        = "ip"
            "alb.ingress.kubernetes.io/listen-ports"       = jsonencode([{ HTTP = 80 }, { HTTPS = 443 }])
            "alb.ingress.kubernetes.io/ssl-redirect"       = "443"
            "alb.ingress.kubernetes.io/certificate-arn"    = data.aws_acm_certificate.wildcard.arn
            "alb.ingress.kubernetes.io/ssl-policy"         = "ELBSecurityPolicy-TLS13-1-2-2021-06"
            "alb.ingress.kubernetes.io/healthcheck-path"   = "/healthz"
            "alb.ingress.kubernetes.io/load-balancer-name" = local.argocd_lb_name
            "alb.ingress.kubernetes.io/tags"               = "Project=${var.project_name}"
          }
        }
      }
    }),
  ]

  # The OAuth credential Secret and the repository Secret are made first, so Dex finds them at start-up.
  depends_on = [helm_release.argocd_repo_secret]
}

# ---------- Argo CD DNS ----------
# The ALB is created by the load balancer controller after the Ingress exists, so the record has to wait
# for it. The tag lookup finds no ALB on the first apply (count 0, nothing to create); once the controller has
# made it, the next plan finds it, the name lookup reads its address, and the alias record is created.
data "aws_lbs" "argocd" {
  tags = {
    "elbv2.k8s.aws/cluster" = var.cluster_name
    "ingress.k8s.aws/stack" = "argocd/argocd-server"
  }
}

data "aws_lb" "argocd" {
  count = length(data.aws_lbs.argocd.arns) > 0 ? 1 : 0
  name  = local.argocd_lb_name
}

resource "aws_route53_record" "argocd" {
  count = length(data.aws_lb.argocd)

  zone_id = var.route53_zone_id
  name    = local.argocd_host
  type    = "A"

  alias {
    name                   = data.aws_lb.argocd[0].dns_name
    zone_id                = data.aws_lb.argocd[0].zone_id
    evaluate_target_health = true
  }
}

# ---------- app ServiceAccounts (IRSA) ----------
# Terraform owns the ServiceAccount and its role annotation; the chart refers to it by name and never
# sets a role ARN. The role is created in the root (module.irsa_app) and looked up by name here.
locals {
  app_env_namespaces = {
    dev  = var.app_namespaces[0]
    prod = var.app_namespaces[1]
  }
}

data "aws_iam_role" "app" {
  for_each = local.app_env_namespaces

  name = "${var.name_prefix}-app-${each.key}"
}

resource "kubernetes_service_account_v1" "app" {
  for_each = local.app_env_namespaces

  metadata {
    name      = var.app_name
    namespace = each.value
    annotations = {
      "eks.amazonaws.com/role-arn" = data.aws_iam_role.app[each.key].arn
    }
  }

  # The IRSA webhook adds its own projected token; the default API token is not needed.
  automount_service_account_token = false

  depends_on = [kubernetes_namespace_v1.app]
}

# ---------- External Secrets Operator (GitHub App and GitHub sign-in credentials for Argo CD) ----------
# Argo CD reads this repo as a GitHub App. The App ID, installation ID and private key exist only in
# the Secrets Manager secret var.github_app_secret_name (created by hand). External Secrets copies
# them into the Secret "healthcare-repo" in the argocd namespace. The GitHub OAuth App credential for
# sign-in (var.argocd_sso_secret_name, also by hand) is copied the same way into the Secret
# "argocd-github-sso", which Dex reads. Nothing about either is in Git.
resource "kubernetes_namespace_v1" "external_secrets" {
  metadata {
    name = "external-secrets"
    labels = {
      "pod-security.kubernetes.io/enforce" = "baseline"
      "pod-security.kubernetes.io/audit"   = "restricted"
      "pod-security.kubernetes.io/warn"    = "restricted"
    }
  }
}

data "aws_iam_openid_connect_provider" "cluster" {
  url = data.aws_eks_cluster.this.identity[0].oidc[0].issuer
}

# Found by name; the ARN never appears in Git.
data "aws_secretsmanager_secret" "github_app" {
  name = var.github_app_secret_name
}

data "aws_secretsmanager_secret" "argocd_sso" {
  name = var.argocd_sso_secret_name
}

data "aws_iam_policy_document" "external_secrets" {
  statement {
    sid       = "ReadArgoGithubApp"
    actions   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
    resources = [data.aws_secretsmanager_secret.github_app.arn]
  }

  statement {
    sid       = "ReadArgoGithubSso"
    actions   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
    resources = [data.aws_secretsmanager_secret.argocd_sso.arn]
  }
}

# Trust is pinned to the cluster's OIDC provider and the service account external-secrets/external-secrets.
module "irsa_external_secrets" {
  source = "../modules/irsa"

  name              = "${var.name_prefix}-external-secrets"
  oidc_provider_arn = data.aws_iam_openid_connect_provider.cluster.arn
  oidc_issuer       = replace(data.aws_eks_cluster.this.identity[0].oidc[0].issuer, "https://", "")
  namespace         = kubernetes_namespace_v1.external_secrets.metadata[0].name
  service_account   = "external-secrets"
  policy_json       = data.aws_iam_policy_document.external_secrets.json
}

resource "helm_release" "external_secrets" {
  name       = "external-secrets"
  repository = "https://charts.external-secrets.io"
  chart      = "external-secrets"
  version    = var.external_secrets_chart_version
  namespace  = kubernetes_namespace_v1.external_secrets.metadata[0].name
  atomic     = true
  wait       = true
  timeout    = 900

  values = [
    file("${path.module}/values/external-secrets.yaml"),
    yamlencode({
      serviceAccount = {
        annotations = {
          "eks.amazonaws.com/role-arn" = module.irsa_external_secrets.role_arn
        }
      }
    }),
  ]
}

# ClusterSecretStore and ExternalSecret are custom resources whose CRDs the release above installs.
# kubernetes_manifest needs the CRD at plan time, so they are delivered by a small local chart:
# Helm only needs the CRD when it installs, which is after helm_release.external_secrets is ready.
resource "helm_release" "argocd_repo_secret" {
  name      = "argocd-repo-secret"
  chart     = "${path.module}/charts/argocd-repo-secret"
  namespace = kubernetes_namespace_v1.argocd.metadata[0].name
  atomic    = true
  wait      = true
  timeout   = 300

  values = [yamlencode({
    region     = var.aws_region
    secretName = var.github_app_secret_name
    repoUrl    = var.argocd_repo_url
    sso = {
      secretName = var.argocd_sso_secret_name
      k8sName    = local.argocd_sso_k8s
    }
  })]

  # After the IAM policy that lets External Secrets read both secrets. Argo CD itself waits for this release.
  depends_on = [helm_release.external_secrets, module.irsa_external_secrets]
}

# ---------- GitOps: AppProject and the dev and prod Applications ----------
# CI builds, scans and pushes the image, then commits the new tag and digest straight to the environment
# values files on dev. Argo CD deploys from Git. dev tracks the dev branch and syncs automatically;
# prod tracks main and syncs only when someone approves in Argo CD. The Applications are delivered by
# a local chart for the same CRD-ordering reason as the repo credential above. Values that depend on the
# AWS account are looked up here and passed as Application parameters, so they live in the cluster and
# never in Git.
data "aws_ecr_repository" "app" {
  name = var.ecr_repository
}

data "aws_acm_certificate" "wildcard" {
  domain      = "*.${var.domain_name}"
  statuses    = ["ISSUED"]
  most_recent = true
}

resource "helm_release" "argocd_apps" {
  name      = "argocd-apps"
  chart     = "${path.module}/charts/argocd-apps"
  namespace = kubernetes_namespace_v1.argocd.metadata[0].name
  atomic    = true
  wait      = true
  timeout   = 300

  values = [yamlencode({
    repoUrl = var.argocd_repo_url
    environments = [
      { name = "dev", namespace = var.app_namespaces[0], branch = "dev", automated = true },
      { name = "prod", namespace = var.app_namespaces[1], branch = "main", automated = false },
    ]
    chartParameters = {
      "image.repository"       = data.aws_ecr_repository.app.repository_url
      "ingress.certificateArn" = data.aws_acm_certificate.wildcard.arn
      "ingress.projectTag"     = var.project_name
      "networkPolicy.vpcCidr"  = data.aws_vpc.this.cidr_block
      "env.apiKeySecretName"   = "${var.name_prefix}-api-key"
    }
  })]

  depends_on = [
    helm_release.argocd,
    kubernetes_namespace_v1.app,
    kubernetes_service_account_v1.app,
  ]
}
