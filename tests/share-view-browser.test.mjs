import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium } from "playwright-core";
import sharp from "sharp";

import { createSharePreviewHandler } from "../api/share-preview.mjs";

// TASK-20261017-002 r3・r5 記録のページを本物の Chrome で開く。HTML は本物の api/share-preview.mjs が作り
// (EF share-preview-meta / share-view は手元の見本 = C2 の形)、住所は本物のホスト名 (playnavi.app /
// links.playnavilab.com) を Chrome の中で手元の HTTP へつなぐ。Vercel の書き換え・EF・OS のアプリ起動はここでは確かめない。
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const LOG = "12345678-1234-1234-1234-123456789abc";
const MOMENT = "abcdefab-cdef-cdef-cdef-abcdefabcdef";
const SPOILER = "abcdefab-cdef-cdef-cdef-abcdefab0002";
const CODE = "AbCdEf012345_-xy";
const F = "https://fixture.example";
const PATHS = {
  moment: `/game/42?logId=${LOG}&moment=${MOMENT}`,
  spoiler: `/game/42?logId=${LOG}&moment=${SPOILER}`,
  review: `/game/42?logId=${LOG}`,
};
const base = (path) => ({
  canonical_path: path, app_url: `https://links.playnavilab.com${path}`,
  game: { id: 42, title: "Elden Ring", cover_url: `${F}/cover.png` },
  author: { display_name: "あかり<b>", avatar_url: `${F}/avatar.png` },
  date: "2026-10-20T06:00:00Z",
});
const VIEWS = {
  [PATHS.moment]: {
    ...base(PATHS.moment), kind: "moment", spoiler: false, title: "ついに倒した", body: "</script><script>alert(1)</script>",
    media: [
      { kind: "video", url: `${F}/clip.mp4`, poster_url: `${F}/p.png`, duration_ms: 61_000 },
      { kind: "image", url: `${F}/1.png`, width: 40, height: 30 },
      { kind: "image", url: `${F}/2.png`, width: 40, height: 30 },
      { kind: "image", url: `${F}/3.png`, width: 30, height: 40 },
    ],
  },
  [PATHS.spoiler]: { ...base(PATHS.spoiler), kind: "moment", spoiler: true, title: "正体", body: "ネタバレ本文", media: [{ kind: "image", url: `${F}/1.png` }] },
  [PATHS.review]: {
    ...base(PATHS.review), kind: "review", spoiler: false, status: "completed", score: 8.5, comment: "最高", moments_count: 2,
    media: [{ kind: "image", url: `${F}/1.png`, width: 40, height: 30 }],
  },
};
const META = "https://meta.fixture/share-preview-meta";
const VIEW = "https://meta.fixture/share-view";

