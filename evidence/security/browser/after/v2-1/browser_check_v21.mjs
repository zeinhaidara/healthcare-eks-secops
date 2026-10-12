// SEC-040 real-browser check of the v2.1 page (not part of the repo). Runs against the real FastAPI app.
// Two app instances: BASE serves the v2.1 seed; BASE_V1 serves v1-shaped records (no status).
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://v21app:8080";
const BASE_V1 = process.env.BASE_V1 || "http://v1shape:8080";
const KEY = process.env.BROWSER_TEST_KEY; // throwaway key, passed in the environment
const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  | " + detail : ""}`);
};

// Element helpers that never throw, so a page without an element records FAIL instead of crashing.
const txt = async (page, sel) => ((await page.locator(sel).count()) ? (await page.locator(sel).first().textContent({ timeout: 2000 })) || "" : "");
const vis = async (page, sel) => ((await page.locator(sel).count()) ? page.locator(sel).first().isVisible() : false);
// Run one step; an exception becomes a FAIL with its message.
async function step(name, fn) {
  try {
    await fn();
  } catch (e) {
    ok(name, false, `step error: ${String(e.message || e).split(String.fromCharCode(10))[0].slice(0, 160)}`);
  }
}
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });

async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport, hasTouch: viewport.width < 600 });
  const page = await ctx.newPage();
  const problems = [];
  const requests = [];
  page.on("console", (m) => ["error", "warning"].includes(m.type()) && !/status of 403/.test(m.text()) && problems.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("request", (r) => requests.push(r.url()));
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  return { ctx, page, problems, requests };
}

