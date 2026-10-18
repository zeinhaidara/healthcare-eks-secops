# Presentation: a secured path from code to cloud

Audience: executives and stakeholders. Slot: 10 minutes plus questions. Status at 2026-10-18.

Rules for the speaker:
- The data is synthetic. Say so on slide 1.
- Make no HIPAA or other compliance claim.
- Say "gated by automated checks", not "reviewed". `main` requires 0 approvals.
- Every number has a source. Numbers marked *estimated* or *unverified* must be said that way out loud.

---

## Slide 1. Hook and problem

**Hook A:** "A health app is one leaked key away from a headline. This one has no keys to leak in its pipeline."
**Hook B:** "Shipping a healthcare app takes a weekend. Shipping it safely, every time, takes a platform. That platform is what we built."

**Chosen: Hook B.** It frames the achievement, the platform, and it promises no outcome we cannot prove.

**Headline:** A small patient-records app, delivered through a platform where every change is scanned, gated and logged.

- A read-only patient lookup API with a browser front end.
- **All patient data is synthetic.** No real people, no PHI.
- The hard part is not the app. It is getting every change to production safely.
- What follows is that platform.

**Speaker notes (about 50 s):** This is a small healthcare app. A clinician looks up a patient record. It only reads data. Every record in it is made up. There is no real patient data anywhere. Writing an app like this is quick. Running it safely is not. Every change could leak a secret, ship a vulnerable library or open a hole in the network. So the real work here is the platform behind the app. Every change goes through automated scans and gates. Every deploy comes from Git. Every accepted risk has an owner and an expiry date. That is what I will show you.

**Proof:**
- Read-only API, write routes removed: SEC-022 (`docs/security/improvement-log.md:242`).
- 30 synthetic patient records: `app/data/patients.json`. Classification guard: SEC-026 (`improvement-log.md:282`).
- Endpoints: `app/src/main.py:130-173`.

**Visual:** One screenshot of the patient card next to a single line: "app small, platform large".

**If longer:** A 30-second live demo of the app on dev.

---

## Slide 2. One path to production

**Headline:** There is exactly one way to production, and it runs through Git.

- Feature branch, then a PR into `dev`, then a PR from `dev` into `main`.
- CI scans every PR. 10 checks are required on `main` today; the list is expected to grow.
- A merge to `dev` builds, scans and pushes one image, then deploys dev automatically.
- Prod gets the same image only after the release PR and an approved sync.

**Speaker notes (about 55 s):** There is one road to production. A developer opens a pull request into the dev branch. CI runs tests and security scans on it. Ten checks must pass before anything can merge to main. That list will grow. When code lands on dev, the pipeline builds the image once. It scans it. If it is clean, it pushes it and records the exact image fingerprint in Git. Dev deploys itself from that. Prod uses the very same image. Nothing is rebuilt. Prod moves only after the release is merged and an admin approves the sync. Merges are gated by automated checks. There is no human code review today, because there is one maintainer.

**Proof:**
- 10 required checks on `main`: `docs/bootstrap.md:21`.
- 0 required approvals, accepted risk: EXC-003 (`docs/security/exceptions-register.md:9`).
- Build once, bump digest: `.github/workflows/cd.yml:24,60,102`.
- Prod sync by hand: `terraform/cluster-addons/charts/argocd-apps/templates/applications.yaml:30-35`.

**Visual:** Left-to-right flow: branch, PR, CI gates, dev (auto), release PR, prod (approved sync). Reuse the CI/CD diagram in `docs/architecture.md`.

**If longer:** Show a real PR with its checks panel.

---

## Slide 3. Code and build scanning

**Headline:** Eight scanners check every change. Several have caught real problems we fixed.

- Secrets (gitleaks, Trivy), code (CodeQL, SonarCloud), dependencies (Trivy, pip-audit).
- Infrastructure and Kubernetes config (Checkov, tflint, Kubescape).
- Blocking gates stop a merge or a push. Report-only scans inform triage.
- Latest run: 0 failed Checkov checks, 0 leaks, 0 known vulnerable packages.

