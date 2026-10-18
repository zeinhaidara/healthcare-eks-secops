// The .pptx is the master copy; rebuilding without the pptx skill folder in SKILL_DIR loses the theme colors.
// Builds the executive deck from docs/security/talk/presentation-facts.md figures. Usage: NODE_PATH=<pptxgenjs install> node scripts/build_exec_deck.js presentation/healthcare-eks-secops-exec.pptx
const path = require("path");
const pptxgen = require("pptxgenjs");
// Optional: SKILL_DIR points at the pptx skill, whose apply_theme.js writes the palette into the theme.
const applyTheme = process.env.SKILL_DIR ? require(process.env.SKILL_DIR + "/scripts/apply_theme.js").applyTheme : null;

const OUT = process.argv[2];

// Palette: ink and slate for infrastructure, teal for "secured", amber for caution.
const INK = "0B1F2A", SLATE = "1E3A4C", DEEP = "16303F", TEAL = "0E7C7B", TEAL_T = "E3F2F1",
  MINT = "5EEAD4", AMBER = "B45309", AMBER_T = "FEF3C7", GOLD = "FCD34D", RED = "B91C1C",
  RED_T = "FDE8E8", TXT = "1F2937", MUTED = "5B6B7A", LINE = "CBD5E1", CARD = "F1F5F9",
  ICE = "E5EEF3", GREY_BAR = "94A3B8";

const THEME = {
  name: "Secured Platform", headFontFace: "Calibri", bodyFontFace: "Calibri",
  colors: { dk1: INK, lt1: "FFFFFF", dk2: SLATE, lt2: CARD, accent1: TEAL, accent2: AMBER,
    accent3: SLATE, accent4: MINT, accent5: RED, accent6: MUTED, hlink: TEAL, folHlink: SLATE },
};

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
pres.title = "A secured path from code to cloud";
pres.theme = { headFontFace: "Calibri", bodyFontFace: "Calibri" };

const TITLE = { x: 0.6, y: 0.35, w: 12.13, h: 1.2 };
function master(name, bg, titleColor, footColor) {
  pres.defineSlideMaster({
    title: name,
    background: { color: bg },
    objects: [
      { placeholder: { options: { name: "title", type: "title", ...TITLE, fontFace: "Calibri", fontSize: 30, bold: true,
        color: titleColor, valign: "top", margin: 0 }, text: "" } },
      { text: { text: "Synthetic data · status 2026-10-18", options: { x: 0.6, y: 7.0, w: 5, h: 0.3, fontSize: 10,
        fontFace: "Calibri", color: footColor, margin: 0 } } },
    ],
    slideNumber: { x: 12.23, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, fontFace: "Calibri", color: footColor, align: "right" },
  });
}
master("CONTENT", "FFFFFF", INK, MUTED);
master("DARK", INK, "FFFFFF", "9FB3C1");

const S = { main: "Main", app: "Appendix" };
function slide(m, section, title, notes) {
  const s = pres.addSlide({ masterName: m, sectionTitle: section });
  s.addText(title, { placeholder: "title" });
  s.addNotes(notes);
  return s;
}
function txt(s, text, o) {
  s.addText(text, Object.assign({ isTextBox: true, fontFace: "Calibri", fontSize: 16, color: TXT, margin: 0.08,
    valign: "top", align: "left" }, o));
}
function box(s, x, y, w, h, fill, line) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: fill },
    line: { color: line || fill, width: line ? 1 : 0 }, rectRadius: 0.08 });
}
function arrow(s, x, y, w, h, color, flipV) {
  s.addShape(pres.shapes.LINE, { x, y, w, h: h || 0, flipV: !!flipV,
    line: { color: color || MUTED, width: 1.75, endArrowType: "triangle" } });
}
function bullets(s, items, x, y, w, h, color, size) {
  s.addText(items.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < items.length - 1 } })),
    { x, y, w, h, fontSize: size || 16, color: color || TXT, fontFace: "Calibri", paraSpaceAfter: 10,
      valign: "top", isTextBox: true, margin: 0.05 });
}
// Card with a bold heading run and a body run.
function card(s, x, y, w, h, fill, head, body, o = {}) {
  box(s, x, y, w, h, fill, o.line);
  const runs = [{ text: head, options: { bold: true, color: o.headColor || TXT, fontSize: o.headSize || 16,
    breakLine: !!body } }];
  if (body) runs.push({ text: body, options: { color: o.bodyColor || TXT, fontSize: o.bodySize || 14 } });
  txt(s, runs, { x: x + 0.05, y: y + 0.05, w: w - 0.1, h: h - 0.1, margin: 0.1, align: o.align || "left",
    valign: o.valign || "top", paraSpaceAfter: 4 });
}
const CHART_TEXT = {
  catAxisLabelFontFace: "Calibri", catAxisLabelFontSize: 12, catAxisLabelColor: MUTED,
  valAxisLabelFontFace: "Calibri", valAxisLabelFontSize: 12, valAxisLabelColor: MUTED,
  dataLabelFontFace: "Calibri", dataLabelFontSize: 12, dataLabelColor: TXT,
  titleFontFace: "Calibri", titleFontSize: 14, titleColor: TXT, legendFontFace: "Calibri", legendFontSize: 12,
  legendColor: MUTED,
};

