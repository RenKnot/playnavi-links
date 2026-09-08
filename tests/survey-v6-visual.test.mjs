import assert from "node:assert/strict";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { chromium } from "playwright-core";
import {
  parseSurveyPreview,
  parseSurveyRead,
  VOICE_V5_ANSWER_KEYS,
  VOICE_V5_ANSWER_NOTE_KEYS,
} from "../assets/survey-contract.mjs";
import { surveyV5Payload } from "./fixtures/survey-v5-payload.mjs";

const CHROME_PATH = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const SLUG = "playnavi-voice-2026-stg-review-v4";
const surveyV6Payload = {
  ...surveyV5Payload,
  survey: { ...surveyV5Payload.survey, slug: SLUG, schema_version: 6 },
};
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"], [".png", "image/png"],
]);

function completeDraft() {
  const featureIds = surveyV6Payload.survey.questions.categories.flatMap(({ features }) => features.map(({ id }) => id));
  const futureIds = surveyV6Payload.survey.questions.future_options.map(({ id }) => id);
  return {
    schema_version: 6,
    submission_token: "D".repeat(43),
    values: {
      play_frequency_1m: "none", primary_play_device_1m: "", reference_period_end_on: "2026-09-07",
      usage_1m: "days_1_4", overall_satisfaction: "somewhat_satisfied", unprompted_need: "",
      info_seek_days_1m: "days_0", recording_preference: "none", valuable_features: ["play_log"],
      valuable_feature_reasons: {}, unused_features: ["avatar_cover"], unused_feature_reason_by_feature: {},
      primary_problem: "library_input", dormant_reason: "", problem_comment: "", problem_outcome: "",
      future_role: "current_is_fine", future_role_other: "", future_candidates: ["none"], future_other: "",
      future_priority: "", future_priority_mode: "", future_detail_a: "", future_detail_b: "",
      future_detail_other: "", improvement_vs_candidate: "", feature_display_order: featureIds,
      future_display_order: futureIds,
      answer_notes: Object.fromEntries(VOICE_V5_ANSWER_NOTE_KEYS.map((key) => [key, ""])),
    },
  };
}

