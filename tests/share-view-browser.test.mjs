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
    // r7 P2: このプレイの記録
    story: {
      review: { status: "completed", score: 8.5, comment: "親のレビューの感想", spoiler: false, date: "2026-10-19T06:00:00Z" },
      moments: [
        { memory_id: "abcdefab-cdef-cdef-cdef-abcdefab0003", title: "ほかの日", body: "ほかのモーメントの全文", date: "2026-10-18T06:00:00Z", spoiler: false,
          thumb: { kind: "image", url: `${F}/t.png`, poster_url: null }, media_count: 2,
          media: [{ kind: "image", url: `${F}/a.png`, width: 40, height: 30 }, { kind: "image", url: `${F}/b.png`, width: 40, height: 30 }] },
      ],
      moments_total: 1,
    },
  },
  [PATHS.spoiler]: { ...base(PATHS.spoiler), kind: "moment", spoiler: true, title: "正体", body: "ネタバレ本文", media: [{ kind: "image", url: `${F}/1.png` }] },
  [PATHS.review]: {
    ...base(PATHS.review), kind: "review", spoiler: false, status: "completed", score: 8.5, comment: "最高", moments_count: 2,
    media: [{ kind: "image", url: `${F}/1.png`, width: 40, height: 30 }],
    // r8: このプレイのアルバム (レビューの写真 1 + ほかのモーメントの縦長の写真・動画・ネタバレの写真) とプレイ時間・機種
    play_time: 50, platforms_played: ["Nintendo Switch 2"],
    album: [
      { kind: "image", url: `${F}/1.png`, thumb_url: `${F}/1t.png`, poster_url: null, width: 40, height: 30, duration_ms: null, memory_id: null, spoiler: false, date: "2026-10-01T00:00:00Z", title: null },
      { kind: "image", url: `${F}/tall.png`, thumb_url: `${F}/tall.png`, poster_url: null, width: null, height: null, duration_ms: null, memory_id: "abcdefab-cdef-cdef-cdef-abcdefab0003", spoiler: false, date: "2026-10-05T00:00:00Z", title: "ほかの日" },
      { kind: "video", url: `${F}/clip.mp4`, thumb_url: `${F}/p.png`, poster_url: `${F}/p.png`, width: null, height: null, duration_ms: 9_000, memory_id: "abcdefab-cdef-cdef-cdef-abcdefab0004", spoiler: false, date: "2026-10-06T00:00:00Z", title: "動画の日" },
      { kind: "image", url: `${F}/s.png`, thumb_url: `${F}/s.png`, poster_url: null, width: 40, height: 30, duration_ms: null, memory_id: "abcdefab-cdef-cdef-cdef-abcdefab0002", spoiler: true, date: "2026-10-07T00:00:00Z", title: "正体" },
    ],
    album_total: 4,
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
        response.setHeader("Content-Type", { ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webp": "image/webp" }[extname(url.pathname)] ?? "image/png");
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
  const tall = await sharp({ create: { width: 30, height: 60, channels: 3, background: "#cc6633" } }).png().toBuffer();
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", headless: true });
  const errors = [];
  const checks = [];
  const check = (name, value) => { assert.ok(value, name); checks.push(name); };
  const context = async (options = {}) => {
    const ctx = await browser.newContext(options);
    await ctx.route(`${F}/**`, (route) => route.fulfill({ contentType: "image/png", body: route.request().url().endsWith("/tall.png") ? tall : png }));
    // 書体 (Google Fonts) はここでは読まない (無くても端末の書体で描ける = display=swap)
    await ctx.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, (route) => route.abort());
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
    check("markup in the body stays text", (await page.locator(".pn-body").innerText()) === "</script><script>alert(1)</script>" && await page.locator("#share-view script, #share-view b").count() === 0);
    check("the embedded JSON did not break out of its script", await page.locator("script").count() === 2);
    check("record page mark and Noto Sans JP stylesheet", await page.evaluate(() => document.documentElement.classList.contains("pn-rec-page")) && await page.locator('link[rel=stylesheet][href^="https://fonts.googleapis.com/css2?family=Noto+Sans+JP"]').count() === 1);
    check("today's spinner text and card are hidden", !await page.locator("#heading").isVisible() && !await page.locator("#spinner").isVisible() && !await page.locator("#link-view > .logo").isVisible());
    check("one slide per photo / video (4), a 1/4 counter and 4 dots", await page.locator(".pn-track > .pn-slide").count() === 4 && (await page.locator(".pn-counter").innerText()) === "1/4" && await page.locator(".pn-dot").count() === 4);
    const frame = await page.locator(".pn-frame").boundingBox();
    const details = await page.locator(".pn-details").boundingBox();
    check("PC: media on the left (~60%), details on the right", frame.x < details.x && details.x > 1440 * 0.5 && frame.width > details.width);
    check("PC: content is centred and at most the shell width", Math.abs((frame.x) - (1440 - details.x - details.width)) < 4);
    check("frame ratio is reserved from the first sized photo (40x30 = 4:3)", Math.abs(frame.width / frame.height - 4 / 3) < 0.02);
    check("the browser never asks for the content (it is in the HTML)", !browserRequests.some((path) => path.includes("share-view") && !path.endsWith(".mjs")));
    check("r7: no Safari app banner", await page.locator('meta[name="apple-itunes-app"]').count() === 0);
    check("r7: PlayNavi is only the small mark and the quiet end line (no pill, no fixed bar, no badges)", await page.locator(".pn-top-open, .pn-bar, .pn-foot, .pn-badges").count() === 0 && (await page.locator(".pn-logo").boundingBox()).width <= 90 && await page.locator("#share-view img[src*=badge]").count() === 0);
    check("r7: PC end line has the small store text links, not the app button", await page.locator(".pn-end-stores a").count() === 2 && await page.locator(".pn-end-stores").isVisible() && !await page.locator("#primary-btn").isVisible() && await page.evaluate(() => getComputedStyle(document.querySelector(".pn-end")).position) === "static");
    // r7 P2: このプレイの記録 — 親のレビュー + ほかのモーメント。押すとその場で開く
    check("r7: the story shows the parent review and the other moment below the record", (await page.locator(".pn-story").innerText()).includes("このプレイの記録") && (await page.locator(".pn-story-review").innerText()).includes("8.5") && (await page.locator(".pn-story-review").innerText()).includes("親のレビューの感想") && await page.locator(".pn-story-item").count() === 1 && (await page.locator(".pn-story").boundingBox()).y > (await page.locator(".pn-frame").boundingBox()).y + (await page.locator(".pn-frame").boundingBox()).height);
    await page.locator(".pn-story-toggle").click();
    await page.locator(".pn-story-item.is-open .pn-story-photo").first().waitFor();
    check("r7: tapping the moment opens it in place with its photos", await page.locator(".pn-story-item.is-open .pn-story-photo").count() === 2 && await page.locator(".pn-story-toggle").getAttribute("aria-expanded") === "true");
    await page.locator(".pn-story-photo").nth(1).click();
    await page.locator(".share-viewer").waitFor();
    check("r7: a story photo opens the viewer", (await page.locator(".share-viewer-counter").innerText()) === "2 / 2");
    await page.keyboard.press("Escape");
    await page.evaluate(() => window.scrollTo(0, 0));
    // 動画: 見本の住所は PNG を返す = 再生できない動画 (Q7)
    await page.locator(".pn-track").focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => document.querySelector(".pn-counter")?.textContent === "2/4");
    check("arrow keys move the carousel", true);
    await page.keyboard.press("ArrowLeft");
    await page.waitForFunction(() => document.querySelector(".pn-counter")?.textContent === "1/4");
    await page.locator(".pn-slide-video.is-unplayable").waitFor({ timeout: 5000 });
    check("Q7: a broken video shows the poster, the message and an app link", (await page.locator(".pn-video-fail").innerText()).includes("このブラウザでは再生できません") && (await page.locator(".pn-video-fail-link").innerText()) === "アプリで見る" && await page.locator(".pn-video[poster]").count() === 1);
    check("video plays in place: playsinline, no autoplay, no controls before start", await page.locator("video.pn-video[playsinline][preload=metadata]:not([autoplay]):not([muted])").count() === 1);
    await page.locator(".pn-nav-next").click();
    await page.waitForFunction(() => document.querySelector(".pn-counter")?.textContent === "2/4");
    await page.locator(".pn-slide-photo").nth(1).click();
    await page.locator(".share-viewer").waitFor();
    check("viewer opens on the tapped photo", (await page.locator(".share-viewer-counter").innerText()) === "2 / 3");
    await page.keyboard.press("ArrowRight");
    check("arrow key moves to the next photo", (await page.locator(".share-viewer-counter").innerText()) === "3 / 3");
    await page.keyboard.press("Escape");
    check("Escape closes the viewer", await page.locator(".share-viewer").count() === 0);
    await page.close();

    page = await open(pc, `${L}${PATHS.spoiler}`);
    await page.locator("#share-view:not(.hidden)").waitFor();
    check("spoiler hides text and blurs the media", !(await page.locator("#share-view").innerText()).includes("ネタバレ本文") && await page.locator(".pn-rec.is-spoiler .pn-track[inert]").count() === 1 && (await page.locator(".pn-track").evaluate((node) => getComputedStyle(node).filter)).includes("blur"));
    await page.getByRole("button", { name: "ネタバレを表示" }).click();
    check("reveal shows them", (await page.locator("#share-view").innerText()).includes("ネタバレ本文") && await page.locator(".pn-track[inert]").count() === 0 && (await page.locator(".pn-track").evaluate((node) => getComputedStyle(node).filter)) === "none");
    await page.close();

    page = await open(pc, `${L}${PATHS.review}`);
    await page.locator("#share-view:not(.hidden)").waitFor();
    const reviewText = await page.locator("#share-view").innerText();
    check("review status, satisfaction, comment, moments line", ["さんのレビュー", "クリア", "8.5", "/ 10", "最高", "このプレイのモーメント 2 件はアプリで"].every((s) => reviewText.includes(s)));
    check("satisfaction bar is 85%", Math.round((await page.locator(".pn-score-fill").boundingBox()).width / (await page.locator(".pn-score-bar").boundingBox()).width * 100) === 85);
    // r8: プレイ時間・機種、「このプレイのアルバム（4）」(切らずに並べる)、全画面で全部を送る
    check("r8: review play time and platform", reviewText.includes("30〜50時間") && reviewText.includes("Nintendo Switch 2"));
    check("r8: the album heading carries the count and the jump link sits next to the text", (await page.locator(".pn-album-title").innerText()).replace(/\s/g, "") === "このプレイのアルバム（4）" && (await page.locator(".pn-album-jump").getAttribute("href")) === "#pn-album" && (await page.locator(".pn-album-jump").boundingBox()).x > 700);
    await page.evaluate(() => Promise.all([...document.querySelectorAll(".pn-album img")].map((img) => { img.loading = "eager"; return img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }); })));
    await page.waitForTimeout(300);
    const tiles = await page.evaluate(() => [...document.querySelectorAll(".pn-album-tile")].map((tile) => {
      const r = tile.getBoundingClientRect(); const img = tile.querySelector("img");
      return { ratio: r.width / r.height, natural: img.naturalWidth / img.naturalHeight, fit: getComputedStyle(img).objectFit, top: Math.round(r.top) };
    }));
    check("r8: every album tile has its photo's own ratio (the 30x60 one fixed after loading) and is drawn uncropped (contain)", tiles.length === 4 && tiles.every((t) => Math.abs(t.ratio - t.natural) / t.natural < 0.03 && t.fit === "contain"));
    check("r8: tiles in one row share the height (justified rows)", new Set(tiles.map((t) => t.top)).size <= 2);
    check("r8: the spoiler tile is blurred until revealed", (await page.locator(".pn-album-tile.is-spoiler .pn-album-img").evaluate((node) => getComputedStyle(node).filter)).includes("blur"));
    await page.locator(".pn-album-tile").nth(1).click();
    await page.locator(".pn-av").waitFor();
    check("r8: a tile opens the one viewer on that item", (await page.locator(".pn-av-counter").innerText()) === "2 / 4" && (await page.locator(".pn-av-caption-title").innerText()) === "ほかの日" && await page.locator(".pn-av-thumb").count() === 4);
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => document.querySelector(".pn-av-counter")?.textContent === "3 / 4");
    // 前後の 1 枚は先に読み込む (preload=metadata) ので、見本の「動画」(中身は PNG) は押す前に再生できないと分かる
    check("r8: the video next to the current item is preloaded (metadata only)", await page.locator(".pn-av-slide").nth(2).locator("video[src][playsinline]").count() === 1);
    await page.locator(".pn-av-slide.is-unplayable").waitFor({ timeout: 5000 });
    check("r8: a video the browser cannot play shows the message and the app link in the viewer", (await page.locator(".pn-av-slide").nth(2).innerText()).includes("このブラウザでは再生できません"));
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => document.querySelector(".pn-av-counter")?.textContent === "4 / 4");
    check("r8: a spoiler item in the viewer is covered until 「ネタバレを表示」", await page.locator(".pn-av-slide.is-spoiler").count() === 1 && await page.locator(".pn-av-slide").nth(3).locator(".pn-spoiler-button").isVisible());
    await page.locator(".pn-av-slide").nth(3).locator(".pn-spoiler-button").click();
    check("r8: revealing in the viewer also unblurs the album tile", await page.locator(".pn-av-slide.is-spoiler").count() === 0 && await page.locator(".pn-album-tile.is-spoiler").count() === 0);
    await page.locator(".pn-av-thumb").nth(0).click();
    await page.waitForFunction(() => document.querySelector(".pn-av-counter")?.textContent === "1 / 4" && document.querySelector(".pn-av-track").scrollLeft === 0);
    const zoomBox = await page.locator(".pn-av-slide").nth(0).locator(".pn-av-zoom").boundingBox();
    await page.mouse.dblclick(zoomBox.x + zoomBox.width / 2, zoomBox.y + zoomBox.height / 2);
    check("r8: double click zooms the photo in the viewer", (await page.locator(".pn-av-slide").nth(0).locator(".pn-av-img").evaluate((node) => node.style.transform)).includes("scale(2.5)"));
    await page.keyboard.press("Escape");
    check("r8: Escape closes the album viewer", await page.locator(".pn-av").count() === 0);
    await page.locator(".pn-slide-photo").first().click();
    await page.locator(".pn-av").waitFor();
    check("r8: the post's photo opens the album viewer on the same photo", (await page.locator(".pn-av-counter").innerText()) === "1 / 4");
    await page.keyboard.press("Escape");
    await page.close();

    page = await open(pc, `${L}/game/42?logId=${LOG.replace("abc", "000")}`);
    await page.getByText("PlayNaviでリンクを開く", { exact: true }).waitFor();
    await page.waitForTimeout(300);
    check("share-view 404 keeps today's page", await page.locator("#share-view").isHidden() && await page.locator("#store-buttons").isVisible() && await page.locator("#pn-share-view").count() === 0 && !await page.evaluate(() => document.documentElement.classList.contains("pn-rec-page")));
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

    const dark = await context({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
    page = await open(dark, `${L}${PATHS.review}`);
    await page.locator("#share-view:not(.hidden)").waitFor();
    check("dark mode uses the Web v2 dark colours", await page.evaluate(() => getComputedStyle(document.body).backgroundColor) === "rgb(11, 12, 14)" && await page.locator(".pn-logo-dark").isVisible() && !await page.locator(".pn-logo-light").isVisible());
    await dark.close();

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
      const appHref = userAgent === "iPhone" ? `https://playnavi-links.vercel.app${PATHS.moment}` : `playnavi:/${PATHS.moment}`;
      check(`${userAgent} keeps the app button`, await page.locator("#primary-btn").getAttribute("href") === appHref);
      check(`${userAgent} r7: the app button is one quiet text link at the very end`, await page.locator(".pn-end-slot #primary-btn").isVisible() && await page.locator(".pn-end-slot #primary-btn").evaluate((node) => getComputedStyle(node).backgroundColor) === "rgba(0, 0, 0, 0)" && (await page.locator(".pn-end").boundingBox()).y > (await page.locator(".pn-story").boundingBox()).y && await page.locator(".pn-top-open, .pn-bar").count() === 0);
      const hero = await page.locator(".pn-frame").boundingBox();
      const author = await page.locator(".pn-author").boundingBox();
      check(`${userAgent} r7: the author comes first, then the full-width media`, hero.x === 0 && hero.width === 390 && author.y < hero.y && hero.y < 140);
      check(`${userAgent} then text and game`, hero.y < (await page.locator(".pn-text").boundingBox()).y && (await page.locator(".pn-text").boundingBox()).y < (await page.locator(".pn-game").boundingBox()).y);
      check(`${userAgent} no PC arrow buttons on the phone`, !await page.locator(".pn-nav-next").isVisible());
      await page.waitForTimeout(2300);
      check(`${userAgent} r7: no store buttons or badges on the phone (today's ones stay hidden too)`, !await page.locator("#store-buttons").isVisible() && !await page.locator(".pn-end-stores").isVisible());
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