**Speaker notes (about 60 s):** Each scanner looks for a different kind of mistake. Gitleaks looks for secrets in the whole history. Trivy looks for vulnerable packages and secrets in the code and the image. CodeQL reads the code for security bugs. SonarCloud enforces a quality gate. Checkov checks Terraform, the Dockerfile and the workflows. Kubescape checks the Kubernetes settings. They found real things. Checkov failed six checks on our first Terraform scan. We fixed them. Trivy was quietly running the wrong rules. We found it and fixed the gate. Sonar blocked us for untested secret-rotation code. We added thirteen tests. Gitleaks was skipping release merges entirely. We switched to a setup that scans everything.

**Proof:**

| Tool | Catches | Gate | Real example |
|---|---|---|---|
| Checkov | IaC, Dockerfile, workflow misconfig | Blocking | First Terraform scan 62 passed, 6 failed (`evidence/security/checkov/before/terraform/summary.txt:5`). Example fix: pinned AZs, SEC-001 (`improvement-log.md:32-40`). Now 388 passed, 0 failed (CI run 39098252945) |
| Trivy | Vulnerable packages, secrets, image CVEs | Blocking | Gate ignored its config and failed on 44 unfixable HIGH; fixed to block fixable HIGH and CRITICAL only (SEC-012, `improvement-log.md:142-152`) |
| SonarCloud | Quality gate, coverage | Blocking on PRs | Coverage gate at 0% on rotation code; 13 Lambda tests added, 100% (SEC-014, `improvement-log.md:163-171`) |
| gitleaks | Secrets in full git history | Fails the job | The action skipped release merges; the CLI now scans all 118 commits, no leaks (`.github/workflows/ci.yml:262`, CI run 39098252945) |
| CodeQL | Code security bugs | Blocking at severity 7.0 | 0 findings (SEC-007, `improvement-log.md:92`) |
| Kubescape | Kubernetes security settings | Report only | Argo CD hardened: runAsGroup, CPU limits, no redis token (`docs/runbooks/security-scans.md:44`) |
| tflint, pip-audit | Terraform lint, Python CVEs | Report only | 0 issues; no known vulnerabilities (CI run 39098252945) |

**Visual:** The table above, with a green "blocking" or grey "report-only" tag per row.

**If longer:** Show the SEC-012 before and after reports side by side.

---

## Slide 4. Deployment with GitOps

**Headline:** App changes reach the cluster only through Git. The app pipeline holds no cluster credentials.

- Argo CD in the cluster pulls from Git. CI never runs `kubectl` or Helm.
- Dev syncs automatically, with self-heal. Prod syncs only when an admin approves.
- Sign-in is GitHub SSO only. The local admin login is off.
- Three named users: one admin, two read-only. Everyone else sees nothing.

**Speaker notes (about 50 s):** We moved to GitOps on October 15th. Argo CD runs inside the cluster. It watches Git and makes the cluster match. The pipeline never touches the cluster. If someone changes dev by hand, Argo puts it back. Prod never changes by itself. An admin looks at the difference and clicks sync. Signing in to Argo uses GitHub. There is no shared admin password. Roles come from GitHub usernames. One person is admin, two can only look. Anyone else who signs in sees nothing. A rollback is a Git revert.

**Proof:**
- Cutover commit `2873e2c`, 2026-10-15: `git log -- .github/workflows/cd.yml`.
- Dev automatic, prune and self-heal; prod manual: `applications.yaml:30-35`.
- Admin login off: `terraform/cluster-addons/main.tf:170`. Default role none: `main.tf:188`.
- RBAC map: `terraform/cluster-addons/variables.tf:98-106`.
- AppProject limits repo, namespaces and kinds: `charts/argocd-apps/templates/appproject.yaml`.

**Visual:** Diagram: Git on the left, Argo CD in the cluster pulling, dev auto arrow, prod arrow with a "human approves" gate.