// ---------- 1. Hook and problem ----------
pres.addSection({ title: S.main });
let s = slide("DARK", S.main,
  "A small patient-records app: every change is scanned, and every production release needs an approved deployment",
  "Hook: Shipping a healthcare app takes a weekend. Shipping it safely, every time, takes a platform.\n\n" +
  "This is a small healthcare app. A clinician looks up a patient record. It only reads data, and every record is made up. " +
  "Writing an app like this is quick. Running it safely is not. Any change could leak a secret, ship a vulnerable library or open the network. " +
  "So the real work is the platform behind the app. Every change is scanned. Every production release needs an approved deployment. " +
  "Every accepted risk has an owner and an expiry date.");
bullets(s, ["A read-only patient lookup API with a browser front end",
  "All patient data is synthetic: no real people, no PHI",
  "Writing the app is quick; shipping every change safely is the hard part",
  "This talk is about the platform"], 0.6, 1.95, 6.3, 3.4, ICE, 18);
box(s, 0.6, 5.65, 3.0, 0.5, AMBER);
txt(s, "Synthetic data only", { x: 0.6, y: 5.65, w: 3.0, h: 0.5, color: "FFFFFF", bold: true, fontSize: 15,
  align: "center", valign: "middle", margin: 0 });
box(s, 8.85, 1.95, 2.8, 0.85, TEAL);
txt(s, "App: read-only patient lookup", { x: 8.85, y: 1.95, w: 2.8, h: 0.85, color: "FFFFFF", bold: true,
  fontSize: 15, align: "center", valign: "middle" });
box(s, 7.4, 3.0, 5.33, 3.15, SLATE, MINT);
txt(s, "The platform behind it", { x: 7.6, y: 3.1, w: 5, h: 0.45, color: MINT, bold: true, fontSize: 18 });
[["Every change scanned", 7.65, 3.7], ["Releases gated", 10.25, 3.7], ["GitOps deploys", 7.65, 4.85],
  ["Every risk owned and dated", 10.25, 4.85]].forEach(([t, x, y]) => {
  box(s, x, y, 2.3, 0.95, DEEP);
  txt(s, t, { x, y, w: 2.3, h: 0.95, color: "FFFFFF", fontSize: 15, align: "center", valign: "middle" });
});

// ---------- 2. One path to production ----------
s = slide("CONTENT", S.main,
  "App changes reach production by one route: Git, automated checks, then an approved sync",
  "There is one road to production. A developer opens a pull request into dev. CI runs tests and scanners. " +
  "Ten checks must pass before anything merges to main, and that list will grow. " +
  "A merge to dev builds the image, scans it and records its exact fingerprint in Git. Dev deploys itself from that. " +
  "Prod gets the same image only after the release is merged and an admin approves the sync. " +
  "Merges are gated by automated checks. There is no human review yet, because there is one maintainer.");
const steps = [
  ["1", "Feature branch", "A developer's change", TEAL_T, TEAL],
  ["2", "PR into dev", "CI runs tests and scanners", TEAL_T, TEAL],
  ["3", "Merge to dev", "Build, scan and push one image", TEAL_T, TEAL],
  ["4", "Dev deploys", "Argo CD syncs automatically", CARD, SLATE],
  ["5", "Release PR", "dev into main: 10 checks required", AMBER_T, AMBER],
  ["6", "Prod deploys", "Same image; an admin approves", CARD, SLATE],
];
const SW = 1.8, SG = (12.13 - 6 * SW) / 5;
steps.forEach(([n, head, body, fill, col], i) => {
  const x = 0.6 + i * (SW + SG);
  box(s, x, 1.85, SW, 1.45, fill);
  txt(s, [{ text: n, options: { bold: true, color: col, fontSize: 14, breakLine: true } },
    { text: head, options: { bold: true, color: col, fontSize: 16, breakLine: true } },
    { text: body, options: { color: TXT, fontSize: 14 } }], { x: x + 0.03, y: 1.9, w: SW - 0.06, h: 1.35, margin: 0.08 });
  if (i < 5) arrow(s, x + SW + 0.04, 2.57, SG - 0.08);
});
bullets(s, ["10 checks are required on main today; the list is expected to grow",
  "0 required approvals: one maintainer, accepted as EXC-003",
  "Deploys pin the image digest that passed the scan",
  "CI never runs Helm or kubectl against the cluster"], 0.6, 3.75, 7.6, 2.6);
box(s, 8.7, 3.75, 4.03, 2.3, TEAL_T);
txt(s, [{ text: "10", options: { bold: true, color: TEAL, fontSize: 60, breakLine: true } },
  { text: "required checks on main today", options: { bold: true, color: TXT, fontSize: 16, breakLine: true } },
  { text: "Expected to grow. Merges are gated by automated checks.", options: { color: MUTED, fontSize: 14 } }],
  { x: 8.85, y: 3.8, w: 3.75, h: 2.2, margin: 0.1 });

// ---------- 3. Scanning ----------
s = slide("CONTENT", S.main,
  "Eight scanners check every change. Several have caught real problems we fixed",
  "Each scanner looks for a different mistake. Gitleaks looks for secrets in the whole history. Trivy looks for vulnerable packages. " +
  "CodeQL reads the code for security bugs. Checkov checks the infrastructure code. Kubescape checks Kubernetes settings. " +
  "They found real things. Checkov failed six checks on our first scan, and we fixed them. Trivy was running the wrong rules until we caught it. " +
  "Sonar blocked untested secret-rotation code until we added tests. Gitleaks was skipping release merges, so we changed how it runs.");
