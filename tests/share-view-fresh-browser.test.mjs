import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium } from "playwright-core";
import sharp from "sharp";

import { createSharePreviewHandler } from "../api/share-preview.mjs";

// TASK-20261026-003 B4・B5 (運営者 10/29): 記録のページを本物の Chrome で開き、
//   B4 変換中の動画は「動画を準備中」のままにせず、変換が終わる (EF が再生の住所を返す) とページを読み直さずにその場で再生できる形になる
//   B5 読めない絵 (署名の期限切れ = 400) は「?」を出さずに隠す
// HTML は本物の api/share-preview.mjs が作る (EF は手元の見本)。時計は Playwright の clock で 20 秒進める。
// 撮った写真は playnavi-app の docs/design/TASK-20261026-003-shots/r7/ に置く (SHOTS_DIR があれば)。
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const LOG = "12345678-1234-1234-1234-123456789abc";
const MOMENT = "abcdefab-cdef-cdef-cdef-abcdefabcdef";
const PATH = `/game/42?logId=${LOG}&moment=${MOMENT}`;
const F = "https://fixture.example";
const view = (videoReady) => ({
  kind: "moment", canonical_path: PATH, app_url: `https://links.playnavilab.com${PATH}`,
  game: { id: 42, title: "eFootball 2024", cover_url: `${F}/cover.png` },
  author: { display_name: "emiya", avatar_url: `${F}/avatar.png` },
  date: "2026-10-29T12:00:00Z", spoiler: false, title: "初ゴール", body: "動画と写真",
  media: [
    videoReady
      ? { kind: "video", url: `${F}/clip.mp4`, poster_url: `${F}/poster.png`, duration_ms: 97_000 }
      : { kind: "video", url: null, preparing: true, poster_url: `${F}/poster.png`, duration_ms: 97_000 },
    { kind: "image", url: `${F}/expired.png`, width: 30, height: 60 },
    { kind: "image", url: `${F}/ok.png`, width: 40, height: 30 },
  ],
  album: [
    { kind: "image", url: `${F}/expired.png`, thumb_url: `${F}/expired.png`, poster_url: null, width: 30, height: 60, duration_ms: null, memory_id: MOMENT, spoiler: false, date: "2026-10-29T12:00:00Z", title: "初ゴール" },
    { kind: "image", url: `${F}/ok.png`, thumb_url: `${F}/ok.png`, poster_url: null, width: 40, height: 30, duration_ms: null, memory_id: MOMENT, spoiler: false, date: "2026-10-29T12:00:00Z", title: "初ゴール" },
    { kind: "image", url: `${F}/ok.png`, thumb_url: `${F}/ok.png`, poster_url: null, width: 40, height: 30, duration_ms: null, memory_id: null, spoiler: false, date: "2026-10-28T12:00:00Z", title: null },
  ],
  album_total: 3,
});

