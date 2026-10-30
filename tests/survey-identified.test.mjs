// 記名式のアンケート (TASK-20260930-006 B2。回答を PlayNavi のアカウントに結び付ける) を本物の Chrome で開いて確かめる。
// - ログインの前: 記名式の案内が出て、ゲストで答えるボタンは出ない
// - 回答の画面: 説明の頭に【記名式】、「確認しました」のチェック。付けないと送れない。付けると true だけを送る
// - 送信の後: 「受け付けました」
// API の答えは試験用のサーバが返す (DB の動きは playnavi-supabase の STG の試しで確かめる)。写真は OUT_DIR があればそこへ書く
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { chromium } from "playwright-core";

const CHROME_PATH = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const SLUG = "identified-test";
const OUT_DIR = process.env.OUT_DIR || "";

const surveyPayload = {
  status: "ok",
  survey: {
    slug: SLUG,
    title: "テストアンケート",
    description: "記名式の試しです。",
    schema_version: 1,
    identity_mode: "identified",
    opens_at: "2026-10-31T00:00:00Z",
    closes_at: "2026-11-07T00:00:00Z",
    reward: null,
    questions: [
      { id: "agree_notice", type: "consent", required: true, label: "注意事項を読みました" },
      { id: "plan", type: "single_choice", required: true, label: "ChatGPT のプラン", options: ["Plus", "Pro"] },
    ],
  },
  response: null,
};
const previewPayload = { status: "ok", survey: { slug: SLUG, title: "テストアンケート", description: "記名式の試しです。", identity_mode: "identified" } };

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
]);

async function startServer(signedIn) {
  const submissions = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    response.setHeader("Cache-Control", "no-store");
    if (request.method === "GET" && url.pathname === `/api/surveys/${SLUG}`) {
      response.writeHead(signedIn ? 200 : 401, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(signedIn ? surveyPayload : previewPayload));
      return;
    }
    if (request.method === "POST" && url.pathname === `/api/surveys/${SLUG}/responses`) {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      submissions.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ status: "ok", submission: { submitted_at: "2026-10-31T00:00:00Z", already_submitted: false }, reward: null }));
      return;
    }
    const relativePath = url.pathname === `/surveys/${SLUG}` ? "link.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
    if (relativePath.includes("..") || !/^(?:link\.html|logo\.png|assets\/[a-z0-9_./-]+)$/i.test(relativePath)) {
      response.writeHead(404).end();
      return;
    }
    const filePath = join(REPO_ROOT, relativePath);
    response.setHeader("Content-Type", contentTypes.get(extname(filePath)) || "application/octet-stream");
    response.end(await readFile(filePath));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { origin: `http://127.0.0.1:${port}`, submissions, close: () => new Promise((resolve) => server.close(resolve)) };
}

async function openPage(browser, origin) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: "ja-JP", reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(`${origin}/surveys/${SLUG}`, { waitUntil: "networkidle" });
  return { context, page };
}

async function shot(page, name) {
  if (!OUT_DIR) return;
  await mkdir(OUT_DIR, { recursive: true });
  await page.screenshot({ path: join(OUT_DIR, `${name}.png`), fullPage: true });
}

test("記名式のアンケート: ログインの前・回答・送信の後", async (t) => {
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true, args: ["--force-color-profile=srgb"] });
  try {
    await t.test("ログインの前: 記名式の案内、ゲストのボタンは出ない", async () => {
      const server = await startServer(false);
      const { context, page } = await openPage(browser, server.origin);
      try {
        await page.locator("#survey-login").waitFor({ state: "visible" });
        const notice = await page.locator("#survey-login .login-notice").innerText();
        assert.match(notice, /記名式です。回答は PlayNavi のアカウントに結び付けて受け付けます/);
        assert.match(notice, /未登録の方は、PlayNavi アプリで登録してから/);
        assert.equal(await page.locator("#guest-login").isVisible(), false);
        assert.equal(await page.locator("#google-login").isVisible(), true);
        await shot(page, "identified-login-390");
      } finally {
        await context.close();
        await server.close();
      }
    });
    await t.test("回答: 【記名式】と確認のチェック。付けないと送れず、付けると true だけを送る。送信の後は「受け付けました」", async () => {
      const server = await startServer(true);
      const { context, page } = await openPage(browser, server.origin);
      try {
        await page.locator("#survey-form").waitFor({ state: "visible" });
        assert.match(await page.locator("#survey-description").innerText(), /^【記名式】回答は PlayNavi のアカウントに結び付けて受け付けます。/);
        const consent = page.locator('input[name="question-agree_notice"]');
        assert.equal(await consent.getAttribute("type"), "checkbox");
        assert.match(await page.locator('[data-question-id="agree_notice"]').innerText(), /確認しました/);
        await shot(page, "identified-form-390");
        await page.locator('input[name="question-plan"][value="Pro"]').check();
        await page.locator("#survey-submit").click();
        await page.locator("#survey-error").waitFor({ state: "visible" });
        assert.equal(server.submissions.length, 0, "確認のチェックが無いと送らない");
        await consent.check();
        await page.locator("#survey-submit").click();
        await page.locator("#survey-result").waitFor({ state: "visible" });
        assert.deepEqual(server.submissions[0].answers, { agree_notice: true, plan: "Pro" });
        assert.equal(await page.locator("#result-heading").innerText(), "受け付けました");
        await shot(page, "identified-result-390");
      } finally {
        await context.close();
        await server.close();
      }
    });
  } finally {
    await browser.close();
  }
});
