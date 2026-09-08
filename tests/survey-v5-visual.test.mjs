import assert from "node:assert/strict";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { chromium } from "playwright-core";
import { PNG } from "pngjs";
import { VOICE_V5_ANSWER_KEYS, VOICE_V5_ANSWER_NOTE_KEYS } from "../assets/survey-contract.mjs";
import { surveyV5Payload } from "./fixtures/survey-v5-payload.mjs";

const CHROME_PATH = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const SLUG = surveyV5Payload.survey.slug;
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"], [".png", "image/png"],
]);

async function fixtureServer() {
  let guestSession = false;
  const submissions = [];
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      response.setHeader("Cache-Control", "no-store");
      if (request.method === "POST" && url.pathname === "/api/survey/session/guest") {
        guestSession = true;
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ status: "ok" }));
        return;
      }
      if (request.method === "GET" && url.pathname === `/api/surveys/${SLUG}`) {
        response.setHeader("Content-Type", "application/json");
        const authenticated = request.headers.cookie?.includes("v5_auth=1") === true;
        if (!guestSession && !authenticated) {
          response.statusCode = 401;
          response.end(JSON.stringify({ status: "ok", survey: {
            slug: SLUG,
            title: surveyV5Payload.survey.title,
            description: surveyV5Payload.survey.description,
            schema_version: 5,
          } }));
          return;
        }
        response.end(JSON.stringify({
          ...surveyV5Payload,
          survey: { ...surveyV5Payload.survey, reward: authenticated ? surveyV5Payload.survey.reward : null },
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
          submission: { submitted_at: "2026-09-07T00:00:00Z", already_submitted: false },
          reward: null,
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

async function assertResponsiveLayout(browser, fixture, width) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, locale: "ja-JP" });
  const page = await context.newPage();
  try {
    await page.goto(`${fixture.origin}/surveys/${SLUG}`, { waitUntil: "networkidle" });
    await page.locator('[data-step="intro"]').waitFor();
    const title = await page.locator("#survey-title").evaluate((element) => ({
      whiteSpace: getComputedStyle(element).whiteSpace,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    assert.equal(title.whiteSpace, "nowrap", `${width}px title`);
    assert.ok(title.scrollWidth <= title.clientWidth, `${width}px title overflow`);
    assert.ok(title.overflow <= 0, `${width}px document overflow`);
    await next(page);
    const structure = await page.locator(".v5-question").first().evaluate((card) => {
      const heading = card.querySelector(".v5-question-heading").getBoundingClientRect();
      const bounds = card.getBoundingClientRect();
      const fieldset = card.querySelector("fieldset");
      const style = getComputedStyle(fieldset);
      return {
        cardTag: card.tagName,
        headingInside: heading.left >= bounds.left && heading.right <= bounds.right && heading.top >= bounds.top,
        border: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
        labelledBy: fieldset.getAttribute("aria-labelledby"),
        headingId: card.querySelector(".v5-question-heading").id,
        controlsOutside: [...card.querySelectorAll("input, textarea, select, button")]
          .filter((control) => !fieldset.contains(control)).length,
        groupedControls: fieldset.querySelectorAll("input, textarea, select, button").length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    assert.equal(structure.cardTag, "SECTION");
    assert.equal(structure.headingInside, true);
    assert.deepEqual(structure.border, ["0px", "0px", "0px", "0px"]);
    assert.equal(structure.labelledBy, structure.headingId);
    assert.equal(structure.controlsOutside, 0);
    assert.ok(structure.groupedControls > 0);
    assert.ok(structure.overflow <= 0, `${width}px question overflow`);
  } finally {
    await context.close();
  }
}

async function assertDesktopDrag(browser, fixture) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ja-JP" });
  const page = await context.newPage();
  const featureIds = surveyV5Payload.survey.questions.categories.flatMap(({ features }) => features.map(({ id }) => id));
  const futureIds = surveyV5Payload.survey.questions.future_options.map(({ id }) => id);
  const values = {
    play_frequency_1m: "none", primary_play_device_1m: "", reference_period_end_on: "2026-09-06",
    usage_1m: "days_1_4", overall_satisfaction: "somewhat_satisfied", unprompted_need: "",
    info_seek_days_1m: "days_0", recording_preference: "none", valuable_features: ["play_log"],
    valuable_feature_reasons: {}, unused_features: ["avatar_cover"], unused_feature_reason_by_feature: {},
    primary_problem: "none", dormant_reason: "", problem_comment: "", problem_outcome: "",
    future_role: "current_is_fine", future_role_other: "", future_candidates: ["none"], future_other: "",
    future_priority: "", future_priority_mode: "", future_detail_a: "", future_detail_b: "",
    future_detail_other: "", improvement_vs_candidate: "", feature_display_order: featureIds,
    future_display_order: futureIds,
    answer_notes: Object.fromEntries(VOICE_V5_ANSWER_NOTE_KEYS.map((key) => [key, ""])),
  };
  await page.addInitScript(({ slug, draft }) => {
    sessionStorage.setItem(`pn_survey_draft:${slug}`, JSON.stringify(draft));
  }, { slug: SLUG, draft: { schema_version: 5, submission_token: "D".repeat(43), values } });
  try {
    await page.goto(`${fixture.origin}/surveys/${SLUG}`, { waitUntil: "networkidle" });
    await page.locator('[data-step="intro"]').waitFor();
    while (await page.locator(".survey-step-page").getAttribute("data-step") !== "unused_reasons") await next(page);
    await page.locator(".reason-drag-handle").dragTo(page.locator(".reason-bucket").first());
    const draft = await page.evaluate((slug) => JSON.parse(sessionStorage.getItem(`pn_survey_draft:${slug}`)), SLUG);
    assert.equal(draft.values.unused_feature_reason_by_feature.avatar_cover,
      surveyV5Payload.survey.questions.unused_reason_options[0].id);
  } finally {
    await context.close();
  }
}

test("schema-v5 guest flow works in real mobile Chrome", { timeout: 120_000 }, async () => {
  await access(CHROME_PATH, constants.X_OK).catch(() => assert.fail(`Real Chrome is required at ${CHROME_PATH}`));
  const fixture = await fixtureServer();
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, locale: "ja-JP", reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    await page.goto(`${fixture.origin}/surveys/${SLUG}`, { waitUntil: "networkidle" });
    await page.locator(".login-heading").waitFor();
    assert.equal(await page.locator(".login-heading").textContent(), "回答方法を選択してください");
    assert.equal(await page.locator("#guest-login").textContent(), "報酬なしでログインせず回答する");
    assert.equal(await page.locator(".login-notice > li").count(), 3);
    assert.equal(await page.locator("#survey-description").textContent(), surveyV5Payload.survey.description);
    assert.equal(await page.locator(".google-icon").getAttribute("src"), "/assets/icons/google-signin-light.png");
    const providerLayout = await page.locator(".oauth").evaluateAll((buttons) => buttons.map((button) => {
      const buttonBounds = button.getBoundingClientRect();
      const iconBounds = button.querySelector("img").getBoundingClientRect();
      const textBounds = button.querySelector("span").getBoundingClientRect();
      return {
        buttonCenter: (buttonBounds.left + buttonBounds.right) / 2,
        textCenter: (textBounds.left + textBounds.right) / 2,
        iconRight: iconBounds.right,
        textLeft: textBounds.left,
        background: getComputedStyle(button).backgroundColor,
      };
    }));
    for (const layout of providerLayout) {
      assert.ok(Math.abs(layout.buttonCenter - layout.textCenter) <= 1, "provider label is centered in the whole button");
      assert.ok(layout.iconRight < layout.textLeft, "provider icon stays in its left lane without overlapping the label");
      assert.equal(layout.background, "rgb(255, 255, 255)");
    }
    const googlePng = PNG.sync.read(await readFile(join(REPO_ROOT, "assets/icons/google-signin-light.png")));
    assert.ok([...Array(googlePng.width * googlePng.height).keys()]
      .some((pixel) => googlePng.data[(pixel * 4) + 3] === 0), "Google mark has transparent outer pixels");

    const authenticated = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ja-JP" });
    await authenticated.addCookies([{ name: "v5_auth", value: "1", url: fixture.origin }]);
    const authenticatedPage = await authenticated.newPage();
    await authenticatedPage.goto(`${fixture.origin}/surveys/${SLUG}`, { waitUntil: "networkidle" });
    assert.deepEqual(await authenticatedPage.locator(".voice-intro li").allTextContents(), [
      "匿名形式のアンケートです。（ログイン情報は、報酬付与の判定にのみ利用します）",
      "回答内容にかかわらず、回答を送信すると報酬（称号）を受け取れます。",
      "報酬は、アンケート回答終了後、数日以内に配布します。",
    ]);
    await authenticated.close();

    await page.locator("#guest-login").click();
    await page.locator('[data-step="intro"]').waitFor();
    assert.deepEqual(await page.locator(".voice-intro li").allTextContents(), [
      "匿名形式のアンケートです。（PlayNaviのログイン情報は使用しません）",
      "ゲスト回答では、報酬（称号）を受け取れません。",
      "設問と回答内容の扱いは、アカウントで回答する場合と同じです。",
    ]);
    for (const width of [320, 390, 412]) await assertResponsiveLayout(browser, fixture, width);
    const titleLayout = await page.locator("#survey-title").evaluate((element) => ({
      whiteSpace: getComputedStyle(element).whiteSpace,
      width: element.getBoundingClientRect().width,
      viewport: document.documentElement.clientWidth,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    assert.equal(titleLayout.whiteSpace, "nowrap");
    assert.ok(titleLayout.width < titleLayout.viewport);
    assert.ok(titleLayout.overflow <= 0);

    await next(page);
    await page.locator('input[name="v5-play-frequency"][value="none"]').click();
    await page.locator("details.optional-note summary").click();
    assert.equal(await page.locator("details.optional-note .comment-count").textContent(), "0 / 400文字");
    await next(page);

    await page.locator('input[name="v5-usage"][value="days_1_4"]').click();
    await page.locator('input[name="v5-satisfaction"][value="somewhat_satisfied"]').click();
    await next(page);
    await next(page);
    await page.locator('input[name="v5-info-seeking"][value="days_0"]').click();
    await page.locator('input[name="v5-record-detail"][value="none"]').click();
    await next(page);

    await page.locator('input[name="valuable_features"][value="play_log"]').click();
    assert.match(await page.locator(".feature-comment-label").textContent(),
      /^この機能が役立っている理由や、今後も残してほしい点（任意）/);
    const reason = page.locator(".feature-comment-label textarea");
    await reason.fill("😀".repeat(201));
    assert.equal(await page.locator(".feature-comment-label .comment-count").textContent(), "201 / 400文字");
    assert.equal(await reason.getAttribute("aria-invalid"), "false");
    await reason.fill("😀".repeat(401));
    assert.equal(await page.locator(".feature-comment-label .comment-count").textContent(), "401 / 400文字");
    assert.equal(await reason.getAttribute("aria-invalid"), "true");
    await page.locator("#survey-next").click();
    assert.equal(await page.locator(".survey-step-page").getAttribute("data-step"), "valuable");
    assert.equal(await page.locator("#survey-error").textContent(), "自由記述は400文字以内で入力してください。");
    await reason.fill("振り返りに役立つ");
    assert.equal(await page.locator(".feature-comment-label .comment-count").textContent(), "8 / 400文字");
    await reason.fill("");
    let draft = await page.evaluate((slug) => JSON.parse(sessionStorage.getItem(`pn_survey_draft:${slug}`)), SLUG);
    assert.deepEqual(draft.values.valuable_feature_reasons, {});
    await next(page);

    assert.equal((await page.locator('input[name="unused_features"][value="none"]').locator("..").textContent()).trim(),
      "あまり使っていない機能はない");
    await page.locator('input[name="unused_features"][value="avatar_cover"]').click();
    await page.locator('input[name="unused_features"][value="honor_titles"]').click();
    await next(page);
    const avatar = page.getByRole("button", { name: /アバター・カバー画像。選択して/ });
    const describedBy = await avatar.getAttribute("aria-describedby");
    assert.match(await page.locator(`#${describedBy}`).textContent(), /現在は未分類です。EnterまたはSpaceで選択/);
    const touchHandle = avatar.locator(".reason-drag-handle");
    await touchHandle.evaluate((handle) => {
      handle.closest("button").classList.add("dragging");
      document.querySelector(".reason-bucket").classList.add("drag-over");
      handle.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 7, pointerType: "touch" }));
    });
    assert.equal(await avatar.evaluate((button) => button.classList.contains("dragging")), false);
    assert.equal(await page.locator(".reason-bucket.drag-over").count(), 0);
    await avatar.focus();
    await avatar.press("Enter");
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("reason-assign-button")), true);
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "直前の分類を元に戻す" }).click();
    draft = await page.evaluate((slug) => JSON.parse(sessionStorage.getItem(`pn_survey_draft:${slug}`)), SLUG);
    assert.deepEqual(draft.values.unused_feature_reason_by_feature, {});
    await page.getByRole("button", { name: /アバター・カバー画像。選択して/ }).click();
    await page.locator(".reason-assign-button").nth(0).click();
    await page.getByRole("button", { name: /称号。選択して/ }).click();
    await page.locator(".reason-assign-button").nth(1).click();
    assert.equal(await page.locator('[data-step="unused_reasons"] details.optional-note summary').textContent(),
      "あまり使っていない機能や、その理由について補足があれば教えてください。（任意）");
    await next(page);

    assert.equal(await page.locator('[data-step="problem"] details.optional-note summary').textContent(),
      "選んだ内容について、具体的に伝えたいことがあれば教えてください。（任意）");
    await page.locator('input[name="v5-problem"][value="library_input"]').click();
    await next(page);
    await page.locator('input[name="v5-outcome"][value="completed"]').click();
    await next(page);
    await page.locator('input[name="v5-future-role"][value="current_is_fine"]').click();
    await next(page);

    const candidates = page.locator('input[name="future_candidates"]:not([value="none"]):not([value="unknown"])');
    for (const id of ["pc_web", "library_ai", "game_database"]) {
      await page.locator(`input[name="future_candidates"][value="${id}"]`).click();
    }
    assert.equal(await page.locator(".selection-limit-status").textContent(), "3 / 3件選択中");
    assert.equal(await page.locator('input[name="future_candidates"][value="news_curation"]').isDisabled(), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await next(page);
    await page.locator('input[name="v5-priority"][value="pc_web"]').click();
    await page.locator('input[name="v5-detail-a"][value="bulk_edit_logs"]').click();
    await page.locator('input[name="v5-detail-b"][value="pc"]').click();
    await next(page);
    await page.locator('input[name="v5-comparison"][value="candidate"]').click();
    await next(page);
    await page.locator("#survey-submit").click();
    await page.locator("#result-heading").waitFor();
    assert.equal(fixture.submissions.length, 1);
    const [{ answers, submission_token: submissionToken }] = fixture.submissions;
    assert.deepEqual(Object.keys(answers), VOICE_V5_ANSWER_KEYS);
    assert.deepEqual(Object.keys(answers.answer_notes), VOICE_V5_ANSWER_NOTE_KEYS);
    assert.deepEqual(answers.unused_feature_reason_by_feature, {
      avatar_cover: surveyV5Payload.survey.questions.unused_reason_options[0].id,
      honor_titles: surveyV5Payload.survey.questions.unused_reason_options[1].id,
    });
    assert.equal(answers.valuable_feature_reasons.play_log, undefined);
    assert.equal(answers.problem_comment, "");
    assert.equal(answers.future_priority, "pc_web");
    assert.equal(answers.future_detail_a, "bulk_edit_logs");
    assert.equal(answers.improvement_vs_candidate, "candidate");
    assert.equal(Object.hasOwn(answers, "user_id"), false);
    assert.match(submissionToken, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(await page.evaluate((slug) => sessionStorage.getItem(`pn_survey_draft:${slug}`), SLUG), null);
    await assertDesktopDrag(browser, fixture);
  } finally {
    await context.close();
    await browser.close();
    await fixture.close();
  }
});