**If longer:** Live: show the prod OutOfSync diff in the Argo UI.

---

## Slide 5. Testing the running system

**Headline:** We attack and audit the live system too, and we write down what we find.

- OWASP ZAP scans dev weekly. Header fixes took Medium findings from 1 to 0.
- Prowler audited the account: 43 failures on our resources, all triaged.
- GuardDuty and Security Hub watch the account and the cluster.
- A real incident: a bad apply stripped our log buckets' security settings. It was fixed and is now blocked.

**Speaker notes (about 60 s):** Scanning code is not enough. We also test what is running. ZAP is an attack tool. It scans dev every week. After we fixed our security headers, the one Medium finding went away. Prowler audits the whole cloud account. The account is shared, so most failures belonged to other teams. Forty-three were ours. Every one is triaged. GuardDuty watches for threats. Security Hub collects findings. And we had a real incident. A Terraform apply removed the security settings on our audit log buckets. The failed apply exposed it. GuardDuty recorded it. Nothing was made public. We repaired it the same day and added a guard that now blocks that kind of plan.

**Proof:**
- ZAP baseline, before and after: High 0 to 0, Medium 1 to 0, Low 5 to 1, Informational 4 to 4 (`docs/runbooks/security-scans.md:29-40`).
- Prowler: 7,686 results, 2,019 FAIL account-wide (`docs/security/prowler-triage.md:15`). 43 on this project: 0 critical, 15 high, 17 medium, 11 low (`prowler-triage.md:25-31`).
- Prowler dispositions, 58 critical and high checks: 3 covered, 3 expected and deferred, 10 new (N1 to N8), 32 out of scope (other workload), 10 out of scope (account owner) (`prowler-triage.md:160`).
- SEC-037 incident (`improvement-log.md:434-477`): GuardDuty raised 3 Low findings, effective permission NOT_PUBLIC (`:467-472`); guard added (`:449`); closed 2026-10-10 (`:477`).
- Security Hub FSBP has no control data until AWS Config exists (`docs/runbooks/detective-controls.md`).

**Visual:** Two-column table: ZAP before and after. Below it a Prowler funnel: 2,019, then 43, then 10 new items.

**If longer:** Walk the SEC-037 timeline minute by minute.

---

## Slide 6. Infrastructure as code

**Headline:** The whole environment is code. We tear it down and rebuild it, on purpose.

- Two Terraform roots, 11 reusable modules.
- Plan with a read-only role, then a human approves the apply.
- A guard fails any plan that would delete a bucket, key or table.
- Destroy after every session; rebuild from code.

**Speaker notes (about 50 s):** Nothing in the environment is built by clicking. It is all Terraform. There are two parts: the base cloud resources, and the cluster add-ons. Each run starts with a plan, made by a role that can only read. A person checks the plan and approves the apply. A guard stops any plan that would delete a storage bucket, an encryption key or the database. That guard exists because of the incident on the last slide. We destroy the whole stack after each working session and rebuild it from code. That saves money. It also proves we can rebuild from scratch.

**Proof:**
- Roots and modules: `terraform/`, `terraform/cluster-addons/`, `terraform/modules/` (11).
- Plan, apply, add-ons jobs: `.github/workflows/terraform-apply.yml:32,93,131,172`.
- Destructive plan guard: `terraform-apply.yml:67-71`.
- Destroy, behind its own approval: `.github/workflows/terraform-destroy.yml:32`.
- State in S3 with native locking: `terraform/backend.tf:1-9`.

**Visual:** Flow: plan (read-only) to guard to human approval to apply to add-ons, with a side loop "destroy, then rebuild".

**If longer:** Show a real plan summary and the guard's failure message.

---

## Slide 7. Infrastructure layout

**Headline:** Private by default, encrypted at rest, logged everywhere.

- Pods run in private subnets on Fargate: no servers to patch.
- HTTPS-only load balancers in front; one NAT for outbound.
- One KMS key encrypts data, secrets, images and logs.
- The API key rotates every 30 days; audit logs are kept 365 days.