async function login(page, base) {
  await page.goto(base + "/");
  await page.fill("#key", "wrong-key");
  await page.click("#gate-form button[type=submit]");
  await page.waitForFunction(() => document.getElementById("gate-msg").textContent.includes("not accepted"));
  await page.fill("#key", KEY);
  await page.click("#gate-form button[type=submit]");
  await page.waitForSelector("#patient-list li");
  await page.waitForSelector("#canvas-host canvas", { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
}

const activeInfo = (page) =>
  page.evaluate(() => ({ id: document.activeElement?.id || "", row: document.activeElement?.dataset?.id || "" }));
const cardOpen = (page) => page.evaluate(() => Boolean(document.getElementById("card") && document.getElementById("card").open));
const noHScroll = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth);

async function run(label, viewport) {
  const { ctx, page, problems, requests } = await newPage(viewport);
  await login(page, BASE);
  ok(`${label}: banner visible`, await vis(page, ".banner"));
  ok(`${label}: 30 patients listed`, (await page.locator("#patient-list li").count()) === 30);
  const hasCanvas = (await page.locator("#canvas-host canvas").count()) === 1;
  ok(`${label}: WebGL canvas created`, hasCanvas);
  const legend = await txt(page, "#legend");
  ok(`${label}: legend line shown under the graph`, (await vis(page, "#legend")) && /registry/i.test(legend) && /illustrative/.test(legend), legend.slice(0, 80));
  ok(`${label}: no placeholder note for the real status mix`, !(await vis(page, "#status-note")));
  // After login the first row has focus, so its patient is selected: a label may show only for it.
  const startLabel = await txt(page, "#node-label");
  ok(`${label}: at login only the focused patient may be labelled`, !(await vis(page, "#node-label")) || startLabel.startsWith("P001"), startLabel);

  // Screen points of patient nodes, from the same layout module the page uses (view at zoom 1).
  await page.locator("#canvas-host").scrollIntoViewIfNeeded();
  const hb = await page.locator("#canvas-host").boundingBox();
  const patientsJson = await (await ctx.request.get(BASE + "/patients", { headers: { "x-api-key": KEY } })).json();
  const pointOf = (id) =>
    page.evaluate(
      async ({ patients, box, id }) => {
        const { layoutTree } = await import("/static/layout.js");
        const n = layoutTree(patients).nodes.find((x) => x.id === id);
        const aspect = box.width / box.height;
        const half = 34 / 2;
        const halfW = aspect >= 1 ? half * aspect : half;
        const halfH = aspect >= 1 ? half : half / aspect;
        return { x: box.x + box.width / 2 + (n.x / (2 * halfW)) * box.width, y: box.y + box.height / 2 - (n.y / (2 * halfH)) * box.height };
      },
      { patients: patientsJson, box: hb, id },
    );

  if (viewport.width >= 600) {
    await step(`${label}: hover`, async () => {
      const p10 = await pointOf("P010");
      await page.mouse.move(p10.x, p10.y);
      await page.waitForTimeout(250);
      const during = await txt(page, "#node-label");
      ok(`${label}: hover shows exactly one label, for the hovered patient`, (await vis(page, "#node-label")) && during.startsWith("P010"), during);
      await page.mouse.move(hb.x + 3, hb.y + 3);
      await page.waitForTimeout(200);
      const after = await txt(page, "#node-label");
      ok(`${label}: leaving the node drops the hover label`, !(await vis(page, "#node-label")) || !after.startsWith("P010"), after);
    });
  }

  await step(`${label}: mouse on a node`, async () => {
    const p1 = await pointOf("P001");
    await page.mouse.click(p1.x, p1.y);
    await page.waitForTimeout(250);
    ok(`${label}: click on a node opens the card`, (await cardOpen(page)) && (await txt(page, "#card-title")).startsWith("P001"));
    ok(`${label}: focus moves into the card`, (await activeInfo(page)).id === "card-close");
    const cardBox = await page.locator("#card").boundingBox();
    ok(`${label}: card fits the viewport, no horizontal scroll`, (await noHScroll(page)) && Boolean(cardBox) && cardBox.width <= viewport.width);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    ok(`${label}: Escape closes the card`, !(await cardOpen(page)));
    ok(`${label}: focus returns to the tree after Escape`, (await activeInfo(page)).id === "canvas-host");
    ok(`${label}: the selected node shows its label`, (await txt(page, "#node-label")).startsWith("P001") && (await vis(page, "#node-label")));
  });

  await step(`${label}: keyboard on the tree`, async () => {
    await page.locator("#canvas-host").focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    ok(`${label}: keyboard (arrow + Enter) on the tree opens the next patient`, (await cardOpen(page)) && (await txt(page, "#card-title")).startsWith("P002"));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    ok(`${label}: focus returns to the tree after keyboard use`, (await activeInfo(page)).id === "canvas-host");
  });

  await step(`${label}: list row by mouse, Close button`, async () => {
    await page.locator("#patient-list button[data-id='P005']").click();
    await page.waitForTimeout(150);
    ok(`${label}: list row opens the card`, (await cardOpen(page)) && (await txt(page, "#card-title")).startsWith("P005"));
    await page.click("#card-close", { timeout: 3000 });
    await page.waitForTimeout(150);
    ok(`${label}: Close button closes and focus returns to the row`, !(await cardOpen(page)) && (await activeInfo(page)).row === "P005");
  });

  await step(`${label}: list row by keyboard, backdrop click`, async () => {
    await page.locator("#patient-list button[data-id='P007']").focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    ok(`${label}: Enter on a focused row opens the card`, (await cardOpen(page)) && (await txt(page, "#card-title")).startsWith("P007"));
    const cb = await page.locator("#card").boundingBox({ timeout: 3000 });
    const bx = cb.x > 8 ? 4 : viewport.width - 4; // a point outside the card box
    const by = cb.y > 8 ? 4 : viewport.height - 4;
    await page.mouse.click(bx, by);
    await page.waitForTimeout(150);
    ok(`${label}: backdrop click closes and focus returns to the row`, !(await cardOpen(page)) && (await activeInfo(page)).row === "P007");
  });

  await step(`${label}: missing optional field`, async () => {
    // The API returns a missing optional field as null (the model's default), not as an absent key.
    const missing = patientsJson.find((p) => p.hba1c_percent === null || p.hba1c_percent === undefined);
    await page.locator(`#patient-list button[data-id='${missing.patient_id}']`).click();
    await page.waitForTimeout(150);
    const body = await txt(page, "#card-body");
    ok(`${label}: missing optional field shows "not recorded"`, body.includes("not recorded"), missing.patient_id);
    ok(`${label}: card shows the new vitals and lists`, /mmHg/.test(body) && /bpm/.test(body) && /Care team/.test(body));
    await page.keyboard.press("Escape");
  });

  // Labels: one DOM label at most, inside the tree, so labels cannot overlap each other.
  const labels = await page.evaluate(() => {
    const host = document.getElementById("canvas-host").getBoundingClientRect();
    return [...document.querySelectorAll(".node-label")]
      .filter((e) => !e.hidden && e.offsetParent !== null)
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { inside: r.left >= host.left - 1 && r.right <= host.right + 1 && r.top >= host.top - 1 && r.bottom <= host.bottom + 1 };
      });
  });
  ok(`${label}: at most one visible label, inside the tree (so no overlap)`, labels.length <= 1 && labels.every((l) => l.inside), JSON.stringify(labels));
  ok(`${label}: no horizontal scroll`, await noHScroll(page));

  const store = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, cookie: document.cookie, url: location.href, csp: window.__csp }));
  ok(`${label}: localStorage and sessionStorage empty`, store.local === 0 && store.session === 0);
  ok(`${label}: no cookies`, store.cookie === "" && (await ctx.cookies()).length === 0);
  ok(`${label}: no key in the URL or any request URL`, !store.url.includes(KEY) && !store.url.includes("?") && !requests.some((u) => u.includes(KEY)), store.url);
  ok(`${label}: no CSP violations`, store.csp.length === 0, store.csp.join("; "));
  const api = requests.filter((u) => u.startsWith(BASE) && !u.includes("/static/") && u !== BASE + "/");
  ok(`${label}: data only through /patients`, api.every((u) => /\/patients(\/P\d+)?$/.test(u)), api.join(", "));
  ok(`${label}: no console errors or warnings`, problems.length === 0, problems.join(" | ").slice(0, 300));
  await page.screenshot({ path: `/w/out21/${label}.png`, fullPage: true });
  await page.click("#lock");
  ok(`${label}: Lock returns to the gate`, await vis(page, "#gate"));
  await ctx.close();
}

