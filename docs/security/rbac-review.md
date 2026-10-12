# IAM and Kubernetes RBAC review

> **Template.** The tables below are empty. No before-review or after-review permissions were recorded here. The review it was meant for (Phases 2 to 5) is not recorded in tracked docs; see `docs/phase-map.md`.

Status: skeleton. Filled during Phases 2 to 5. Record permissions found before review, the tightened result, and the diff.

## IAM
| Role | Before review | After review | Notes |
|---|---|---|---|
| plan | | | |
| apply | | | |
| ecr-push | | | |
| deploy-dev | | | |
| deploy-prod | | | |
| app IRSA (per namespace) | | | |
| ALB controller IRSA | | | |

## Kubernetes RBAC
| Subject | Scope | Before | After |
|---|---|---|---|
| deploy-dev access entry | namespace dev | | |
| deploy-prod access entry | namespace prod | | |