**Speaker notes (about 55 s):** Here is the shape of it. One network, across two zones. The app runs on Fargate in private subnets. There are no servers for us to patch. Traffic comes in through load balancers that only speak HTTPS. Outbound traffic leaves through one NAT gateway. One encryption key protects the database, the secrets, the images and the logs. The API key lives in Secrets Manager. A small function replaces it every 30 days. The database is on demand and can be restored to a point in time. Network flow logs and CloudTrail record what happens, and we keep them for a year.

**Proof:**
- VPC, private subnets, no public IP on launch, one NAT: `terraform/modules/network/main.tf:29-70`.
- Flow logs, all traffic, 365 days: `network/main.tf:109-152`; `terraform/variables.tf:59`.
- Fargate profiles (5) and cluster settings: `terraform/modules/eks/main.tf:38-62,102-111`.
- HTTPS with redirect: `helm/healthcare-api/templates/ingress.yaml:10-16`. Argo UI TLS policy `ELBSecurityPolicy-TLS13-1-2-2021-06`: `cluster-addons/main.tf:205`. The app ALBs use the controller's default TLS policy (unverified which).
- KMS key with rotation: `terraform/modules/kms/main.tf:100-103`.
- 30-day rotation: `terraform/modules/secrets/variables.tf:20-22`; Lambda: `terraform/modules/secret-rotation/main.tf:131-165`.
- DynamoDB on demand with point-in-time recovery: `terraform/modules/dynamodb/main.tf:3,16`.
- CloudTrail single region with log validation: `terraform/modules/detective/main.tf:186-193`.

**Visual:** The AWS diagram from `docs/architecture.md`, section 1.

**If longer:** Explain the single-NAT trade-off (EXC-015) and its fix.

---

## Slide 8. Identity and access

**Headline:** No stored cloud keys. Each job gets only the access it needs, and we keep removing access we no longer use.

- GitHub OIDC: short-lived roles per job, no long-lived keys in CI.
- Plan is read-only; apply needs an approval; the image push can only push.
- App pods read only their table, their secret and the key.
- Removed in October: the operator's break-glass read and the old deploy roles' cluster access.

**Speaker notes (about 55 s):** The pipeline has no stored passwords for the cloud. Each job asks GitHub for a short-lived token, and AWS trusts that token for one role. The planning role can only read. The apply role can write, but only behind an approval. The image push role can only push images. Inside the cluster, the app can read its own table, its own secret and the key. Nothing else. People reach Argo through GitHub sign-in. We also prune access. We removed a break-glass read that could see secrets. We removed cluster access for two old deploy roles once GitOps made them unused.

**Proof:**
- OIDC, role per purpose: SEC-011 (`improvement-log.md:132`); roles: `docs/bootstrap.md:9-16`.
- App IRSA policy, read-only: `terraform/main.tf:110-127`.
- Apply role is cluster admin, accepted risk: EXC-006 (`exceptions-register.md:12`).
- Break-glass removed: PR #146. Deploy-role EKS access removed 2026-10-18: PR #151, applied by `terraform-apply` run 39098391516 (live state unverified).
- Argo SSO and RBAC: `cluster-addons/main.tf:170,188`; `variables.tf:98-106`.

**Visual:** Access diagram from `docs/architecture.md`, section 3, with the two removed paths crossed out.

**If longer:** Show the trust condition pattern and the IRSA scoping.

---

## Slide 9. Cost

**Headline:** Always on, this costs about $11 a day. Destroyed between uses, it costs cents.

- Measured tagged spend this month: $46.12, about $5.30 to $5.80 a day when up.
- Fargate compute is billed outside that figure: about $5.60 a day *(estimated)*.
- Levers save about $1.70 a day while running; destroying between uses saves about $11.
- The $75 budget is below the always-on run rate. Alert delivery is unverified.

