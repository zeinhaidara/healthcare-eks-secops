// One-off real-browser check of the v2 page (not part of the repo). Runs against the real FastAPI app.
import { chromium } from "playwright";

const BASE = "http://v2app:8080";
const KEY = process.env.BROWSER_TEST_KEY; // throwaway key, passed in the environment
const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  | " + detail : ""}`);
};

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

async function run(label, viewport) {
  const ctx = await browser.newContext({ viewport, hasTouch: viewport.width < 600 });
  const page = await ctx.newPage();
  const problems = [];
  const requests = [];
  page.on("console", (m) => ["error", "warning"].includes(m.type()) && !/status of 403/.test(m.text()) && problems.push(`${m.type()}: ${m.text()}`)); // the one 403 is the deliberate wrong-key attempt
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("request", (r) => requests.push(r.url()));
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });

  await page.goto(BASE + "/");
  ok(`${label}: banner visible on the gate`, await page.locator(".banner").isVisible());
  ok(`${label}: gate visible, tree hidden`, (await page.locator("#gate").isVisible()) && !(await page.locator("#app").isVisible()));

  await page.fill("#key", "wrong-key");
  await page.click("#gate-form button[type=submit]");
  await page.waitForFunction(() => document.getElementById("gate-msg").textContent.includes("not accepted"));
  ok(`${label}: wrong key is refused`, !(await page.locator("#app").isVisible()));

  await page.fill("#key", KEY);
  await page.click("#gate-form button[type=submit]");
  await page.waitForSelector("#patient-list li");
  await page.waitForSelector("#canvas-host canvas", { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
  ok(`${label}: 30 patients listed`, (await page.locator("#patient-list li").count()) === 30);
  ok(`${label}: banner still visible on the tree view`, await page.locator(".banner").isVisible());
  const hasCanvas = (await page.locator("#canvas-host canvas").count()) === 1;
  ok(`${label}: WebGL canvas created`, hasCanvas, hasCanvas ? "" : "fallback list shown");

  if (hasCanvas) {
    const box0 = await page.locator("#canvas-host canvas").boundingBox();
    // Click the canvas centre region on the root hub area, then use the list to select; verify the panel updates.
    await page.locator("#patient-list button").nth(2).click();
    await page.waitForTimeout(400);
    ok(`${label}: selecting a patient fills the detail panel`, (await page.locator("#detail-body").textContent()).includes("P003"));
    // Tap the nearest neighbour of P003 on the canvas. After the list click the view is centred on
    // P003 at zoom 1.6, so the neighbour's screen position follows from the layout module.
    await page.locator("#canvas-host").scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const box = await page.locator("#canvas-host canvas").boundingBox();
    const patients = await (await ctx.request.get(BASE + "/patients", { headers: { "x-api-key": KEY } })).json();
    const tap = await page.evaluate(async ({ patients, box }) => {
      const { layoutTree } = await import("/static/layout.js");
      const nodes = layoutTree(patients, "P003").nodes.filter((n) => n.type === "patient");
      const me = nodes.find((n) => n.id === "P003");
      const other = nodes.filter((n) => n.id !== "P003").sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
      const aspect = box.width / box.height;
      const zoom = 1.6;
      let halfW; let halfH;
      if (aspect >= 1) { halfH = 38 / 2 / zoom; halfW = halfH * aspect; } else { halfW = 38 / 2 / zoom; halfH = halfW / aspect; }
      return { id: other.id, x: box.x + box.width / 2 + ((other.x - me.x) / (2 * halfW)) * box.width, y: box.y + box.height / 2 - ((other.y - me.y) / (2 * halfH)) * box.height };
    }, { patients, box });
    await page.mouse.click(tap.x, tap.y);
    await page.waitForTimeout(300);
    const shown = await page.locator("#detail-body").textContent();
    ok(`${label}: tapping a neighbouring node on the canvas selects it`, shown.includes(tap.id), `expected ${tap.id}`);
    await page.screenshot({ path: `/w/out/${label}.png`, fullPage: true });
  } else {
    await page.screenshot({ path: `/w/out/${label}.png`, fullPage: true });
  }

  const dims = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
    bodyScrollW: document.body.scrollWidth,
  }));
  ok(`${label}: no horizontal scroll`, dims.scrollW <= dims.innerW && dims.bodyScrollW <= dims.innerW, JSON.stringify(dims));

  const store = await page.evaluate(() => ({
    local: localStorage.length,
    session: sessionStorage.length,
    cookie: document.cookie,
    url: location.href,
    csp: window.__csp,
  }));
  ok(`${label}: localStorage empty`, store.local === 0);
  ok(`${label}: sessionStorage empty`, store.session === 0);
  ok(`${label}: document.cookie empty`, store.cookie === "");
  ok(`${label}: URL has no key or query`, !store.url.includes(KEY) && !store.url.includes("?"), store.url);
  ok(`${label}: no CSP violations`, store.csp.length === 0, store.csp.join("; "));
  ok(`${label}: no key in any request URL`, !requests.some((u) => u.includes(KEY)));
  const apiCalls = requests.filter((u) => u.startsWith(BASE) && !u.includes("/static/") && u !== BASE + "/" && !u.includes("favicon"));
  ok(`${label}: data only through /patients`, apiCalls.every((u) => /\/patients(\/P\d+)?$/.test(u)), apiCalls.join(", "));
  const cookies = await ctx.cookies();
  ok(`${label}: browser holds no cookies for the site`, cookies.length === 0, JSON.stringify(cookies));
  ok(`${label}: no console errors or warnings`, problems.length === 0, problems.join(" | ").slice(0, 400));

  await page.click("#lock");
  ok(`${label}: Lock returns to the gate`, await page.locator("#gate").isVisible());
  await ctx.close();
}

await run("phone-375", { width: 375, height: 812 });
await run("desktop-1280", { width: 1280, height: 800 });
await browser.close();
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