const H = (t) => ({ text: t, options: { bold: true, color: "FFFFFF", fill: { color: SLATE } } });
const gate = (t) => ({ text: t, options: { fill: { color: t.startsWith("Report") ? AMBER_T : t.startsWith("Fails") ? CARD : TEAL_T },
  bold: true, color: t.startsWith("Report") ? AMBER : t.startsWith("Fails") ? SLATE : TEAL } });
const rows3 = [
  ["Checkov", "IaC, Dockerfile and workflow misconfig", "Blocks merge", "First Terraform scan: 6 failed. Now 388 passed, 0 failed"],
  ["Trivy", "Vulnerable packages, secrets, image CVEs", "Blocks merge", "Gate ignored its config; fixed, clearing 44 unfixable HIGH"],
  ["SonarCloud", "Code quality and coverage", "Blocks merge", "First gate failed on coverage and reliability; both fixed"],
  ["gitleaks", "Secrets in the full git history", "Fails the job", "Action skipped release merges; CLI scans 118 commits, no leaks"],
  ["CodeQL", "Security bugs in code", "Blocks merge", "0 findings"],
  ["Kubescape", "Kubernetes security settings", "Report only", "NSA: 1 failed control for the app, 5 for Argo CD"],
  ["securitycontext-check", "Pod settings Fargate rejects", "Fails the job", "Catches the setting that hung an Argo CD apply"],
  ["tflint, pip-audit", "Terraform lint, Python CVEs", "Report only", "0 issues; no known vulnerabilities"],
];
s.addTable([[H("Tool"), H("What it catches"), H("Gate"), H("Real example")],
  ...rows3.map(r => [{ text: r[0], options: { bold: true } }, r[1], gate(r[2]), r[3]])],
{ x: 0.6, y: 1.75, w: 12.13, colW: [2.25, 3.35, 1.6, 4.93], fontFace: "Calibri", fontSize: 14, color: TXT,
  border: { type: "solid", pt: 0.75, color: LINE }, valign: "middle", margin: [0.05, 0.1, 0.05, 0.1], rowH: 0.5 });
txt(s, "Latest CI run 39098252945, 2026-10-18", { x: 0.6, y: 6.62, w: 6, h: 0.3, fontSize: 11, color: MUTED, margin: 0 });

// ---------- 4. GitOps ----------
s = slide("CONTENT", S.main,
  "Argo CD deploys from Git: dev syncs itself, prod waits for an admin",
  "We moved to GitOps on October fifteenth. Argo CD runs inside the cluster. It watches Git and makes the cluster match. " +
  "The pipeline never touches the cluster. Dev updates itself. Prod never changes by itself: an admin reviews the difference and clicks sync. " +
  "Signing in uses GitHub. There is no shared admin password. Roles come from GitHub usernames: one admin and two read-only users. Anyone not named sees nothing.");
box(s, 0.6, 1.9, 2.5, 3.6, CARD);
txt(s, "Git", { x: 0.7, y: 1.95, w: 2.3, h: 0.45, bold: true, fontSize: 18, color: SLATE });
box(s, 0.85, 2.6, 2.0, 0.9, "FFFFFF", LINE);
txt(s, "dev branch", { x: 0.85, y: 2.6, w: 2.0, h: 0.9, align: "center", valign: "middle", fontSize: 16 });
box(s, 0.85, 4.25, 2.0, 0.9, "FFFFFF", LINE);
txt(s, "main branch", { x: 0.85, y: 4.25, w: 2.0, h: 0.9, align: "center", valign: "middle", fontSize: 16 });
box(s, 3.85, 3.05, 2.4, 1.3, SLATE);
txt(s, [{ text: "Argo CD", options: { bold: true, fontSize: 18, breakLine: true } }, { text: "in the cluster", options: { fontSize: 14 } }],
  { x: 3.85, y: 3.05, w: 2.4, h: 1.3, color: "FFFFFF", align: "center", valign: "middle" });
arrow(s, 2.9, 3.05, 0.9, 0.45);
arrow(s, 2.9, 4.25, 0.9, 0.45, MUTED, true);
card(s, 7.0, 1.9, 2.6, 1.5, TEAL_T, "dev", "Syncs automatically", { headColor: TEAL });
card(s, 7.0, 4.0, 2.6, 1.5, AMBER_T, "prod", "Syncs only after an admin approves", { headColor: AMBER });
arrow(s, 6.3, 2.65, 0.65, 0.75, MUTED, true);
arrow(s, 6.3, 3.95, 0.65, 0.8);
box(s, 9.95, 1.9, 2.78, 3.6, INK);
txt(s, "Sign-in and roles", { x: 10.1, y: 2.0, w: 2.5, h: 0.45, bold: true, fontSize: 16, color: MINT });
bullets(s, ["GitHub SSO only; local admin off", "One admin", "Two read-only users", "Everyone else sees nothing"],
  10.1, 2.5, 2.55, 2.9, "FFFFFF", 15);
txt(s, "GitOps since 2026-10-15. CI never runs Helm or kubectl.", { x: 0.6, y: 5.85, w: 12.13, h: 0.45,
  fontSize: 16, color: SLATE, bold: true, margin: 0 });

