# Presentation: a secured path from code to cloud

Audience: executives and stakeholders. 10 minutes plus questions. Status at 2026-10-18. The deck is `presentation/healthcare-eks-secops-exec.pptx` (local, gitignored). Every number comes from [presentation-facts.md](presentation-facts.md).

Speaker rules:
- Say the data is synthetic. Make no HIPAA or compliance claim.
- Say "gated by automated checks", not "reviewed": `main` requires 0 approvals.
- Say *estimated* out loud where a number is estimated.

---

## 1. Hook and problem

- **Hook A:** "A health app is one leaked key away from a headline."
- **Hook B (chosen):** "Shipping a healthcare app takes a weekend. Shipping it safely, every time, takes a platform." It frames the achievement and promises nothing we can't prove.

**Headline:** A small patient-records app, delivered through a platform where every change is scanned and every production release is gated

- A read-only patient lookup API with a browser front end
- All patient data is synthetic: no real people, no PHI
- Writing the app is quick; shipping every change safely is the hard part
- This talk is about the platform

**Notes (50 s):** This is a small healthcare app. A clinician looks up a patient record. It only reads data, and every record is made up. Writing an app like this is quick. Running it safely is not. Any change could leak a secret, ship a vulnerable library or open the network. So the real work is the platform behind the app. Every change is scanned. Every production release is gated. Every accepted risk has an owner and an expiry date.

**Proof:** read-only API, SEC-022 (`docs/security/improvement-log.md:242`); synthetic data, SEC-026 (`improvement-log.md:282`).
**Visual:** a small "App" block on a large "Platform" block (scans, gates, GitOps, audit).
**If longer:** a 30-second demo on dev.

## 2. One path to production

**Headline:** App changes reach production by one route: Git, automated checks, then an approved sync

- 10 checks are required on `main` today; the list is expected to grow
- 0 required approvals: one maintainer, accepted as EXC-003
- Deploys pin the image digest that passed the scan
- CI never runs Helm or kubectl against the cluster

**Notes (55 s):** There is one road to production. A developer opens a pull request into dev. CI runs tests and scanners. Ten checks must pass before anything merges to main, and that list will grow. A merge to dev builds the image, scans it and records its exact fingerprint in Git. Dev deploys itself from that. Prod gets the same image only after the release is merged and an admin approves the sync. Merges are gated by automated checks. There is no human review yet, because there is one maintainer.

**Proof:** 10 checks and 0 approvals (`docs/bootstrap.md:22-23`, EXC-003); digest pinning, SEC-031; prod sync by hand (`charts/argocd-apps/templates/applications.yaml:30-35`).
**Visual:** six-step flow: branch, PR, merge and build, dev auto-sync, release PR, prod approved sync.
**If longer:** a real PR checks panel.

## 3. Code and build scanning

**Headline:** Eight scanners check every change. Several have caught real problems we fixed

| Tool | Catches | Gate | Real example |
|---|---|---|---|
| Checkov | IaC, Dockerfile, workflow misconfig | Blocks merge | First Terraform scan 6 failed; now 388 passed, 0 failed |
| Trivy | Vulnerable packages, secrets, image CVEs | Blocks merge and push | Gate ignored its config; fixed, clearing 44 unfixable HIGH without an ignore file |
| SonarCloud | Quality and coverage | Blocks PRs | First gate failed on coverage and reliability; both fixed |
| gitleaks | Secrets in full history | Fails the job | The action skipped release merges; the CLI scans all 118 commits, no leaks |
| CodeQL | Security bugs | Blocks merge | 0 findings |
| Kubescape | Kubernetes settings | Report only | NSA: 1 failed control for the app, 5 for Argo CD |
| securitycontext-check | Pod settings Fargate rejects | Fails the job | Catches the setting that hung an Argo CD apply |
| tflint, pip-audit | Terraform lint, Python CVEs | Report only | 0 issues; no known vulnerabilities |

**Notes (60 s):** Each scanner looks for a different mistake. Gitleaks looks for secrets in the whole history. Trivy looks for vulnerable packages. CodeQL reads the code for security bugs. Checkov checks the infrastructure code. Kubescape checks Kubernetes settings. They found real things. Checkov failed six checks on our first scan, and we fixed them. Trivy was running the wrong rules until we caught it. Sonar blocked untested secret-rotation code until we added tests. Gitleaks was skipping release merges, so we changed how it runs.

**Proof:** SEC-001 (`improvement-log.md:32`), SEC-012 (`:142`), SEC-014 (`:163`), SEC-007 (`:92`); CI run 39098252945; `.github/workflows/ci.yml:262`; `docs/runbooks/security-scans.md:42-51`.
**Visual:** the table, with blocking and report-only tags.
**If longer:** SEC-012 before and after reports.

## 4. Deployment with GitOps

**Headline:** Argo CD deploys from Git: dev syncs itself, prod waits for an admin

- GitOps since 2026-10-15: Argo CD pulls from Git
- Dev syncs automatically; prod syncs only after an admin approves
- Sign-in is GitHub SSO only; the local admin login is off
- Three named users: one admin, two read-only. Everyone else sees nothing