async function fixtureServer() {
  const submissions = [];
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      response.setHeader("Cache-Control", "no-store");
      if (request.method === "GET" && url.pathname === `/api/surveys/${SLUG}`) {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({
          ...surveyV6Payload,
          response: request.headers.cookie?.includes("v6_answered=1") ? { already_submitted: true } : null,
        }));
        return;
      }
      if (request.method === "POST" && url.pathname === `/api/surveys/${SLUG}/responses`) {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        submissions.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({
          status: "ok",
          submission: { submitted_at: "2026-09-08T00:00:00Z", already_submitted: false },
          reward: { awarded: true, name_ja: "テスト称号" },
        }));
        return;
      }
      const relative = url.pathname === `/surveys/${SLUG}` ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
      if (relative.includes("..") || !/^(?:index\.html|logo\.png|assets\/[a-z0-9_./-]+)$/i.test(relative)) {
        response.writeHead(404).end();
        return;
      }
      const path = join(REPO_ROOT, relative);
      response.setHeader("Content-Type", contentTypes.get(extname(path)) || "application/octet-stream");
      response.end(await readFile(path));
    } catch (error) {
      response.writeHead(500).end(error instanceof Error ? error.message : "fixture error");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    submissions,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function next(page) {
  const key = await page.locator(".survey-step-page").getAttribute("data-step");
  await page.locator("#survey-next").click();
  await page.waitForFunction((previous) => document.querySelector(".survey-step-page")?.dataset.step !== previous, key);
}

test("schema-v6 reuses the frozen v5 answer contract additively", () => {
  const survey = parseSurveyRead(surveyV6Payload, SLUG);
  assert.equal(survey.schemaVersion, 6);
  assert.equal(survey.voice.kind, "playnavi_voice_2026_reviewed_monthly");
  assert.equal(parseSurveyPreview({ status: "ok", survey: {
    slug: SLUG, title: "題", description: "説明", schema_version: 6,
  } }, SLUG).schemaVersion, 6);
});

test("schema-v6 revised flow works in real mobile Chrome", { timeout: 120_000 }, async () => {
  await access(CHROME_PATH, constants.X_OK).catch(() => assert.fail(`Real Chrome is required at ${CHROME_PATH}`));
  const fixture = await fixtureServer();
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, locale: "ja-JP" });
  const page = await context.newPage();
  await page.addInitScript(({ slug, draft }) => {
    sessionStorage.setItem(`pn_survey_draft:${slug}`, JSON.stringify(draft));
  }, { slug: SLUG, draft: completeDraft() });
  try {
    await page.goto(`${fixture.origin}/surveys/${SLUG}`, { waitUntil: "networkidle" });
    await page.locator('[data-step="intro"]').waitFor();
    await next(page);
    assert.equal(await page.locator(".v6-optional-note textarea").isVisible(), true);
    assert.equal(await page.locator("details.optional-note").count(), 0);
    await next(page);
    await next(page);
    assert.equal(await page.locator(".v5-question-heading > span").textContent(),
      "日頃ゲームを楽しむなかで、「こういうことがしたいのにできない」と感じることがあれば教えてください。（任意）");
    assert.equal(await page.locator(".question-hint").textContent(),
      "PlayNaviとは関係ないことでかまいません。思いつかなければ、空欄のまま次へ進めてください。");
    const hintBeforeInput = await page.locator(".v5-question-controls").evaluate((root) => {
      const hint = root.querySelector(".question-hint");
      const textarea = root.querySelector("textarea");
      return Boolean(hint.compareDocumentPosition(textarea) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    assert.equal(hintBeforeInput, true);
    await next(page);
    await next(page);

    assert.equal(await page.locator(".feature-comment-section > h3").textContent(), "選んだ機能について");
    assert.match(await page.locator(".feature-comment-label").textContent(), /^プレイログ（任意）/);
    assert.equal(await page.locator(".feature-choice-row .feature-comment-label").count(), 0);
    await page.locator(".feature-comment-label textarea").fill("振り返りに役立つ");
    await next(page);

    assert.equal(await page.locator(".survey-step-page").getAttribute("data-step"), "unused");
    assert.equal(await page.locator(".reason-board, .reason-drag-handle").count(), 0);
    assert.equal(await page.locator(".unused-reason-group").count(), 1);
    assert.equal(await page.locator(".v6-optional-note textarea").isVisible(), true);
    await page.locator('input[name="unused-reason-avatar_cover"]').nth(0).click();
    await next(page);

    assert.equal(await page.locator(".survey-step-page").getAttribute("data-step"), "problem");
    assert.equal(await page.locator(".voice-section-title").textContent(), "困りごとがあったときの行動");
    assert.equal(await page.locator('input[name="v5-outcome"]').count(), 4);
    await page.locator('input[name="v5-outcome"][value="completed"]').click();
    await next(page);
    await next(page);
    await next(page);
    assert.equal(await page.locator(".survey-step-page").getAttribute("data-step"), "review");
    await page.locator("#survey-submit").click();
    await page.locator("#result-heading").waitFor();
    assert.equal(await page.locator("#survey-title").textContent(), "回答受け付けました");
    assert.equal(await page.locator("#result-heading").textContent(), "ご回答いただきありがとうございました");
    assert.equal(await page.locator("#result-description").textContent(),
      "このまま画面を閉じて構いません。報酬のご提供まで今しばらくお待ちください。");
    assert.equal(await page.locator("#title-reward").isHidden(), true);
    assert.equal(fixture.submissions.length, 1);
    assert.deepEqual(Object.keys(fixture.submissions[0].answers), VOICE_V5_ANSWER_KEYS);
    assert.equal(fixture.submissions[0].answers.valuable_feature_reasons.play_log, "振り返りに役立つ");

    const answered = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ja-JP" });
    await answered.addCookies([{ name: "v6_answered", value: "1", url: fixture.origin }]);
    const answeredPage = await answered.newPage();
    await answeredPage.goto(`${fixture.origin}/surveys/${SLUG}`, { waitUntil: "networkidle" });
    assert.equal(await answeredPage.locator("#survey-title").textContent(), "回答済みです");
    assert.equal(await answeredPage.locator("#result-description").textContent(), "このアンケートへの回答はすでに完了しています。");
    assert.equal(await answeredPage.locator("#title-reward").isHidden(), true);
    await answered.close();
  } finally {
    await context.close();
    await browser.close();
    await fixture.close();
  }
});
