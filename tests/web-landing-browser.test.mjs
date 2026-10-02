import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium } from "playwright-core";

// Reuses the existing Survey visual tests' real browser + local HTTP boundary.
// The resolver is a local fixture: this does not prove Vercel rewrites or EF/OS.
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const CODE = "AbCdEf012345_-xy";
const UUID = "00000000-0000-0000-0000-000000000001";

test("browser proves inactive default, PC short landing, mobile fallback and resolver rejection", async () => {
  const requests = [];
  let origin = "";
  let payload = { status: "ok", code: CODE, target_type: "game", canonical_path: "/game/42", canonical_url: "https://evil.example" };
  let status = 200;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      response.setHeader("Cache-Control", "no-store");
      if (url.pathname === `/api/share-links/${CODE}`) {
        requests.push({ method: request.method, cookie: request.headers.cookie });
        response.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(payload));
        return;
      }
      if (url.pathname.startsWith("/assets/") || url.pathname === "/logo.png") {
        if (!/^\/(?:assets\/[a-z0-9_.\/-]+|logo\.png)$/.test(url.pathname) || url.pathname.includes("..")) { response.writeHead(404).end(); return; }
        response.setHeader("Content-Type", extname(url.pathname) === ".mjs" ? "text/javascript" : extname(url.pathname) === ".css" ? "text/css" : "image/png");
        response.end(await readFile(join(ROOT, url.pathname.slice(1))));
        return;
      }
      let html = await readFile(join(ROOT, "index.html"), "utf8");
      // Enable only fixture HTML; the deployed index.html has neither marker.
      if (origin) html = html.replace("</head>", `<meta name="pn-web-origin" content="${origin}"></head>`)
        .replace('<div class="actions">', '<div class="actions"><a id="web-btn" class="button secondary hidden" href="#">Webで見る</a>');
      response.setHeader("Content-Type", "text/html");
      response.end(html);
    } catch { response.writeHead(500).end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", headless: true });
  const errors = [];
  const assertions = [];
  const check = (name, value) => { assert.ok(value, name); assertions.push(name); };
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://links.playnavilab.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<h1>Existing app handoff</h1>" }));
    await page.route("https://playnavi.app/**", (route) => route.fulfill({ contentType: "text/html", body: "<h1>Web target</h1>" }));
    await page.goto(`${base}/game/42`);
    await page.getByText("PlayNaviでリンクを開く", { exact: true }).waitFor();
    check("default HTML has no Web action or automatic Web navigation", await page.locator("#web-btn").count() === 0 && page.url() === `${base}/game/42`);
    await page.goto(`${base}/s/${CODE}`);
    await page.waitForURL("https://links.playnavilab.com/game/42");
    check("default short links retain existing canonical origin", page.url() === "https://links.playnavilab.com/game/42");

    origin = "https://playnavi.app";
    await context.addCookies([{ name: "fixture_private", value: "must-not-send", url: base }]);
    payload = { ...payload, target_type: "log", canonical_path: `/game/42?logId=${UUID}` };
    await page.goto(`${base}/s/${CODE}`);
    await page.waitForURL(`https://playnavi.app/game/42?logId=${UUID}`);
    check("PC short link opens fixed Web origin with exact logId", page.url() === `https://playnavi.app/game/42?logId=${UUID}`);
    check("real same-origin resolver requests omit cookies", requests.length === 2 && requests.every((request) => request.method === "GET" && request.cookie === undefined));
    await page.goto(`${base}/game/42?logId=${UUID}`);
    await page.locator("#web-btn").waitFor({ state: "visible" });
    check("canonical PC fallback presents exact Web action", await page.locator("#web-btn").getAttribute("href") === `https://playnavi.app/game/42?logId=${UUID}`);
    await page.locator("#web-btn").click();
    await page.waitForURL(`https://playnavi.app/game/42?logId=${UUID}`);
    check("Web action actually navigates", page.url().startsWith("https://playnavi.app/game/42"));

    for (const userAgent of ["iPhone", "Android"]) {
      const mobile = await browser.newContext({ userAgent, viewport: { width: 390, height: 844 } });
      const mobilePage = await mobile.newPage();
      mobilePage.on("pageerror", (error) => errors.push(error.message));
      // The existing app scheme attempts an OS handoff during module startup;
      // waiting for network load would wait on Chrome's external-protocol UI.
      await mobilePage.goto(`${base}/game/42?logId=${UUID}`, { waitUntil: "commit" });
      await mobilePage.locator("#web-btn").waitFor({ state: "visible" });
      check(`${userAgent} keeps manual app target`, await mobilePage.locator("#primary-btn").getAttribute("href") === (userAgent === "iPhone" ? `https://playnavi-links.vercel.app/game/42?logId=${UUID}` : `playnavi://game/42?logId=${UUID}`));
      check(`${userAgent} retains Web fallback`, await mobilePage.locator("#web-btn").getAttribute("href") === `https://playnavi.app/game/42?logId=${UUID}`);
      check(`${userAgent} has no horizontal overflow`, await mobilePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await mobile.close();
    }
    payload = { status: "ok", code: CODE, target_type: "diagnosis", canonical_path: `/users/${UUID}/diagnosis` };
    await page.goto(`${base}/s/${CODE}`);
    await page.waitForURL(`https://links.playnavilab.com/users/${UUID}/diagnosis`);
    check("diagnosis retains existing landing", page.url() === `https://links.playnavilab.com/users/${UUID}/diagnosis`);
    await page.goto(`${base}/users/${UUID}/diagnosis`);
    await page.getByText("PlayNaviでリンクを開く", { exact: true }).waitFor();
    check("diagnosis has no Web action", !await page.locator("#web-btn").isVisible());
    await page.goto(`${base}/a?act=log&g=42&src=claude&i=stuck&at=1790645000000`);
    await page.getByText("PlayNaviに戻る", { exact: true }).waitFor();
    check("AI return has no Web action", !await page.locator("#web-btn").isVisible());
    for (const failure of [
      { status: 404, payload: {} }, { status: 503, payload: {} },
      { status: 200, payload: { status: "ok", code: CODE, target_type: "game", canonical_path: "https://evil.example/game/42" } },
      { status: 200, payload: { status: "ok", code: CODE, target_type: "user", canonical_path: "/game/42" } },
    ]) {
      status = failure.status; payload = failure.payload;
      await page.goto(`${base}/s/${CODE}`);
      await page.locator("#heading").filter({ hasText: failure.status === 404 ? /^リンクを開けません$/ : /^一時的にリンクを開けません$/ }).waitFor();
      check(`unsafe/unavailable resolver ${failure.status}/${payload.target_type || "none"} stays on same origin without Web action`, page.url() === `${base}/s/${CODE}` && !await page.locator("#web-btn").isVisible());
    }
    origin = "https://evil.example";
    await page.goto(`${base}/game/42`);
    await page.getByText("PlayNaviでリンクを開く", { exact: true }).waitFor();
    check("unsafe HTML origin stays disabled", !await page.locator("#web-btn").isVisible());
    check("no browser runtime errors", errors.length === 0);
    console.log(JSON.stringify({ checks: assertions.length, pass: assertions.length, boundary: "real Chrome + local HTTP; resolver fixture; Vercel/EF/OS not verified" }));
    await context.close();
  } finally {
    await browser.close(); server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
