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
  VOICE_V7_ANSWER_KEYS,
  validateVoiceV7Answers,
} from "../assets/survey-contract.mjs";
import { surveyV5Payload } from "./fixtures/survey-v5-payload.mjs";
import { validAnswers } from "../api/surveys/[surveySlug]/responses.mjs";

const CHROME_PATH = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const SLUG = "playnavi-voice-2026-stg-review-v4";
const surveyV6Payload = {
  ...surveyV5Payload,
  survey: { ...surveyV5Payload.survey, slug: SLUG, schema_version: 6 },
};
const V7_SLUG = "playnavi-voice-2026-stg-review-v5";
const surveyV7Payload = {
  ...surveyV5Payload,
  survey: {
    ...surveyV5Payload.survey,
    slug: V7_SLUG,
    schema_version: 7,
    questions: {
      ...surveyV5Payload.survey.questions,
      kind: "playnavi_voice_2026_reviewed_final",
      final_comment_max_length: 2_000,
    },
    reward: { name_ja: "Founding Contributor" },
  },
};
delete surveyV7Payload.survey.questions.problem_outcome_options;
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"], [".png", "image/png"],
]);

function completeDraft(payload = surveyV6Payload) {
  const featureIds = payload.survey.questions.categories.flatMap(({ features }) => features.map(({ id }) => id));
  const futureIds = payload.survey.questions.future_options.map(({ id }) => id);
  const schemaVersion = payload.survey.schema_version;
  const values = {
    play_frequency_1m: "none", primary_play_device_1m: "", reference_period_end_on: "2026-09-07",
    usage_1m: "days_1_4", overall_satisfaction: "somewhat_satisfied", unprompted_need: "",
    info_seek_days_1m: "days_0", recording_preference: "none", valuable_features: ["play_log"],
    valuable_feature_reasons: {}, unused_features: ["avatar_cover"], unused_feature_reason_by_feature: {},
    primary_problem: "library_input", dormant_reason: "", problem_comment: "", problem_outcome: "",
    future_role: "current_is_fine", future_role_other: "", future_candidates: ["none"], future_other: "",
    future_priority: "", future_priority_mode: "", future_detail_a: "", future_detail_b: "",
    future_detail_other: "", improvement_vs_candidate: "", feature_display_order: featureIds,
    future_display_order: futureIds,
    answer_notes: Object.fromEntries(VOICE_V5_ANSWER_NOTE_KEYS
      .filter((key) => schemaVersion !== 7 || key !== "problem_outcome").map((key) => [key, ""])),
  };
  if (schemaVersion === 7) {
    delete values.problem_outcome;
    values.final_comment = "";
  }
  return {
    schema_version: schemaVersion,
    submission_token: "D".repeat(43),
    values,
  };
}

async function fixtureServer(payload = surveyV6Payload, slug = SLUG) {
  const submissions = [];
  const schemaVersion = payload.survey.schema_version;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      response.setHeader("Cache-Control", "no-store");
      if (request.method === "GET" && url.pathname === `/api/surveys/${slug}`) {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({
          ...payload,
          response: request.headers.cookie?.includes("v6_answered=1") ? { already_submitted: true } : null,
        }));
        return;
      }
      if (request.method === "POST" && url.pathname === `/api/surveys/${slug}/responses`) {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        submissions.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({
          status: "ok",
          submission: { submitted_at: "2026-09-08T00:00:00Z", already_submitted: false },
          reward: schemaVersion === 7
            ? { awarded: true, name_ja: "Founding Contributor" }
            : { awarded: true, name_ja: "テスト称号" },
        }));
        return;
      }
      const relative = url.pathname === `/surveys/${slug}` ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
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