// ---------- 5. Testing the running system ----------
s = slide("CONTENT", S.main,
  "We attack and audit the live system too, and we write down what we find",
  "We also test what is running. ZAP is an attack tool. It is scheduled weekly; so far we have run its baseline by hand. After we fixed our security headers, the Medium finding went away and four Low ones closed. High stayed at zero. " +
  "Prowler audited the whole shared account on October tenth. Forty-three failures were on our resources, and each is triaged. " +
  "And we had a real incident. A Terraform apply stripped the security settings from our audit log buckets. The failed apply exposed it, and GuardDuty recorded it. " +
  "Nothing was made public. We found the cause, repaired it the same day, and added a guard that now blocks that kind of plan. " +
  "No alert fired, because alert delivery is not built yet.");
s.addChart(pres.charts.BAR, [{ name: "Before fixes", labels: ["High", "Medium", "Low", "Info"], values: [0, 1, 5, 4] },
  { name: "After fixes", labels: ["High", "Medium", "Low", "Info"], values: [0, 0, 1, 4] }],
{ x: 0.6, y: 1.7, w: 4.4, h: 2.85, barDir: "col", barGrouping: "clustered", chartColors: [GREY_BAR, TEAL],
  showTitle: true, title: "ZAP baseline on dev: run by hand; scheduled weekly", showValue: true, dataLabelPosition: "outEnd",
  showLegend: true, legendPos: "b", valAxisHidden: true, valGridLine: { style: "none" }, catGridLine: { style: "none" },
  valAxisMaxVal: 6, ...CHART_TEXT });
box(s, 5.3, 1.75, 3.6, 2.75, CARD);
txt(s, [{ text: "43", options: { bold: true, fontSize: 44, color: SLATE, breakLine: true } },
  { text: "of 2,019 Prowler FAIL results were on our resources", options: { fontSize: 14, breakLine: true } },
  { text: "0 critical · 15 high · 17 medium · 11 low", options: { fontSize: 14, bold: true, breakLine: true } },
  { text: "Scan dated 2026-10-10 · 8 new items proposed", options: { fontSize: 12, color: MUTED } }],
{ x: 5.4, y: 1.8, w: 3.4, h: 2.65, margin: 0.1 });
box(s, 9.2, 1.75, 3.53, 2.75, CARD);
txt(s, "Runtime watch", { x: 9.3, y: 1.8, w: 3.3, h: 0.45, bold: true, fontSize: 16, color: SLATE });
txt(s, [{ text: "GuardDuty: S3 data events and EKS audit logs", options: { breakLine: true } },
  { text: "Security Hub: FSBP standard", options: { breakLine: true } },
  { text: "No alert delivery yet", options: { bold: true, color: AMBER } }],
{ x: 9.3, y: 2.3, w: 3.33, h: 2.1, fontSize: 14, paraSpaceAfter: 8 });
txt(s, "SEC-037 · log bucket incident, 2026-10-10", { x: 0.6, y: 4.75, w: 8, h: 0.4, bold: true, fontSize: 16,
  color: SLATE, margin: 0 });
const tl = [["Detected", "The apply failed. GuardDuty raised 3 Low findings, all NOT_PUBLIC", RED_T, RED],
  ["Diagnosed", "The plan role could not read the buckets, so Terraform planned to recreate them", CARD, SLATE],
  ["Repaired", "Read access and bucket imports; an apply restored the settings the same day", TEAL_T, TEAL],
  ["Guarded", "A plan guard now blocks deleting buckets, keys or tables", TEAL_T, TEAL]];
const TW = 2.85, TG = (12.13 - 4 * TW) / 3;
tl.forEach(([h, b, f, c], i) => {
  const x = 0.6 + i * (TW + TG);
  card(s, x, 5.2, TW, 1.45, f, h, b, { headColor: c, bodySize: 15 });
  if (i < 3) arrow(s, x + TW + 0.03, 5.92, TG - 0.06);
});

// ---------- 6. IaC ----------
s = slide("CONTENT", S.main,
  "Defined entirely as code. Build and teardown are each one workflow. The first full rebuild drill is planned",
  "Nothing is built by clicking. It is all Terraform, in two parts: the base cloud resources and the cluster add-ons. " +
  "Each run starts with a plan made by a role that can only read. A person approves the apply. " +
  "A guard stops any plan that would delete storage, an encryption key or the database. That guard came from the incident. " +
  "One workflow builds everything and one tears it down. The first full rebuild drill is planned. A few steps stay manual, and they are written down: the GitHub App key secret, the Argo CD sign-in secret, the API key value, and the dev and prod DNS aliases.");
const fl = [["Plan", "Read-only role", CARD, SLATE], ["Guard", "Blocks deleting a bucket, key or table", AMBER_T, AMBER],
  ["Approve", "A person approves the run", CARD, SLATE], ["Apply", "Applies the planned changes", TEAL_T, TEAL],
  ["Add-ons", "The second Terraform root", TEAL_T, TEAL]];