test("record page: the server embeds the content, Chrome shows it at once, masks spoilers and keeps today's page without it", async () => {
  const upstream = [];
  const handler = createSharePreviewHandler({
    metaUrl: META,
    viewUrl: VIEW,
    fetchImpl: async (url) => {
      upstream.push(String(url));
      if (String(url).startsWith(META)) return Response.json({ status: "ok", card: { title: "t", description: "d", image_url: `${F}/cover.png` } });
      const path = url.searchParams.get("path") ?? (url.searchParams.get("code") === CODE ? PATHS.moment : null);
      const view = VIEWS[path];
      return view ? Response.json({ status: "ok", view }) : Response.json({ status: "not_found" }, { status: 404 });
    },
  });
  const browserRequests = [];
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      const host = request.headers["x-fixture-host"];
      browserRequests.push(url.pathname);
      if (url.pathname === `/api/share-links/${CODE}`) {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ status: "ok", code: CODE, target_type: "moment", canonical_path: PATHS.moment, canonical_url: `https://links.playnavilab.com${PATHS.moment}` }));
        return;
      }
      if (/^\/(?:assets\/[a-z0-9_.\/-]+|logo\.png)$/.test(url.pathname) && !url.pathname.includes("..")) {
        response.setHeader("Content-Type", extname(url.pathname) === ".mjs" ? "text/javascript" : extname(url.pathname) === ".css" ? "text/css" : "image/png");
        response.end(await readFile(join(ROOT, url.pathname.slice(1))));
        return;
      }
      // vercel.json の書き換えと同じ: /s/:code → ?code=、links.playnavilab.com の /game/:id → ?kind=game&id=&host=
      const query = Object.fromEntries(url.searchParams);
      const short = /^\/s\/([^/]+)$/.exec(url.pathname);
      const game = /^\/game\/([^/]+)$/.exec(url.pathname);
      const vercelQuery = short ? { ...query, code: short[1] } : game && host === "links.playnavilab.com" ? { ...query, kind: "game", id: game[1], host } : null;
      if (!vercelQuery) {
        response.setHeader("Content-Type", "text/html");
        response.end(await readFile(join(ROOT, "index.html")));
        return;
      }
      const recorder = {
        setHeader: (name, value) => response.setHeader(name, value),
        status(status) { response.statusCode = status; return this; },
        send(body) { response.end(body); return this; },
      };
      await handler({ method: "GET", headers: { host }, query: vercelQuery }, recorder);
    } catch { response.writeHead(500).end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#3366cc" } }).png().toBuffer();
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", headless: true });
  const errors = [];
  const checks = [];
  const check = (name, value) => { assert.ok(value, name); checks.push(name); };
  const context = async (options = {}) => {
    const ctx = await browser.newContext(options);
    await ctx.route(`${F}/**`, (route) => route.fulfill({ contentType: "image/png", body: png }));
    // 本物のホスト名を手元の HTTP へ (Host は見本のヘッダで渡す)
    await ctx.route(/^https:\/\/(?:playnavi\.app|links\.playnavilab\.com)\//, async (route) => {
      const url = new URL(route.request().url());
      const r = await fetch(`${origin}${url.pathname}${url.search}`, { headers: { "x-fixture-host": url.host } });
      await route.fulfill({ status: r.status, headers: Object.fromEntries(r.headers), body: Buffer.from(await r.arrayBuffer()) });
    });
    return ctx;
  };
  const open = async (ctx, url, waitUntil = "load") => {
    const page = await ctx.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => { errors.push(`dialog: ${dialog.message()}`); void dialog.dismiss(); });
    await page.goto(url, { waitUntil });
    return page;
  };
  const L = "https://links.playnavilab.com";
  try {
    const pc = await context({ viewport: { width: 1440, height: 900 } });
    let page = await open(pc, `${L}${PATHS.moment}`);
    await page.locator("#share-view:not(.hidden)").waitFor();
    const view = page.locator("#share-view");
    const viewText = await view.innerText();
    check("game, author and date", viewText.includes("Elden Ring") && viewText.includes("あかり<b>") && viewText.includes("2026年10月20日"));
    check("markup in the body stays text", (await page.locator(".share-text").innerText()) === "</script><script>alert(1)</script>" && await page.locator("#share-view script, #share-view b").count() === 0);
    check("the embedded JSON did not break out of its script", await page.locator("script").count() === 2);
    check("video plays in place", await page.locator("video[controls][playsinline][preload=metadata][poster]").count() === 1);
    check("three photos", await page.locator("button.share-media-item img").count() === 3);
    check("today's spinner text is hidden", !await page.locator("#heading").isVisible() && !await page.locator("#spinner").isVisible());
    check("soft line under the store buttons", await page.locator("#share-soft").isVisible());
    check("column is at most 640px wide", (await page.locator("#link-view").boundingBox()).width <= 640);
    check("the browser never asks for the content (it is in the HTML)", !browserRequests.some((path) => path.includes("share-view") && !path.endsWith(".mjs")));
    check("smart banner for the canonical URL", await page.locator('meta[name="apple-itunes-app"]').getAttribute("content") === `app-id=6756201875, app-argument=${L}${PATHS.moment}`);
    await page.locator("button.share-media-item").nth(1).click();
    await page.locator(".share-viewer").waitFor();
    check("viewer opens on the tapped photo", (await page.locator(".share-viewer-counter").innerText()) === "2 / 3");
    await page.keyboard.press("ArrowRight");
    check("arrow key moves to the next photo", (await page.locator(".share-viewer-counter").innerText()) === "3 / 3");
    await page.keyboard.press("Escape");
    check("Escape closes the viewer", await page.locator(".share-viewer").count() === 0);
    await page.close();

    page = await open(pc, `${L}${PATHS.spoiler}`);
    await page.locator("#share-view:not(.hidden)").waitFor();
    check("spoiler hides text and photos", !(await page.locator("#share-view").innerText()).includes("ネタバレ本文") && await page.locator(".share-media").count() === 0);
    await page.getByRole("button", { name: "ネタバレを表示" }).click();
    check("reveal shows them", (await page.locator("#share-view").innerText()).includes("ネタバレ本文") && await page.locator(".share-media img").count() === 1);
    await page.close();

    page = await open(pc, `${L}${PATHS.review}`);
    await page.locator("#share-view:not(.hidden)").waitFor();
    const reviewText = await page.locator("#share-view").innerText();
    check("review status, satisfaction, comment, moments line", ["クリア", "8.5", "最高", "このプレイのモーメント 2 件はアプリで"].every((s) => reviewText.includes(s)));
    await page.close();

    page = await open(pc, `${L}/game/42?logId=${LOG.replace("abc", "000")}`);
    await page.getByText("PlayNaviでリンクを開く", { exact: true }).waitFor();
    await page.waitForTimeout(300);
    check("share-view 404 keeps today's page", await page.locator("#share-view").isHidden() && await page.locator("#store-buttons").isVisible() && await page.locator("#share-soft").isHidden() && await page.locator("#pn-share-view").count() === 0);
    await page.close();

    const before = upstream.length;
    const beforeBrowser = browserRequests.length;
    page = await open(pc, `${L}/game/42`);
    await page.getByText("PlayNaviでリンクを開く", { exact: true }).waitFor();
    await page.waitForTimeout(300);
    check("a game link never asks share-view", upstream.slice(before).every((url) => url.startsWith(META)));
    check("a game link does not load the share-view module", !browserRequests.slice(beforeBrowser).includes("/assets/share-view.mjs"));
    await page.close();
    await pc.close();

    // /s/<code>: 中身はすぐ出て、今までどおり 50 ms 後に正規の住所へ移る (正規の住所でも中身が出る)
    const short = await context({ viewport: { width: 1440, height: 900 } });
    page = await short.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    await page.route(`https://playnavi.app/api/share-links/${CODE}`, async (route) => { await held; await route.fallback(); });
    await page.goto(`https://playnavi.app/s/${CODE}`, { waitUntil: "commit" });
    await page.locator("#share-view:not(.hidden)").waitFor();
    check("/s/<code> shows the content before the short link is resolved", (await page.locator("#share-view").innerText()).includes("ついに倒した") && page.url() === `https://playnavi.app/s/${CODE}`);
    release();
    await page.waitForURL(`${L}${PATHS.moment}`);
    await page.locator("#share-view:not(.hidden)").waitFor();
    check("/s/<code> still moves on to the canonical URL, which shows the content too", (await page.locator("#share-view").innerText()).includes("ついに倒した"));
    await short.close();

    for (const userAgent of ["iPhone", "Android"]) {
      const mobile = await context({ userAgent, viewport: { width: 390, height: 844 }, isMobile: true });
      page = await open(mobile, `${L}${PATHS.moment}`, "commit");
      await page.locator("#share-view:not(.hidden)").waitFor();
      check(`${userAgent} keeps the app button`, await page.locator("#primary-btn").getAttribute("href") === (userAgent === "iPhone" ? `https://playnavi-links.vercel.app${PATHS.moment}` : `playnavi:/${PATHS.moment}`));
      check(`${userAgent} app button is below the content`, (await page.locator("#primary-btn").boundingBox()).y > (await page.locator(".share-media").boundingBox()).y);
      await page.locator("#store-buttons:not(.hidden)").waitFor({ timeout: 4000 });
      check(`${userAgent} store buttons appear under the content after 2 s`, (await page.locator("#store-buttons").boundingBox()).y > (await page.locator(".share-media").boundingBox()).y);
      check(`${userAgent} content is still on screen after the launch attempt`, await page.locator("#share-view").isVisible() && !await page.locator("#heading").isVisible());
      check(`${userAgent} has no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await mobile.close();
    }
    check("no browser runtime errors", errors.length === 0);
    console.log(JSON.stringify({ checks: checks.length, pass: checks.length, boundary: "real Chrome + real share-preview handler + local HTTP; EF fixtures; Vercel/EF/OS not verified" }));
  } finally {
    await browser.close(); server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
