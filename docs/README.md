# Docs index

Everything under `docs/`, grouped by purpose, one line each. The project overview is in the [top-level README](../README.md). File names use topic names; the phase numbers used in older text are explained in the [phase map](phase-map.md).

## Architecture and history
- [architecture.md](architecture.md): three diagrams of the AWS architecture, the CI/CD flow and the access model.
- [phase-map.md](phase-map.md): the numbered phases, what the tracked repo records for each, and the gaps (Phases 5 and 6 are not recorded).

## Bootstrap and policies
- [bootstrap.md](bootstrap.md): the one-time manual setup: roles, environments, rulesets, the secret value.
- [bootstrap-policies/README.md](bootstrap-policies/README.md): the CI role policies, how to apply them, and the wildcard review notes.
- [bootstrap-policies/plan-policy.json](bootstrap-policies/plan-policy.json): read-only policy for the plan role.
- [bootstrap-policies/apply-policy.json](bootstrap-policies/apply-policy.json): project-scoped write policy for the apply role.
- [bootstrap-policies/deploy-dev-policy.json](bootstrap-policies/deploy-dev-policy.json): deploy role for the dev namespace.
- [bootstrap-policies/deploy-prod-policy.json](bootstrap-policies/deploy-prod-policy.json): deploy role for the prod namespace.

## Security
- [security/controls.md](security/controls.md): every control by layer, with its status, owner ID, evidence and source line.
- [security/commit-message-check.md](security/commit-message-check.md): the pull request check that blocks co-author and attribution lines in commit messages, how to set `ALLOWED_COAUTHOR`, how to fix a failing commit.
- [security/improvement-log.md](security/improvement-log.md): one entry per security change (SEC IDs), with before and after evidence.
- [security/exceptions-register.md](security/exceptions-register.md): every accepted risk (EXC IDs) with owner and expiry.
- [security/prowler-triage.md](security/prowler-triage.md): the 2026-10-10 Prowler scan triaged against the register.
- [security/triage-process.md](security/triage-process.md): who owns findings and the proposed response times.
- [security/rbac-review.md](security/rbac-review.md): IAM and Kubernetes RBAC review tables (not filled in).
- [security/findings-report.md](security/findings-report.md): outline of the final findings report plus early control notes.
- Raw scan evidence is under [`evidence/security/`](../evidence/security/).

## Runbooks
- [runbooks/argocd-bootstrap.md](runbooks/argocd-bootstrap.md): installing Argo CD, metrics-server and External Secrets on Fargate, and how the GitHub App credential reaches Argo.
- [runbooks/argocd-github-app-rotation.md](runbooks/argocd-github-app-rotation.md): rotating the GitHub App private key that Argo CD uses, synced by External Secrets.
- [runbooks/gitops-deploy.md](runbooks/gitops-deploy.md): how an image reaches dev and prod through Argo CD, the prod approval, rollback with `git revert`, forcing a sync.
- [runbooks/cluster-access.md](runbooks/cluster-access.md): checks that the cluster, Fargate, namespaces and roles are as designed.
- [runbooks/deploy-check.md](runbooks/deploy-check.md): what to check after a deploy: pods, `/ready`, the load balancer, HTTPS, pod security groups, rollback.
- [runbooks/detective-controls.md](runbooks/detective-controls.md): Security Hub, GuardDuty and CloudTrail: enable order, imports, the destructive plan guard, known gaps.
- [runbooks/eks-operator-import.md](runbooks/eks-operator-import.md): how the operator's read-only cluster access was brought under Terraform.
- [runbooks/failed-deploy.md](runbooks/failed-deploy.md): known failure messages and what they mean.
- [runbooks/rotation.md](runbooks/rotation.md): API key rotation and what to do after one.

## Cost
- [cost/budget.md](cost/budget.md): the $75 monthly budget: scope and tag, status, what the filter does not count, estimates and rules.

## Talk
- [security/talk/presentation-facts.md](security/talk/presentation-facts.md): the plain facts behind the presentation, each with its source.