const FW = 2.2, FG = (12.13 - 5 * FW) / 4;
fl.forEach(([h, b, f, c], i) => {
  const x = 0.6 + i * (FW + FG);
  card(s, x, 1.9, FW, 1.3, f, h, b, { headColor: c, headSize: 18, bodySize: 15 });
  if (i < 4) arrow(s, x + FW + 0.03, 2.55, FG - 0.06);
});
bullets(s, ["Two Terraform roots, built from reusable modules", "A read-only plan, then a person approves the apply",
  "A guard fails any plan that deletes a bucket, key or table", "Manual steps: two secrets, the API key value, two DNS aliases"],
0.6, 3.7, 7.3, 2.75);
box(s, 8.3, 3.7, 4.43, 2.45, AMBER_T);
txt(s, "Build and teardown", { x: 8.45, y: 3.75, w: 4.1, h: 0.45, bold: true, fontSize: 16, color: AMBER });
box(s, 8.55, 4.35, 1.7, 0.75, "FFFFFF", LINE);
txt(s, "Build", { x: 8.55, y: 4.35, w: 1.7, h: 0.75, align: "center", valign: "middle", fontSize: 15, bold: true });
box(s, 10.75, 4.35, 1.7, 0.75, "FFFFFF", LINE);
txt(s, "Teardown", { x: 10.75, y: 4.35, w: 1.7, h: 0.75, align: "center", valign: "middle", fontSize: 15, bold: true });
arrow(s, 10.3, 4.73, 0.4);
txt(s, [{ text: "One workflow each, behind approvals. The first full rebuild drill is planned.", options: {} }],
{ x: 8.45, y: 5.25, w: 4.15, h: 0.85, fontSize: 15 });

// ---------- 7. Layout ----------
s = slide("CONTENT", S.main, "Private by default, encrypted at rest, logged everywhere",
  "One network across two zones. The app runs on Fargate in private subnets, so there are no servers to patch. " +
  "Traffic comes in through load balancers that serve HTTPS and redirect plain HTTP. Outbound traffic leaves through one NAT gateway, a cost choice. " +
  "One encryption key protects the database, the secrets, the images and the logs. " +
  "The API key lives in Secrets Manager, and a small function replaces it every thirty days. Flow logs and CloudTrail record what happens.");
box(s, 0.6, 1.75, 8.1, 5.05, "F8FAFC", SLATE);
txt(s, "VPC · us-east-2 · two zones", { x: 0.75, y: 1.8, w: 6, h: 0.4, bold: true, fontSize: 15, color: SLATE });
box(s, 0.85, 2.3, 3.2, 4.25, "FFFFFF", LINE);
txt(s, "Public subnets", { x: 0.95, y: 2.35, w: 3, h: 0.4, bold: true, fontSize: 14, color: MUTED });
card(s, 1.05, 2.85, 2.8, 1.45, TEAL_T, "Load balancers", "One per environment, HTTPS only, ACM certificates", { headColor: TEAL });
card(s, 1.05, 4.5, 2.8, 1.1, CARD, "NAT gateway", "One, for outbound traffic", { headColor: SLATE });
box(s, 4.3, 2.3, 4.15, 4.25, "FFFFFF", LINE);
txt(s, "Private subnets", { x: 4.4, y: 2.35, w: 3, h: 0.4, bold: true, fontSize: 14, color: MUTED });
box(s, 4.5, 2.85, 3.75, 2.35, SLATE);
txt(s, "EKS on Fargate: no servers to patch", { x: 4.6, y: 2.9, w: 3.55, h: 0.45, bold: true, fontSize: 15, color: "FFFFFF" });
[["dev namespace", 4.65, 3.45], ["prod namespace", 6.45, 3.45], ["Pod security group per namespace", 4.65, 4.25]].forEach(([t, x, y], i) => {
  const w = i === 2 ? 3.45 : 1.65;
  box(s, x, y, w, 0.7, DEEP);
  txt(s, t, { x, y, w, h: 0.7, color: "FFFFFF", fontSize: 14, align: "center", valign: "middle" });
});
card(s, 4.5, 5.4, 3.75, 0.95, CARD, "Rotation Lambda", "Replaces the API key every 30 days", { headColor: SLATE, headSize: 15 });
arrow(s, 4.05, 4.0, 0.42, 0, TEAL);
const tiles = [["KMS", "One key: data, secrets, images, logs"], ["Secrets Manager", "API key, rotated every 30 days"],
  ["DynamoDB", "Synthetic records; the app only reads"], ["CloudTrail", "Single region, log file validation"],
  ["Flow logs", "Kept 365 days, encrypted"]];
tiles.forEach(([h, b], i) => card(s, 9.0, 1.75 + i * 1.03, 3.73, 0.92, i === 0 ? TEAL_T : CARD, h, b,
  { headColor: i === 0 ? TEAL : SLATE, headSize: 15 }));

// ---------- 8. Identity and access ----------
s = slide("CONTENT", S.main,
  "CI holds no stored cloud keys. Each job gets its own short-lived role. The apply role is broad by design and listed as EXC-006",
  "The pipeline stores no cloud keys. Each job gets a short-lived token, and AWS trusts it for one role. " +
  "The planning role can only read. The apply role is broad by design: project-wide write and cluster admin, behind an approval. It is listed as EXC-006. People reach Argo through GitHub sign-in. " +
  "We also prune access. We removed a break-glass read that could see secrets. We removed cluster access for two old deploy roles once GitOps made them unused. " +
  "One gap remains: the operator's own user still has a long-lived key and no MFA.");
txt(s, "Access by context", { x: 0.6, y: 1.75, w: 6, h: 0.4, bold: true, fontSize: 16, color: SLATE, margin: 0 });
[["GitHub OIDC", "A short-lived role per job. No stored cloud keys", 0.6, 2.25],
  ["Plan role", "Read-only. No cluster access", 4.3, 2.25],
  ["Apply role", "Project-scoped write, behind an approval. Cluster admin (EXC-006)", 0.6, 4.1],
  ["Argo CD sign-in", "GitHub SSO only. Admin login off", 4.3, 4.1]].forEach(([h, b, x, y]) =>
  card(s, x, y, 3.5, 1.65, TEAL_T, h, b, { headColor: TEAL, headSize: 18, bodySize: 16 }));