**Speaker notes (about 55 s):** Here are honest numbers. Cost Explorer shows forty-six dollars of tagged spend so far this month. When the stack is up, that runs five to six dollars a day. Fargate, which runs the pods, is not in that number. From the pod sizes, it adds about five sixty a day. That is an estimate. Always on, we are near eleven dollars a day, about three hundred thirty-five a month. Our budget is seventy-five. So always-on does not fit the budget. Destroying between sessions does. We also have smaller levers, like merging two load balancers. None are done yet. And we have not yet confirmed that budget alerts arrive.

**Proof:**
- Tagged month to date $46.12, by service: `docs/cost/budget.md:31-47` *(measured, owner-provided)*.
- 18 pods and sizes: `budget.md:12-25`.
- Fargate about $5.60 a day: `budget.md:49-61` *(estimated, list price; us-east-2 rate unverified)*.
- Run rate about $11 a day, $335 a month: `budget.md:63-67` *(estimated)*.
- Levers about $1.70 a day: `budget.md:72-83` *(estimated)*.
- Budget $75, run rate exceeds it, alert delivery unverified: `budget.md:85-91`.

**Visual:** Stacked bar per day: EKS, NAT, CloudWatch, load balancers, Fargate (hatched, estimated). A dashed line at the budget's daily equivalent (about $2.50).

**If longer:** Walk each lever with its trade-off.

---

## Slide 10. Honest gaps, what is next, and the ask

**Headline:** The platform works. These gaps are known, owned and dated.

- Gaps: no alert delivery, no AWS Config, WAF or Inspector. The apply role is cluster admin.
- Prowler's 10 new items are proposals, not yet in the risk register.
- Next: alert delivery, close the Prowler items, tighten the apply role.
- Ask: choose the cost model, and add a second reviewer.

**Speaker notes (about 55 s):** I want to be clear about what is not done. Alerts are not delivered to anyone yet. The SNS topic has no subscriber. AWS Config, WAF and Inspector are not built. The role that applies Terraform is a full cluster admin. That is accepted, with an owner and an expiry. Prowler raised ten new items that we have not yet registered. Next, we wire up alerts, close the Prowler items and narrow the apply role. I have two asks. First, decide the cost model: destroy between uses, or fund about three hundred thirty-five a month. Second, give us a second reviewer, so merges are reviewed by a person, not just gated by checks.

**Proof:**
- Open items: `docs/security/controls.md:127-130`. Not built: `controls.md:113-115`.
- Prowler new items N1 to N8: `prowler-triage.md:163-174`.
- 16 accepted risks with owner and expiry: `exceptions-register.md:7-22`.
- 0 approvals: EXC-003 (`exceptions-register.md:9`).

**Visual:** Three columns: "Done", "Known gaps (owned, dated)", "Next 30 days". Then the two asks in large type.

**If longer:** Show the exceptions register and how an item gets closed.

---

## Appendix A. Tool matrix

| Category | Tool | Where | Gate | Latest result |
|---|---|---|---|---|
| Secrets | gitleaks | `ci.yml` | Fails job, not required | 118 commits, no leaks (run 39098252945) |
| Secrets, deps, image | Trivy | `ci.yml`, `cd.yml` | Blocking (fixable HIGH, CRITICAL) | 0 fixable (SEC-012) |
| SAST | CodeQL | `ci.yml` | Blocking at 7.0 | 0 findings (SEC-007) |
| Quality | SonarCloud | `ci.yml` | Blocking on PRs | Gate passing (SEC-014) |
| IaC | Checkov | `ci.yml` | Blocking | TF 388/0/15; workflows 627/0/1; Dockerfile 48/0 (run 39098252945) |
| IaC lint | tflint | `ci.yml` | Report only | 0 issues |
| Kubernetes | Kubescape | `ci.yml` | Report only | NSA: api 1, Argo 5 failed; CIS: api 1, Argo 12 (`security-scans.md:42-51`) |
| Kubernetes | securitycontext-check | `ci.yml` | Fails job, not required | 0 problems |
| Dependencies | pip-audit | `ci.yml` | Report only | No known vulnerabilities |
| DAST | OWASP ZAP | `dast.yml` | Report only | Medium 1 to 0 (`security-scans.md:29-40`) |
| Posture | Prowler | Manual | n/a | 43 project FAIL, triaged (`prowler-triage.md:25-31`) |
| Runtime | GuardDuty, Security Hub | AWS | n/a | 3 Low findings in SEC-037, NOT_PUBLIC |