**Notes (50 s):** We moved to GitOps on October fifteenth. Argo CD runs inside the cluster. It watches Git and makes the cluster match. The pipeline never touches the cluster. Dev updates itself. Prod never changes by itself: an admin reviews the difference and clicks sync. Signing in uses GitHub. There is no shared admin password. Roles come from GitHub usernames: one admin and two read-only users. Anyone not named sees nothing.

**Proof:** commit `2873e2c`; `applications.yaml:30-35`; admin off and default role none (`terraform/cluster-addons/main.tf:170,188`); users (`variables.tf:98-106`).
**Visual:** Git, then Argo CD in the cluster, then dev (auto) and prod (admin gate); a side card for SSO and RBAC.
**If longer:** the prod OutOfSync diff in the Argo UI.

## 5. Testing the running system

**Headline:** We attack and audit the live system too, and we write down what we find

- OWASP ZAP scans dev weekly: Medium findings went from 1 to 0, High stayed at 0
- Prowler (2026-10-10): 43 of 2,019 failures were ours, all triaged
- GuardDuty and Security Hub watch the account and cluster
- SEC-037: detected, diagnosed, repaired, guarded

**Notes (60 s):** We also test what is running. ZAP is an attack tool that scans dev every week. After we fixed our security headers, the Medium finding went away. Prowler audited the whole shared account on October tenth. Forty-three failures were on our resources, and each is triaged. And we had a real incident. A Terraform apply stripped the security settings from our audit log buckets. The failed apply exposed it, and GuardDuty recorded it. Nothing was made public. We found the cause, repaired it the same day, and added a guard that now blocks that kind of plan. No alert fired, because alert delivery is not built yet.

**Proof:** ZAP (`docs/runbooks/security-scans.md:29-40`); Prowler (`docs/security/prowler-triage.md:15,25-31`); SEC-037 (`improvement-log.md:434-477`, GuardDuty at `:467-472`).
**Visual:** ZAP before and after chart; Prowler callout; a four-step SEC-037 timeline.
**If longer:** the SEC-037 timeline in detail.

## 6. Infrastructure as code

**Headline:** Defined entirely as code. Teardown and rebuild are one workflow each, plus a short list of documented manual steps

- Two Terraform roots, built from reusable modules
- A read-only plan, then a person approves the apply
- A guard fails any plan that deletes a bucket, key or table
- Manual steps: two secrets, the API key value, the dev and prod DNS aliases

**Notes (50 s):** Nothing is built by clicking. It is all Terraform, in two parts: the base cloud resources and the cluster add-ons. Each run starts with a plan made by a role that can only read. A person approves the apply. A guard stops any plan that would delete storage, an encryption key or the database. That guard came from the incident. One workflow tears everything down and one builds it back. A few steps stay manual, and they are written down: the GitHub App key secret, the Argo CD sign-in secret, the API key value, and the dev and prod DNS aliases. We have not run the teardown yet, so a full drill is still to come.

**Proof:** `.github/workflows/terraform-apply.yml:32,93,131,172`; guard (`:67-71`); `terraform-destroy.yml:32`, no runs (checked 2026-10-18); manual steps (`docs/bootstrap.md`, Manual steps around a rebuild).
**Visual:** plan, guard, approval, apply, add-ons; a side loop "destroy, then rebuild".
**If longer:** a plan summary and the guard's failure message.

## 7. Infrastructure layout

**Headline:** Private by default, encrypted at rest, logged everywhere

- Pods run in private subnets on Fargate: no servers to patch
- HTTPS load balancers in front; one NAT for outbound
- One KMS key encrypts data, secrets, images and logs
- The API key rotates every 30 days; flow logs are kept 365 days

**Notes (55 s):** One network across two zones. The app runs on Fargate in private subnets, so there are no servers to patch. Traffic comes in through load balancers that only speak HTTPS. Outbound traffic leaves through one NAT gateway, a cost choice. One encryption key protects the database, the secrets, the images and the logs. The API key lives in Secrets Manager, and a small function replaces it every thirty days. Flow logs and CloudTrail record what happens.

**Proof:** `terraform/modules/network/main.tf:29-70,109-152`; `terraform/modules/eks/main.tf:38-62`; `terraform/modules/kms/main.tf:100-103`; `terraform/modules/secrets/variables.tf:20-22`; `terraform/modules/detective/main.tf:186-193`.
**Visual:** the AWS diagram from `docs/architecture.md`.
**If longer:** the single-NAT trade-off (EXC-015).

## 8. Identity and access

**Headline:** CI holds no stored cloud keys. Each job gets only the access it needs, and we remove access we stop using

- GitHub OIDC: short-lived roles per job
- Plan is read-only; apply needs an approval
- Argo CD sign-in is GitHub SSO only
- Removed: the break-glass read and the deploy roles' cluster access