txt(s, "Removed in October", { x: 8.3, y: 1.75, w: 4.4, h: 0.4, bold: true, fontSize: 16, color: SLATE, margin: 0 });
card(s, 8.3, 2.25, 4.43, 1.05, RED_T, "Break-glass read of Argo CD secrets", "Removed (#146)", { headColor: RED, bodySize: 16 });
card(s, 8.3, 3.55, 4.43, 1.05, RED_T, "Deploy roles' cluster access", "Removed 2026-10-18 (#151, applied)", { headColor: RED, bodySize: 16 });
card(s, 8.3, 4.85, 4.43, 0.9, AMBER_T, "Still open", "Operator user: long-lived key, no MFA", { headColor: AMBER, bodySize: 16 });

// ---------- 9. Cost ----------
s = slide("CONTENT", S.main,
  "Always on, this costs about $11 a day. Destroyed between uses, it costs cents (estimate)",
  "Cost Explorer shows forty-six dollars of tagged spend so far this month. Most of it is the EKS control plane and the NAT gateway. " +
  "Fargate, which runs the pods, is not in that number; it adds about five sixty a day, estimated. " +
  "Always on, that is about eleven dollars a day, around three hundred thirty-five a month. Our budget is seventy-five. So always-on does not fit. " +
  "Destroying between uses would, but we have not run the destroy yet. Smaller levers: one shared load balancer, fewer replicas, a smaller memory request. None are done. " +
  "We also have not confirmed that budget alerts arrive.");
const svc = ["EKS", "EC2-Other", "CloudWatch", "Load balancing", "KMS", "Secrets Manager", "S3"];
const usd = [21.98, 10.43, 6.95, 6.10, 0.48, 0.13, 0.03];
s.addChart(pres.charts.BAR, [{ name: "Month to date", labels: svc, values: usd }],
  { x: 0.6, y: 1.7, w: 7.0, h: 5.0, barDir: "bar", chartColors: [TEAL], catAxisOrientation: "maxMin",
    showTitle: true, title: "Tagged spend by service, month to date at 2026-10-18 (measured)", showValue: true,
    dataLabelPosition: "outEnd", dataLabelFormatCode: "$0.00", showLegend: false, valAxisHidden: true,
    valGridLine: { style: "none" }, catGridLine: { style: "none" }, valAxisMaxVal: 26, ...CHART_TEXT });
const stat = (y, big, small, col, fill) => {
  box(s, 8.0, y, 4.73, 1.15, fill);
  txt(s, [{ text: big, options: { bold: true, fontSize: 28, color: col, breakLine: true } },
    { text: small, options: { fontSize: 14, color: TXT } }], { x: 8.1, y: y + 0.02, w: 4.55, h: 1.1, margin: 0.08 });
};
stat(1.75, "$46.12", "Tagged spend this month (measured)", TEAL, TEAL_T);
stat(3.05, "~$5.60 a day", "Fargate, not in the tagged figure (estimate)", AMBER, AMBER_T);
stat(4.35, "~$11 a day", "Always on, about $335 a month (estimate)", AMBER, AMBER_T);
box(s, 8.0, 5.65, 4.73, 1.1, INK);
txt(s, [{ text: "Biggest lever: destroy between uses.", options: { bold: true, color: MINT, breakLine: true } },
  { text: "The $75 budget is below the estimated run rate. Alert delivery is unverified.", options: { color: "FFFFFF" } }],
{ x: 8.1, y: 5.68, w: 4.55, h: 1.05, fontSize: 14, margin: 0.08 });

// ---------- 10. Gaps and the ask ----------
s = slide("DARK", S.main, "The platform works. These gaps are known, owned and dated",
  "Here is what is not done, and each item has an owner. The operator's IAM user has a long-lived key and no MFA. " +
  "One maintainer with zero required approvals can self-approve the infra environment, and the apply role is a full cluster admin. " +
  "Three checks fail the job but are not required for a merge: gitleaks, lambda-test and securitycontext-check. " +
  "The destroy workflow has never run. The estimated run rate is above our budget, and we have not confirmed that alerts reach anyone. " +
  "Next, we wire up alerts, run the first rebuild drill, close the Prowler items and narrow the apply role. Two asks. " +
  "Decide the cost model: destroy between uses, or fund the always-on cost. " +
  "And give us a second reviewer, so merges are reviewed by a person, not only gated by checks.");
const GH = (t) => ({ text: t, options: { bold: true, color: "FFFFFF", fill: { color: TEAL } } });
const gaps = [["Operator IAM user: long-lived key, no MFA (Prowler N2)", "Maintainer"],
  ["One maintainer, 0 approvals, can self-approve infra (EXC-003)", "Maintainer"],
  ["Apply role is cluster admin (EXC-006)", "Maintainer"],
  ["gitleaks, lambda-test and securitycontext-check are not required checks", "Maintainer"],
  ["Destroy workflow never run", "Maintainer"],
  ["Estimated run rate above the $75 budget", "Maintainer"],
  ["Budget alert delivery unverified", "Maintainer"]];
