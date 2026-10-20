# Docs index

> Torn down on 2026-10-20. The diagrams and commands describe the platform as it was built; the teardown and rebuild path is in docs/runbooks/teardown.md.

Everything under `docs/`, one line each. The project overview is in the [top-level README](../README.md).

## Start here
- [architecture.md](architecture.md): diagrams of the AWS stack, the CI/CD flow and the access model.
- [bootstrap.md](bootstrap.md): one-time setup by hand: roles, GitHub rulesets and environments, the API key value.
- [bootstrap-policies/](bootstrap-policies/README.md): the CI role policies, how to apply them, and the remaining wildcards.

## Runbooks
- [gitops-deploy.md](runbooks/gitops-deploy.md): how an image reaches dev and prod, rollback, and checking a deploy.
- [argocd.md](runbooks/argocd.md): Argo CD install, sign-in, the repo credential, and both key rotations.
- [rotation.md](runbooks/rotation.md): API key rotation and what to do after one.
- [cluster-access.md](runbooks/cluster-access.md): checks that the cluster, Fargate, namespaces and roles are as designed.
- [failed-terraform-run.md](runbooks/failed-terraform-run.md): known Terraform failures by log line.
- [detective-controls.md](runbooks/detective-controls.md): CloudTrail, GuardDuty, Security Hub and the destructive plan guard.
- [security-scans.md](runbooks/security-scans.md): report-only scans (tflint, Kubescape, pip-audit, ZAP) and their latest results.
- [eks-operator-import.md](runbooks/eks-operator-import.md): the operator's read-only EKS access entry.
- [teardown.md](runbooks/teardown.md): the two-stage destroy, unlocking a stuck state, the 2026-10-20 teardown record and the manual cleanup list.

## Security records
- [controls.md](security/controls.md): every control by layer, with status and evidence.
- [exceptions-register.md](security/exceptions-register.md): accepted risks (EXC IDs) with owner and expiry.
- [improvement-log.md](security/improvement-log.md): one entry per security change (SEC IDs), with before and after evidence.
- [triage-process.md](security/triage-process.md): how a finding is fixed, accepted or deferred.
- [prowler-triage.md](security/prowler-triage.md): the 2026-10-10 Prowler scan, triaged.
- Raw scan output: [`evidence/security/`](../evidence/security/).

## Cost
- [budget.md](cost/budget.md): pod inventory, measured spend, the run-rate estimate, cost levers and the $75 budget.