test("schema-v7 has a distinct exact final-feedback contract", () => {
  const survey = parseSurveyRead(surveyV7Payload, V7_SLUG);
  assert.equal(survey.titleName, "Founding Contributor");
  const draft = completeDraft(surveyV7Payload);
  draft.values.unused_feature_reason_by_feature.avatar_cover = "not_needed";
  const result = validateVoiceV7Answers(survey.voice, draft.values);
  assert.deepEqual(result.missing, []);
  assert.equal(result.structurallyInvalid, false);
  assert.deepEqual(Object.keys(result.answers), VOICE_V7_ANSWER_KEYS);
  assert.equal(validAnswers({ ...result.answers, final_comment: "🎮".repeat(2_000) }), true);
  assert.equal(validAnswers({ ...result.answers, final_comment: "🎮".repeat(2_001) }), false);
  assert.equal(Object.hasOwn(result.answers, "problem_outcome"), false);
  assert.equal(Object.hasOwn(result.answers.answer_notes, "problem_outcome"), false);
  assert.throws(() => parseSurveyRead({
    ...surveyV7Payload,
    survey: { ...surveyV7Payload.survey, questions: surveyV5Payload.survey.questions },
  }, V7_SLUG));
  assert.equal(parseSurveyPreview({ status: "ok", survey: {
    slug: V7_SLUG, title: "題", description: "説明", schema_version: 7,
  } }, V7_SLUG).schemaVersion, 7);
});