**Notes (55 s):** The pipeline stores no cloud keys. Each job gets a short-lived token, and AWS trusts it for one role. The planning role can only read. The apply role can write, but only behind an approval. People reach Argo through GitHub sign-in. We also prune access. We removed a break-glass read that could see secrets. We removed cluster access for two old deploy roles once GitOps made them unused. One gap remains: the operator's own user still has a long-lived key and no MFA.

**Proof:** SEC-011 (`improvement-log.md:132`); EXC-006; #146; #151, applied 2026-10-18; Prowler N2.
**Visual:** access-by-context cards; removed paths crossed out.
**If longer:** the IRSA scoping for pods.

## 9. Cost

**Headline:** Always on, this costs about $11 a day. Destroyed between uses, it costs cents (estimate)

- Tagged spend this month: $46.12 (measured)
- Fargate adds about $5.60 a day (estimated)
- Biggest lever: destroy between uses. Smaller ones exist; none are done
- The $75 budget is below the run rate; alert delivery is unverified

**Notes (55 s):** Cost Explorer shows forty-six dollars of tagged spend so far this month. Most of it is the EKS control plane and the NAT gateway. Fargate, which runs the pods, is not in that number; it adds about five sixty a day, estimated. Always on, that is about eleven dollars a day, around three hundred thirty-five a month. Our budget is seventy-five. So always-on does not fit. Destroying between uses would, but we have not run the destroy yet. We also have not confirmed that budget alerts arrive.

**Proof:** `docs/cost/budget.md:31-47` (measured), `:49-61` (Fargate, estimated), `:63-70` (run rate), `:72-83` (levers), `:85-91` (budget).
**Visual:** native bar chart of tagged spend by service; callouts for Fargate and the run rate.
**If longer:** each lever with its trade-off.

## 10. Gaps, next, and the ask

**Headline:** The platform works. These gaps are known, owned and dated

- Run rate above the $75 budget; alert delivery unverified
- Apply role is cluster admin; operator user has no MFA
- Prowler N1 to N8 are proposals, not yet registered
- Ask: choose the cost model; add a second reviewer

**Notes (55 s):** Here is what is not done. The always-on run rate is above our budget, and we have not confirmed that alerts reach anyone. The role that applies Terraform is a full cluster admin. That is accepted, with an owner and an expiry. The operator's user has a long-lived key and no MFA. Prowler raised eight new items we have not registered yet. Next, we wire up alerts, run a destroy and rebuild drill, close the Prowler items and narrow the apply role. Two asks. Decide the cost model: destroy between uses, or fund the always-on cost. And give us a second reviewer, so merges are reviewed by a person, not only gated by checks.

**Proof:** `docs/security/controls.md` (open items); `prowler-triage.md:163-174`; `exceptions-register.md`.
**Visual:** three columns: known gaps, next, the ask.
**If longer:** how an exception gets closed.

---

## Appendix

**A. Tool matrix:** the table on slide 3, plus ZAP (weekly, report only), Prowler (manual, 2026-10-10), GuardDuty and Security Hub (runtime).

**B. Risk register:** 16 accepted risks (EXC-001 to EXC-016), EXC-007 closed, all owned by the single maintainer, expiring April 2027. EXC-005, EXC-012 and EXC-013 cite a destroy that has not run.

**C. Architecture detail:** `docs/architecture.md`.

**D. Likely questions**

1. **What does it cost?** About $11 a day always on, about $335 a month (estimated). Tagged spend this month is $46.12 (measured).
2. **Why is the budget below the run rate?** The $75 budget assumed the stack is destroyed between uses. That has not happened yet. Always-on needs a higher budget or the levers.
3. **Is it production ready?** Not for real data. The delivery platform works end to end, but it needs alert delivery, a second reviewer and the Prowler items closed first.
4. **Is it HIPAA compliant?** We make no compliance claim. The data is synthetic and no audit has been done.
5. **What is the biggest risk?** The apply role is a full cluster admin behind one approval. It is accepted with an expiry (EXC-006), and narrowing it is planned.
6. **What if something fails?** Prod changes only when an admin approves a sync. A plan that would delete storage, keys or the database is blocked. SEC-037 shows the repair path works.
7. **Would we know if we were attacked?** GuardDuty and CloudTrail record it. Nobody is paged yet, because alert delivery is not built. That is the first next step.
8. **Who can change production?** App changes need 10 passing checks and an admin-approved sync. Infrastructure changes need an approved Terraform run. Admins can bypass those approvals (EXC-003).
9. **How many people does this need?** One maintainer runs it today. A second reviewer is our ask, so changes get human review.
10. **Does it scale?** Pods run on Fargate, so there are no servers to add or patch. Scaling has not been load-tested.
11. **What was the DNS mix-up?** The prod hostname first pointed at the dev load balancer (SEC-033). An HTTPS check caught it, and it was repointed. Nothing checks it automatically yet.
12. **What happened to the Prowler highs?** Of the 15 high results on our resources (2026-10-10), 3 are covered by existing register entries and 2 are deferred to planned work. The other 10 are new items, N1 to N8, proposed but not yet in the register.
13. **Was any data exposed in the bucket incident?** No. All three GuardDuty findings showed NOT_PUBLIC, and the settings were restored the same day (SEC-037).
