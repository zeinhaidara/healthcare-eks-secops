// Same style of check against the v1 page (from dev). Prints booleans only, never the key.
import { chromium } from "playwright";
const BASE = "http://v1app:8080";
const KEY = process.env.BROWSER_TEST_KEY; // throwaway key, passed in the environment
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
const page = await ctx.newPage();
await page.goto(BASE + "/");
await page.fill("#key", KEY);
await page.click("#key-form button[type=submit]");
await page.waitForSelector("#rows tr");
const r = await page.evaluate((k) => ({
  rows: document.querySelectorAll("#rows tr").length,
  sessionStorageEntries: sessionStorage.length,
  keyFoundInSessionStorage: sessionStorage.getItem("apiKey") === k,
  localStorageEntries: localStorage.length,
  cookie: document.cookie,
  syntheticBannerOnPage: document.body.innerText.includes("SYNTHETIC DATA"),
}), KEY);
console.log(JSON.stringify(r));
const pass = !r.keyFoundInSessionStorage && r.sessionStorageEntries === 0;
console.log(pass ? "PASS  key is not kept in browser storage" : "FAIL  key is kept in sessionStorage after login (v1 behaviour)");
await browser.close();
process.exit(pass ? 0 : 1);
