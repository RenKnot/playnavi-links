// ChatGPT 連携のベータ版の参加申し込み (TASK-20260930-006 11/4) を本物の Chrome で開いて確かめる。
// 11/4 Emiya の iPhone の写真「冒頭の案内がごちゃごちゃ平文改行なしで読みにくすぎる」「設問が枠をはみ出まくってる」「結局何を問われてるのかわからん」:
// - 案内は 1 行ずつ左にそろう (記名式の注意 → 何の機能か → 募集期間 → 次の 4 点をご確認ください)
// - 1 ページ目 = 参加の前の 4 つ。見出しが枠の中に収まり、見出しの下に説明の文、その下に「確認しました」。「必須」は並べない
// - 2 ページ目 = 問いの形の 3 問 (プラン・端末・ひとこと)
// 11/4 14:50 Emiya「雑に和訳した感じがすごい」「「一覧に載る前〜」…「自分で足す形」…AIが雑に和訳しました、みたいな文章全部やめろ」:
// - 利用者に向けた言い方 (「最初に一度、ChatGPT での設定が必要です」「ベータ版に関するご意見のお願い」)。訳し言葉・運営の都合の言い方を使わない
// 11/4 17:2x Emiya の iPhone: スマートフォンのブラウザでも追加できる → 「パソコンで」「スマートフォンでは設定できません」と書かない
// 中身は playnavi-supabase sql/pending/2026-11-04-task20260930-006-chatgpt-beta-wording.sql と同じ (tests/fixtures/chatgpt-beta-apply-survey.json)。
// 写真は OUT_DIR があればそこへ書く。BROWSER=webkit なら WebKit (iPhone の Safari と同じ描き方。playwright の webkit が要る)
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const OUT_DIR = process.env.OUT_DIR || "";
const fixture = JSON.parse(await readFile(new URL("./fixtures/chatgpt-beta-apply-survey.json", import.meta.url), "utf8"));
const SLUG = fixture.slug;

async function launch() {
  if (process.env.BROWSER === "webkit") {
    const { webkit, devices } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
    return { browser: await webkit.launch(), device: devices["iPhone 13"] };
  }
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", headless: true, args: ["--force-color-profile=srgb"] });
  return { browser, device: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } };
}

test("ChatGPT 連携のベータ版の参加申し込み: 訳し言葉・運営の都合の言い方を使わない (11/4 14:50 Emiya)", () => {
  const text = [fixture.title, fixture.description, ...fixture.questions.flatMap((q) => [q.label, q.detail || "", ...(q.options || [])])].join("\n");
  for (const phrase of ["一覧に載", "自分で足", "足す", "足した", "先行ベータ", "応募", "承認は", "まとめて行い", "感想のお願い", "1 回だけ設定", "分からない", "スマートフォンでは設定できません", "パソコンでの設定", "パソコンのブラウザ", "使うパソコン"]) {
    assert.doesNotMatch(text, new RegExp(phrase), `「${phrase}」を使わない`);
  }
  const consent = fixture.questions.filter((q) => q.type === "consent").map((q) => q.label);
  assert.deepEqual(consent, ["最初に一度、ChatGPT での設定が必要です", "ベータ版のため、内容の変更や提供の終了があります", "ご利用開始は、PlayNavi アプリの通知でお知らせします", "ベータ版に関するご意見のお願い"]);
});

const surveyPayload = {
  status: "ok",
  survey: {
    slug: SLUG,
    title: fixture.title,
    description: fixture.description,
    schema_version: 1,
    identity_mode: "identified",
    opens_at: "2026-11-04T00:00:00Z",
    closes_at: "2026-11-07T14:59:59Z",
    reward: null,
    questions: fixture.questions,
  },
  response: null,
};
const contentTypes = new Map([[".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"], [".mjs", "text/javascript; charset=utf-8"], [".png", "image/png"]]);