test("B4・B5: 変換中の動画は終わるとその場で再生できる形に変わる・読めない絵は「?」を出さずに隠す", async () => {
  let videoReady = false;
  let viewCalls = 0;
  const handler = createSharePreviewHandler({
    metaUrl: "https://meta.fixture/share-preview-meta",
    viewUrl: "https://meta.fixture/share-view",
    fetchImpl: async (url) => {
      if (String(url).includes("share-preview-meta")) return Response.json({ status: "ok", card: { title: "t", description: "d", image_url: `${F}/cover.png` } });
      viewCalls += 1;
      return Response.json({ status: "ok", view: view(videoReady) });
    },
  });
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      if (/^\/(?:assets\/[a-z0-9_.\/-]+|logo\.png)$/.test(url.pathname) && !url.pathname.includes("..")) {
        response.setHeader("Content-Type", { ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webp": "image/webp" }[extname(url.pathname)] ?? "image/png");
        response.end(await readFile(join(ROOT, url.pathname.slice(1))));
        return;
      }
      const game = /^\/game\/([^/]+)$/.exec(url.pathname);
      if (!game) { response.setHeader("Content-Type", "text/html"); response.end(await readFile(join(ROOT, "index.html"))); return; }
      const recorder = {
        setHeader: (name, value) => response.setHeader(name, value),
        status(status) { response.statusCode = status; return this; },
        send(body) { response.end(body); return this; },
      };
      await handler({ method: "GET", headers: { host: "links.playnavilab.com" }, query: { ...Object.fromEntries(url.searchParams), kind: "game", id: game[1], host: "links.playnavilab.com" } }, recorder);
    } catch { response.writeHead(500).end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#3366cc" } }).png().toBuffer();
  const tall = await sharp({ create: { width: 30, height: 60, channels: 3, background: "#cc6633" } }).png().toBuffer();
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", headless: true });
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    // 署名の期限が切れた絵 = Supabase の置き場は 400 と JSON を返す
    await ctx.route(`${F}/**`, (route) => route.request().url().endsWith("/expired.png")
      ? route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ statusCode: "400", error: "InvalidJWT", message: '"exp" claim timestamp check failed' }) })
      : route.fulfill({ contentType: "image/png", body: route.request().url().endsWith("/poster.png") ? tall : png }));
    await ctx.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, (route) => route.abort());
    await ctx.route(/^https:\/\/links\.playnavilab\.com\//, async (route) => {
      const url = new URL(route.request().url());
      const r = await fetch(`${origin}${url.pathname}${url.search}`);
      await route.fulfill({ status: r.status, headers: Object.fromEntries(r.headers), body: Buffer.from(await r.arrayBuffer()) });
    });
    const page = await ctx.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.install();
    await page.goto(`https://links.playnavilab.com${PATH}`, { waitUntil: "load" });
    await page.locator("#share-view:not(.hidden)").waitFor();
    await page.evaluate(() => Promise.all([...document.querySelectorAll("#share-view img")].map((img) => { img.loading = "eager"; return img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }); })));
    await page.waitForTimeout(300);
    assert.equal(viewCalls, 1);
    assert.ok((await page.locator("#share-view").innerText()).includes("動画を準備中"), "最初は準備中 (元の動画を渡せない場合)");
    const broken = await page.evaluate(() => [...document.querySelectorAll("#share-view img.is-broken")].map((img) => ({ src: img.getAttribute("src"), visibility: getComputedStyle(img).visibility })));
    assert.ok(broken.length >= 2 && broken.every((b) => b.src.endsWith("/expired.png") && b.visibility === "hidden"), `読めない絵は隠す: ${JSON.stringify(broken)}`);
    assert.equal(await page.locator("#share-view img:not(.is-broken)[src$='/ok.png']").count() >= 1, true, "読めた絵はそのまま");
    const shots = process.env.SHOTS_DIR;
    if (shots) {
      await mkdir(shots, { recursive: true });
      await page.screenshot({ path: join(shots, "B-web-share-preparing-390.png"), fullPage: true });
    }
    // 変換が終わる → 20 秒後の取り直しでその場で再生できる形 (▶) に変わる。ページは読み直さない
    videoReady = true;
    const marker = await page.evaluate(() => { window.__pnSame = 1; return 1; });
    await page.clock.fastForward(21_000);
    await page.waitForFunction(() => document.querySelector("#share-view")?.innerText.includes("動画を準備中") === false, null, { timeout: 5000 });
    assert.equal(viewCalls, 2, "取り直しは 1 回");
    assert.equal(await page.evaluate(() => window.__pnSame), marker, "ページは読み直していない (同じ window)");
    // 投稿の一覧の動画の札は ▶ と長さ (押すと全画面で再生) になり、準備中の印は消える
    assert.equal(await page.locator(".pn-post-tile.pn-album-video .pn-album-play").count(), 1);
    assert.equal(await page.locator(".pn-video-preparing").count(), 0);
    if (shots) await page.screenshot({ path: join(shots, "B-web-share-ready-390.png"), fullPage: true });
    // 準備中が無くなったら取り直しは止まる
    await page.clock.fastForward(61_000);
    await page.waitForTimeout(200);
    assert.equal(viewCalls, 2, "準備中が無ければ取り直さない");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
