# Findings report

Status: skeleton, completed in Phase 8. Controls are HIPAA-aligned, not HIPAA compliant.

1. Executive summary: findings before and after, headline numbers.
2. Scope and method: what was scanned, tool versions, how before and after were measured.
3. Per tool (Trivy, Checkov, Prowler, Security Hub, GuardDuty, Inspector, Config, WAF, Pod Security): what it is, where it runs, what it added, what it found, what it cannot see, findings only this tool caught.
4. Before/after summary table by tool and severity.
5. Control-to-evidence map: each control area linked to its log entries and evidence files (see `controls.md`).
6. Exceptions summary from `exceptions-register.md`.
7. Residual risk and what Tier 2 would add.
8. Lessons learned.

## Control notes collected so far (Phase 3)

- **Pod Security:** both app namespaces are labelled `restricted` for enforce, audit and warn (`terraform/cluster-addons/main.tf`). A privileged or root pod is rejected at admission; the rejection test is a Phase 4 evidence item.
- **IRSA scoping:** each app namespace has its own role, trusted only for `system:serviceaccount:<namespace>:healthcare-api` with audience `sts.amazonaws.com` (`StringEquals`). Permissions: read the patients table, read one secret, decrypt with one key. The controller role is trusted only for `kube-system/aws-load-balancer-controller`.
- **Cluster-admin exception:** the apply role is the only cluster admin, by explicit access entry (EXC-006). Deploy roles are namespace-scoped `AmazonEKSEditPolicy`. The plan role has no cluster access.
- **Fargate network isolation:** security groups for pods, not NetworkPolicy (SEC-021).