test("schema-v6 revised flow works in real mobile Chrome", { timeout: 120_000 }, async () => {
  await access(CHROME_PATH, constants.X_OK).catch(() => assert.fail(`Real Chrome is required at ${CHROME_PATH}`));
  const fixture = await fixtureServer();
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    locale: "ja-JP",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const draft = completeDraft();
  draft.values.info_seek_days_1m = "";
  draft.values.recording_preference = "";
  await page.addInitScript(({ slug, draft }) => {
    sessionStorage.setItem(`pn_survey_draft:${slug}`, JSON.stringify(draft));
  }, { slug: SLUG, draft });
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
    assert.equal(await page.locator(".survey-step-page").getAttribute("data-step"), "style_segment");
    await page.locator('input[name="v5-info-seeking"]').last().click();
    await page.waitForFunction(() => document.activeElement?.closest("[data-error-id]")?.dataset.errorId === "recording_preference");
    const position = await page.locator('[data-error-id="recording_preference"]').evaluate((target) => {
      const heading = target.querySelector(".v5-question-heading").getBoundingClientRect();
      const progress = document.querySelector(".survey-progress").getBoundingClientRect();
      return {
        headingTop: heading.top,
        headingBottom: heading.bottom,
        progressBottom: progress.bottom,
        viewportHeight: window.innerHeight,
      };
    });
    assert.ok(position.headingTop >= position.progressBottom,
      `next heading starts below sticky progress (${position.headingTop}px < ${position.progressBottom}px)`);
    assert.ok(position.headingBottom <= position.viewportHeight,
      `next heading remains visible (${position.headingBottom}px > ${position.viewportHeight}px)`);
    await page.locator('input[name="v5-record-detail"]').first().click();
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

test("schema-v7 keeps the next question heading visible after tap-forward", { timeout: 120_000 }, async (t) => {
  await access(CHROME_PATH, constants.X_OK).catch(() => assert.fail(`Real Chrome is required at ${CHROME_PATH}`));
  const fixture = await fixtureServer(surveyV7Payload, V7_SLUG);
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
  try {
    for (const viewport of [
      { name: "iPhone-width", width: 390, height: 844 },
      { name: "Android-width", width: 412, height: 915 },
    ]) {
      await t.test(viewport.name, async () => {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          hasTouch: true,
          isMobile: true,
          locale: "ja-JP",
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        const draft = completeDraft(surveyV7Payload);
        draft.values.info_seek_days_1m = "";
        draft.values.recording_preference = "";
        await page.addInitScript(({ slug, draft }) => {
          sessionStorage.setItem(`pn_survey_draft:${slug}`, JSON.stringify(draft));
        }, { slug: V7_SLUG, draft });
        try {
          await page.goto(`${fixture.origin}/surveys/${V7_SLUG}`, { waitUntil: "networkidle" });
          await page.locator('[data-step="intro"]').waitFor();
          assert.deepEqual(await page.locator(".voice-intro li").allTextContents(), [
            "匿名形式のアンケートです。（ログイン情報は、称号付与の判定にのみ利用します）",
            "回答内容にかかわらず、回答を送信すると称号「Founding Contributor」を受け取れます。",
            "称号は回答送信と同時に付与され、PlayNaviのプロフィールやログカードに設定できます。",
          ]);
          await next(page);
          await next(page);
          await next(page);
          await next(page);
          assert.equal(await page.locator(".survey-step-page").getAttribute("data-step"), "style_segment");
          assert.equal(await page.locator(".survey-step-page.schema-v6-step.schema-v7-step").count(), 1);
          await page.locator('input[name="v5-info-seeking"]').last().click();
          await page.waitForFunction(() =>
            document.activeElement?.closest("[data-error-id]")?.dataset.errorId === "recording_preference"
          );
          const position = await page.locator('[data-error-id="recording_preference"]').evaluate((target) => {
            const heading = target.querySelector(".v5-question-heading").getBoundingClientRect();
            const progress = document.querySelector(".survey-progress").getBoundingClientRect();
            return {
              headingTop: heading.top,
              headingBottom: heading.bottom,
              progressBottom: progress.bottom,
              viewportHeight: window.innerHeight,
            };
          });
          assert.ok(position.headingTop >= position.progressBottom,
            `next heading starts below sticky progress (${position.headingTop}px < ${position.progressBottom}px)`);
          assert.ok(position.headingBottom <= position.viewportHeight,
            `next heading remains visible (${position.headingBottom}px > ${position.viewportHeight}px)`);
        } finally {
          await context.close();
        }
      });
    }
  } finally {
    await browser.close();
    await fixture.close();
  }
});

test("schema-v7 removes the outcome question and ends with 2000-code-point free text", { timeout: 120_000 }, async () => {
  await access(CHROME_PATH, constants.X_OK).catch(() => assert.fail(`Real Chrome is required at ${CHROME_PATH}`));
  const fixture = await fixtureServer(surveyV7Payload, V7_SLUG);
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    locale: "ja-JP", reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const draft = completeDraft(surveyV7Payload);
  draft.values.unused_feature_reason_by_feature.avatar_cover = "not_needed";
  await page.addInitScript(({ slug, draft }) => {
    sessionStorage.setItem(`pn_survey_draft:${slug}`, JSON.stringify(draft));
  }, { slug: V7_SLUG, draft });
  try {
    await page.goto(`${fixture.origin}/surveys/${V7_SLUG}`, { waitUntil: "networkidle" });
    for (let step = 0; step < 20; step += 1) {
      const key = await page.locator(".survey-step-page").getAttribute("data-step");
      if (key === "problem") {
        assert.equal(await page.locator('[data-error-id="problem_outcome"], .voice-section-title').count(), 0);
      }
      if (key === "final_comment") break;
      await next(page);
    }
    assert.equal(await page.locator(".survey-step-page").getAttribute("data-step"), "final_comment");
    assert.equal(await page.locator(".v5-question-heading > span").textContent(),
      "最後に、ここまでに書けていないことで言いたいことや伝えたいことがあればご自由にお書きください。");
    const textarea = page.locator('[data-error-id="final_comment"] textarea');
    const atLimit = "🎮".repeat(2_000);
    await textarea.fill(`${atLimit}🎮`);
    assert.equal(await page.locator('[data-error-id="final_comment"] .comment-count').textContent(), "2001 / 2000文字");
    await page.locator("#survey-next").click();
    assert.equal(await page.locator("#survey-error").textContent(), "自由記述は2000文字以内で入力してください。");
    await textarea.fill(atLimit);
    assert.equal(await page.locator('[data-error-id="final_comment"] .comment-count').textContent(), "2000 / 2000文字");
    await next(page);
    assert.equal(await page.locator(".survey-step-page").getAttribute("data-step"), "review");
    await page.locator("#survey-submit").click();
    await page.locator("#result-heading").waitFor();
    assert.equal(await page.locator("#result-description").textContent(),
      "称号「Founding Contributor」を付与しました。このまま画面を閉じて構いません。");
    assert.equal(await page.locator("#title-reward").isHidden(), true);
    assert.equal(fixture.submissions.length, 1);
    assert.deepEqual(Object.keys(fixture.submissions[0].answers), VOICE_V7_ANSWER_KEYS);
    assert.equal(fixture.submissions[0].answers.final_comment, atLimit);
    assert.equal(Object.hasOwn(fixture.submissions[0].answers, "problem_outcome"), false);
  } finally {
    await context.close();
    await browser.close();
    await fixture.close();
  }
});
