import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium } from "playwright-core";
import sharp from "sharp";

// TASK-20261017-002 r3 共有ページを本物の Chrome で開く。/api/share-view は手元の見本 (EF share-view の C2 の形)。
// Vercel の書き換え・EF・OS のアプリ起動はここでは確かめない。
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const LOG = "12345678-1234-1234-1234-123456789abc";
const MOMENT = "abcdefab-cdef-cdef-cdef-abcdefabcdef";
const SPOILER = "abcdefab-cdef-cdef-cdef-abcdefab0002";
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
    ...base(PATHS.moment), kind: "moment", spoiler: false, title: "ついに倒した", body: "<script>alert(1)</script>",
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

test("share page shows the record, opens photos full screen, masks spoilers and keeps today's page on 404", async () => {
  const requests = [];
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      if (url.pathname === "/api/share-view") {
        const path = url.searchParams.get("path");
        requests.push({ path, cookie: request.headers.cookie });
        const view = VIEWS[path];
        response.writeHead(view ? 200 : 404, { "Content-Type": "application/json" });
        response.end(JSON.stringify(view ? { status: "ok", view } : { status: "not_found" }));
        return;
      }
      if (/^\/(?:assets\/[a-z0-9_.\/-]+|logo\.png)$/.test(url.pathname) && !url.pathname.includes("..")) {
        response.setHeader("Content-Type", extname(url.pathname) === ".mjs" ? "text/javascript" : extname(url.pathname) === ".css" ? "text/css" : "image/png");
        response.end(await readFile(join(ROOT, url.pathname.slice(1))));
        return;
      }
      response.setHeader("Content-Type", "text/html");
      response.end(await readFile(join(ROOT, "index.html")));
    } catch { response.writeHead(500).end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#3366cc" } }).png().toBuffer();
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", headless: true });
  const errors = [];
  const checks = [];
  const check = (name, value) => { assert.ok(value, name); checks.push(name); };
  const open = async (context, path, waitUntil = "load") => {
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route(`${F}/**`, (route) => route.fulfill({ contentType: "image/png", body: png }));
    await page.goto(`${origin}${path}`, { waitUntil });
    return page;
  };
  try {
    const pc = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await pc.addCookies([{ name: "private", value: "x", url: origin }]);
    let page = await open(pc, PATHS.moment);
    await page.locator("#share-view:not(.hidden)").waitFor();
    const view = page.locator("#share-view");
    check("game, author and date", (await view.innerText()).includes("Elden Ring") && (await view.innerText()).includes("あかり<b>") && (await view.innerText()).includes("2026年10月20日"));
    check("markup in the body stays text", (await page.locator(".share-text").innerText()) === "<script>alert(1)</script>" && await page.locator("#share-view script, #share-view b").count() === 0);
    check("video plays in place", await page.locator("video[controls][playsinline][preload=metadata][poster]").count() === 1);
    check("three photos", await page.locator("button.share-media-item img").count() === 3);
    check("today's spinner text is hidden", !await page.locator("#heading").isVisible());
    check("soft line under the store buttons", await page.locator("#share-soft").isVisible());
    check("column is at most 640px wide", (await page.locator("#link-view").boundingBox()).width <= 640);
    check("proxy called with the canonical path and no cookie", requests.at(-1).path === PATHS.moment && requests.at(-1).cookie === undefined);
    await page.locator("button.share-media-item").nth(1).click();
    await page.locator(".share-viewer").waitFor();
    check("viewer opens on the tapped photo", (await page.locator(".share-viewer-counter").innerText()) === "2 / 3");
    await page.keyboard.press("ArrowRight");
    check("arrow key moves to the next photo", (await page.locator(".share-viewer-counter").innerText()) === "3 / 3");
    await page.keyboard.press("Escape");
    check("Escape closes the viewer", await page.locator(".share-viewer").count() === 0);
    await page.close();

    page = await open(pc, PATHS.spoiler);
    await page.locator("#share-view:not(.hidden)").waitFor();
    check("spoiler hides text and photos", !(await page.locator("#share-view").innerText()).includes("ネタバレ本文") && await page.locator(".share-media").count() === 0);
    await page.getByRole("button", { name: "ネタバレを表示" }).click();
    check("reveal shows them", (await page.locator("#share-view").innerText()).includes("ネタバレ本文") && await page.locator(".share-media img").count() === 1);
    await page.close();

    page = await open(pc, PATHS.review);
    await page.locator("#share-view:not(.hidden)").waitFor();
    const reviewText = await page.locator("#share-view").innerText();
    check("review status, satisfaction, comment, moments line", ["クリア", "8.5", "最高", "このプレイのモーメント 2 件はアプリで"].every((s) => reviewText.includes(s)));
    await page.close();

    page = await open(pc, `/game/42?logId=${LOG.replace("abc", "000")}`);
    await page.getByText("PlayNaviでリンクを開く", { exact: true }).waitFor();
    await page.waitForTimeout(300);
    check("404 keeps today's page", await page.locator("#share-view").isHidden() && await page.locator("#store-buttons").isVisible() && await page.locator("#share-soft").isHidden());
    await page.close();

    const before = requests.length;
    page = await open(pc, "/game/42");
    await page.getByText("PlayNaviでリンクを開く", { exact: true }).waitFor();
    await page.waitForTimeout(300);
    check("a game link never asks for the share view", requests.length === before);
    await page.close();
    await pc.close();

    for (const userAgent of ["iPhone", "Android"]) {
      const mobile = await browser.newContext({ userAgent, viewport: { width: 390, height: 844 }, isMobile: true });
      page = await open(mobile, PATHS.moment, "commit");
      await page.locator("#share-view:not(.hidden)").waitFor();
      check(`${userAgent} keeps the app button`, await page.locator("#primary-btn").getAttribute("href") === (userAgent === "iPhone" ? `https://playnavi-links.vercel.app${PATHS.moment}` : `playnavi:/${PATHS.moment}`));
      check(`${userAgent} app button is below the content`, (await page.locator("#primary-btn").boundingBox()).y > (await page.locator(".share-media").boundingBox()).y);
      check(`${userAgent} has no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await mobile.close();
    }
    check("no browser runtime errors", errors.length === 0);
    console.log(JSON.stringify({ checks: checks.length, pass: checks.length, boundary: "real Chrome + local HTTP; share-view fixture; Vercel/EF/OS not verified" }));
  } finally {
    await browser.close(); server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