s.addTable([[GH("Known gap"), GH("Owner")], ...gaps.map(r => [r[0], r[1]])],
  { x: 0.6, y: 1.75, w: 7.7, colW: [6.2, 1.5], fontFace: "Calibri", fontSize: 14, color: "FFFFFF", fill: { color: DEEP },
    border: { type: "solid", pt: 0.75, color: "2B4A5C" }, valign: "middle", margin: [0.03, 0.1, 0.03, 0.1], rowH: 0.5 });
box(s, 8.6, 1.75, 4.13, 2.45, DEEP);
txt(s, "Next", { x: 8.75, y: 1.8, w: 3.9, h: 0.45, bold: true, fontSize: 18, color: MINT });
bullets(s, ["Wire up alert delivery", "Run the first full rebuild drill", "Register and close Prowler N1 to N8",
  "Narrow the apply role; MFA for the operator"], 8.75, 2.25, 3.9, 1.9, "FFFFFF", 14);
box(s, 8.6, 4.4, 4.13, 1.95, TEAL);
txt(s, "The ask", { x: 8.75, y: 4.45, w: 3.9, h: 0.45, bold: true, fontSize: 18, color: "FFFFFF" });
bullets(s, ["Choose the cost model: destroy between uses, or fund always-on",
  "Add a second reviewer, so merges are reviewed by a person"], 8.75, 4.9, 3.9, 1.4, "FFFFFF", 14);
txt(s, "AWS Config, WAF and Inspector are not built yet.", { x: 0.6, y: 6.5, w: 12.13, h: 0.35, fontSize: 14,
  color: "9FB3C1", margin: 0 });

// ---------- Appendix ----------
pres.addSection({ title: S.app });
s = slide("CONTENT", S.app, "Appendix A: every tool, its gate and its latest result",
  "Reference only. Every number is from the latest CI run 39098252945 on 2026-10-18, except ZAP (2026-10-17 baseline) and Prowler (2026-10-10).");
const A = (t) => H(t);
const rowsA = [
  ["Checkov", "IaC", "ci.yml", "Blocks merge", "TF 388/0/15 · workflows 627/0/1 · Dockerfile 48"],
  ["Trivy", "Deps, secrets, image", "ci.yml, cd.yml", "Blocks merge, push", "Fixable HIGH, CRITICAL block; 44 unfixable"],
  ["CodeQL", "SAST", "ci.yml", "Blocks merge", "0 findings"],
  ["SonarCloud", "Quality", "ci.yml", "Blocks merge", "Gate fixed for coverage and reliability"],
  ["Tests", "Unit", "ci.yml", "Blocks merge", "App 126 passed, Lambda 13 passed"],
  ["gitleaks", "Secrets", "ci.yml", "Fails the job", "118 commits, no leaks"],
  ["Kubescape", "Kubernetes", "ci.yml", "Report only", "NSA 1 and 5, CIS 1 and 12 (app and Argo CD)"],
  ["tflint", "IaC lint", "ci.yml", "Report only", "0 issues"],
  ["pip-audit", "Python deps", "ci.yml", "Report only", "No known vulnerabilities"],
  ["OWASP ZAP", "DAST", "dast.yml", "Report only", "Scheduled weekly; baseline by hand: Medium 1 to 0"],
  ["Prowler", "Posture", "Manual", "Not a gate", "2026-10-10: 43 FAIL on our resources"],
  ["GuardDuty, Security Hub", "Runtime", "AWS", "Not a gate", "3 Low findings in SEC-037, NOT_PUBLIC"],
];
s.addTable([[A("Tool"), A("Type"), A("Where"), A("Gate"), A("Latest result")], ...rowsA.map(r => [{ text: r[0], options: { bold: true } }, r[1], r[2], r[3], r[4]])],
  { x: 0.6, y: 1.7, w: 12.13, colW: [2.35, 1.85, 1.65, 1.8, 4.48], fontFace: "Calibri", fontSize: 14, color: TXT,
    border: { type: "solid", pt: 0.75, color: LINE }, valign: "middle", margin: [0.02, 0.1, 0.02, 0.1], rowH: 0.37 });

s = slide("CONTENT", S.app, "Appendix B: 16 accepted risks, each with an owner and an expiry",
  "Sixteen accepted risks, EXC-001 to EXC-016. EXC-007 is closed. All are owned by the single maintainer and expire in April 2027. " +
  "Three rows cite the session destroy as a compensating control, and that destroy has not run, so they need the owner's review.");
[["16", "accepted risks, EXC-001 to EXC-016"], ["1", "closed: EXC-007, pod security groups"], ["April 2027", "expiry for all of them"]].forEach(([b, t], i) => {
  box(s, 0.6 + i * 4.14, 1.75, 3.85, 1.35, TEAL_T);
  txt(s, [{ text: b, options: { bold: true, fontSize: 30, color: TEAL, breakLine: true } }, { text: t, options: { fontSize: 14 } }],
    { x: 0.7 + i * 4.14, y: 1.78, w: 3.65, h: 1.3, margin: 0.08 });
});
const rowsB = [["EXC-001", "KMS key policy keeps the account-root statement"], ["EXC-003", "0 required approvals on main; one maintainer"],
  ["EXC-005", "EKS API endpoint is public, behind access entries"], ["EXC-006", "Apply role is EKS cluster admin"],
  ["EXC-008", "Terraform state is AES256, not KMS"], ["EXC-015", "One NAT gateway, a cost choice"]];