async function startServer() {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    response.setHeader("Cache-Control", "no-store");
    if (request.method === "GET" && url.pathname === `/api/surveys/${SLUG}`) {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(surveyPayload));
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
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

async function shot(page, name) {
  if (!OUT_DIR) return;
  await mkdir(OUT_DIR, { recursive: true });
  await page.screenshot({ path: join(OUT_DIR, `${name}.png`), fullPage: true });
}

/** 見出し (legend) が枠 (fieldset) の内側に収まっているか。枠の上辺より上にはみ出していないか */
async function legendBoxes(page) {
  return page.$$eval(".survey-step-page:not([hidden]) .question-v1", (cards) => cards.map((card) => {
    const box = card.getBoundingClientRect();
    const legend = card.querySelector(":scope > legend").getBoundingClientRect();
    return { id: card.dataset.questionId, cardTop: box.top, cardLeft: box.left, cardRight: box.right, legendTop: legend.top, legendLeft: legend.left, legendRight: legend.right };
  }));
}

test("ChatGPT 連携のベータ版の参加申し込み: 案内は 1 行ずつ・見出しは枠の中・説明の文・問いの形", async () => {
  const { browser, device } = await launch();
  const server = await startServer();
  const context = await browser.newContext({ ...device, locale: "ja-JP", reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    await page.goto(`${server.origin}/surveys/${SLUG}`, { waitUntil: "networkidle" });
    await page.locator("#survey-form").waitFor({ state: "visible" });

    // 案内: 記名式の注意が 1 行目、続いて何の応募か・期間・まず 4 つ (改行で分かれ、左にそろう)
    const description = page.locator("#survey-description");
    assert.equal(await description.evaluate((el) => getComputedStyle(el).whiteSpace), "pre-line");
    assert.equal(await description.evaluate((el) => getComputedStyle(el).textAlign), "left");
    const lines = (await description.innerText()).split("\n").map((line) => line.trim()).filter(Boolean);
    assert.match(lines[0], /^【記名式】/);
    assert.match(lines.join("\n"), /募集期間：11月5日（木）10:00〜11月7日（土）23:59/);
    assert.ok(lines.length >= 4, `案内は 4 行以上 (今 ${lines.length} 行)`);
    await shot(page, `apply-page1-${process.env.BROWSER || "chrome"}`);

    // 1 ページ目: 参加の前の 4 つ。見出しは枠の中、説明の文、確認しました、「必須」は無い
    const consentIds = fixture.questions.filter((q) => q.type === "consent").map((q) => q.id);
    assert.equal(consentIds.length, 4);
    for (const box of await legendBoxes(page)) {
      assert.ok(box.legendTop >= box.cardTop + 1, `${box.id}: 見出しが枠の上辺にかかっている (${box.legendTop} < ${box.cardTop})`);
      assert.ok(box.legendLeft >= box.cardLeft && box.legendRight <= box.cardRight + 0.5, `${box.id}: 見出しが枠の横からはみ出している`);
    }
    for (const id of consentIds) {
      const card = page.locator(`[data-question-id="${id}"]`);
      const question = fixture.questions.find((q) => q.id === id);
      assert.equal((await card.locator(":scope > legend").innerText()).trim(), question.label);
      assert.equal(await card.locator(".question-detail").innerText(), question.detail);
      assert.equal(await card.locator(".required").count(), 0);
      assert.match(await card.innerText(), /確認しました/);
    }
    // 1 ページ目に 2 ページ目の設問は出ない (11/4 まで全ページが並んでいた)
    assert.equal(await page.locator('[data-question-id="chatgpt_plan"]').isVisible(), false);
    // 付けずに進むと止まる → 全部付けると 2 ページ目
    await page.locator("#survey-next").click();
    await page.locator("#survey-error").waitFor({ state: "visible" });
    for (const id of consentIds) await page.locator(`input[name="question-${id}"]`).check();
    await page.locator("#survey-next").click();

    // 2 ページ目: 問いの形の 3 問。見出しは枠の中
    await page.locator('[data-question-id="chatgpt_plan"]').waitFor({ state: "visible" });
    assert.equal(await page.locator(`[data-question-id="${consentIds[0]}"]`).isVisible(), false, "2 ページ目に 1 ページ目の確認は出ない");
    assert.match(await page.locator('[data-question-id="chatgpt_plan"] > legend').innerText(), /^お使いの ChatGPT のプランを教えてください/);
    assert.match(await page.locator('[data-question-id="pc"] > legend').innerText(), /^設定に使う端末を教えてください/);
    for (const box of await legendBoxes(page)) {
      assert.ok(box.legendTop >= box.cardTop + 1, `${box.id}: 見出しが枠の上辺にかかっている`);
    }
    await shot(page, `apply-page2-${process.env.BROWSER || "chrome"}`);
  } finally {
    await context.close();
    await browser.close();
    await server.close();
  }
});