Required on `main` today, 10: `app-build`, `app-checkov`, `app-image-scan`, `app-test-lint`, `app-trivy`, `tf-checkov`, `tf-validate`, `sonar`, `codeql`, `CodeQL` (`docs/bootstrap.md:21`). Expected to grow.

## Appendix B. Control register summary

- 42 logged security changes, SEC-000 to SEC-041 (`docs/security/improvement-log.md`).
- 16 accepted risks, EXC-001 to EXC-016; EXC-007 closed. All owned by the single maintainer. All but one expire 2027-04-08; EXC-016 expires 2027-04-17 (`exceptions-register.md:7-22`).
- Controls by layer, with status and evidence: `docs/security/controls.md`.

## Appendix C. Architecture detail

- Region us-east-2, 2 AZs, VPC /16 split into /24 subnets (`terraform/modules/network/variables.tf`, `main.tf:3-4`).
- EKS 1.34 (repo variable `CLUSTER_VERSION`). API auth mode, no creator admin. Endpoint public and private (EXC-005) (`terraform/modules/eks/main.tf:52-62`).
- Fargate profiles: kube-system, argocd, external-secrets, dev, prod.
- 3 internet-facing ALBs: dev, prod, Argo CD UI. 1 NAT, no VPC endpoints.
- Argo CD chart 10.10.5, External Secrets 2.11.0, LB controller 3.6.0, metrics-server 3.14.0 (`terraform/cluster-addons/variables.tf`).
- Diagrams: `docs/architecture.md`.

## Appendix D. Likely executive questions

1. **What does it cost?** About $11 a day always on, about $335 a month (estimated). Destroyed between uses, it costs cents a day. Tagged spend this month is $46.12 (measured).
2. **Why is the budget lower than the run rate?** The budget was set for a stack that is destroyed after each session. Always-on would need a higher budget or the levers on slide 9. Alert delivery is still unverified.
3. **Is this production ready?** Not for real data. The delivery platform works end to end, but the app holds synthetic data only. Before real data we need alert delivery, a second reviewer, closing the Prowler items, and KMS-encrypted state (EXC-008).
4. **Is it HIPAA compliant?** We make no compliance claim. The controls follow good practice, but no audit has been done and the data is synthetic.
5. **What is the biggest risk today?** The apply role is a full cluster admin, behind one approval. It is accepted with an expiry (EXC-006), and narrowing it is planned.
6. **What if a deploy fails?** Dev keeps serving from the old pods until the new ones are ready. Rollback is a Git revert. Prod changes only after an admin approves.
7. **What if the region or a zone fails?** One NAT gateway sits in one zone; if that zone fails, pods lose outbound access. It is accepted for cost (EXC-015), and the fix is documented.
8. **Would we know if we were attacked?** GuardDuty and CloudTrail record it. Nobody is paged yet, because alert delivery is not built. That is the first next step.
9. **Who can change production?** App changes go through Git: a merge to `main` needs 10 passing checks, and an Argo CD admin must approve the prod sync. Infrastructure changes go through Terraform behind an approval. Repo admins can bypass those approvals, which is part of EXC-003.
10. **How many people does this need?** One maintainer runs it now. A second reviewer is our ask, so changes get human review, not only automated checks.
11. **Does it scale?** Fargate adds pods without servers to manage. Autoscaling is built into the chart but off, and has not been load-tested.
12. **What did we learn?** Scanners only help if their config is checked; Trivy ran the wrong rules until we caught it. A guard is cheaper than an incident; SEC-037 led to the destructive plan guard.