s.addTable([[A("ID"), A("Accepted risk")], ...rowsB.map(r => [{ text: r[0], options: { bold: true } }, r[1]])],
  { x: 0.6, y: 3.35, w: 7.6, colW: [1.4, 6.2], fontFace: "Calibri", fontSize: 14, color: TXT,
    border: { type: "solid", pt: 0.75, color: LINE }, valign: "middle", margin: [0.03, 0.1, 0.03, 0.1], rowH: 0.42 });
card(s, 8.55, 3.35, 4.18, 1.75, AMBER_T, "Owner review pending",
  "EXC-005, EXC-012 and EXC-013 cite the session destroy as a compensating control. The destroy has not run.",
  { headColor: AMBER, bodySize: 15 });

s = slide("CONTENT", S.app, "Appendix C: architecture detail",
  "Reference for questions about the layout. The full diagrams are in docs/architecture.md.");
const rowsC = [["Compute", "EKS on Fargate only, us-east-2; no worker nodes"],
  ["Network", "One VPC; pods in private subnets; one NAT; an HTTPS ALB per environment"],
  ["Isolation", "dev and prod namespaces; a pod security group each; NetworkPolicy not enforced on Fargate"],
  ["Pod security", "Pod Security restricted in the app namespaces"],
  ["Data", "DynamoDB with synthetic records; the app only reads"],
  ["Encryption", "One KMS key for the table, secrets, ECR, logs and the trail bucket"],
  ["Secrets", "API key in Secrets Manager, rotated every 30 days by a VPC Lambda"],
  ["Logging", "Flow logs kept 365 days; single-region CloudTrail; GuardDuty; Security Hub FSBP"],
  ["Delivery", "GitHub OIDC for CI; Argo CD deploys from Git; images pinned by digest"],
  ["Cluster access", "API endpoint public and private; access entries only; no creator admin"]];
s.addTable([[A("Layer"), A("What is there")], ...rowsC.map(r => [{ text: r[0], options: { bold: true } }, r[1]])],
  { x: 0.6, y: 1.7, w: 12.13, colW: [2.4, 9.73], fontFace: "Calibri", fontSize: 14, color: TXT,
    border: { type: "solid", pt: 0.75, color: LINE }, valign: "middle", margin: [0.04, 0.1, 0.04, 0.1], rowH: 0.45 });

const QA = [
  ["What does it cost?", "About $11 a day always on, about $335 a month (estimate). Tagged spend this month is $46.12 (measured)."],
  ["Why is the budget below the run rate?", "The $75 budget fits a stack that is destroyed between uses. The teardown has not been run yet. Always-on needs a higher budget or the levers."],
  ["Is it production ready?", "Not for real data. The platform works end to end, but alert delivery, a second reviewer and the Prowler items come first."],
  ["Is it HIPAA compliant?", "We make no compliance claim. The data is synthetic and no audit has been done."],
  ["What is the biggest risk?", "The operator IAM user has a long-lived key and no MFA. Next, the apply role is a full cluster admin behind one approval the maintainer can self-approve (EXC-006)."],
  ["What if something fails?", "App changes reach prod only after an admin approves a sync. A plan that deletes buckets, keys or tables is blocked. SEC-037 was repaired the same day."],
  ["Can we rebuild from scratch?", "Build and teardown are each one workflow, plus documented manual steps. The first full rebuild drill is planned; the teardown has not been run."],
  ["Would we know if we were attacked?", "GuardDuty and CloudTrail are enabled in Terraform; their live state was not checked for this deck. Nobody is paged, because alert delivery is not built."],
  ["Who can change production?", "App changes need 10 passing checks and an admin-approved sync. Infrastructure changes need an approved Terraform run. Admins can bypass approvals (EXC-003)."],
  ["How many people does this need?", "One maintainer runs it today. A second reviewer is our ask, so changes get human review."],
  ["Does it scale?", "Pods run on Fargate, so there are no servers to add or patch. Autoscaling is off; each environment runs 2 replicas. No load test has been done."],
  ["What was the DNS mix-up?", "The prod hostname first pointed at the dev load balancer (SEC-033). An HTTPS check caught it and it was repointed. Nothing checks it automatically yet."],
  ["What happened to the Prowler highs?", "Of the 15 high results on our resources (2026-10-10), 3 are covered by register entries and 2 are deferred to planned work. The other 10 are new items, N1 to N8, not yet in the register."],
  ["Was any data exposed in SEC-037?", "No public exposure was found. All three GuardDuty findings showed NOT_PUBLIC (operator-checked), and the settings were restored the same day."],
];
[0, 1].forEach(p => {
  s = slide("CONTENT", S.app, p === 0 ? "Appendix D: likely questions, with honest answers (1 of 2)" : "Appendix D: likely questions, with honest answers (2 of 2)",
    "Answer plainly. Say estimated where a number is estimated. Never claim compliance.");
  QA.slice(p * 7, p * 7 + 7).forEach(([q, a], i) => {
    const x = 0.6 + (i % 2) * 6.17, y = 1.65 + Math.floor(i / 2) * 1.3;
    card(s, x, y, i === 6 ? 12.13 : 5.96, 1.2, i % 2 ? CARD : TEAL_T, q, a, { headColor: i % 2 ? SLATE : TEAL, headSize: 15, bodySize: 14 });
  });
});

pres.writeFile({ fileName: OUT }).then(async () => {
  if (applyTheme) await applyTheme(OUT, THEME);
  console.log("wrote", OUT);
});