async function runPlaceholder(label, viewport) {
  const { ctx, page, problems } = await newPage(viewport);
  await login(page, BASE_V1);
  const note = await txt(page, "#status-note");
  ok(`${label}: v1-shaped data shows the placeholder note`, (await vis(page, "#status-note")) && note.includes("status is a placeholder in this dataset"), note);
  ok(`${label}: missing status is counted as not recorded, never as watch`, (await txt(page, "#n-unknown")) === "30" && (await txt(page, "#n-watch")) === "0");
  await step(`${label}: card for a v1-shaped record`, async () => {
    await page.locator("#patient-list button").first().click();
    await page.waitForTimeout(150);
    const body = await txt(page, "#card-body");
    ok(`${label}: card shows "not recorded" and never "watch"`, body.includes("not recorded") && !/\bwatch\b/.test(body));
    await page.keyboard.press("Escape");
  });
  ok(`${label}: no horizontal scroll`, await noHScroll(page));
  ok(`${label}: no console errors or warnings`, problems.length === 0, problems.join(" | ").slice(0, 300));
  await page.screenshot({ path: `/w/out21/${label}.png`, fullPage: true });
  await ctx.close();
}

await run("phone-375", { width: 375, height: 812 });
await run("desktop-1280", { width: 1280, height: 800 });
await runPlaceholder("phone-375-v1-shape", { width: 375, height: 812 });
await runPlaceholder("desktop-1280-v1-shape", { width: 1280, height: 800 });
await browser.close();
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
