import assert from "node:assert/strict";
import { constants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { chromium } from "playwright-core";
import { PNG } from "pngjs";
import { surveyV3Payload } from "./fixtures/survey-v3-payload.mjs";

const CHROME_PATH = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const SNAPSHOT_ROOT = fileURLToPath(new URL("./snapshots/", import.meta.url));
const UPDATE_SNAPSHOTS = process.env.UPDATE_VISUAL_SNAPSHOTS === "1";
const SLUG = surveyV3Payload.survey.slug;
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"], [".png", "image/png"],
]);

async function fixtureServer() {
  const submissions = [];
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      response.setHeader("Cache-Control", "no-store");
      if (request.method === "GET" && url.pathname === `/api/surveys/${SLUG}`) {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(surveyV3Payload));
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
          reward: { name_ja: "PlayNavi Voice 2026", awarded: true },
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
  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    submissions,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function assertSnapshot(page, name) {
  const actual = await page.screenshot({ animations: "disabled", caret: "hide" });
  const expectedPath = join(SNAPSHOT_ROOT, `${name}.png`);
  if (UPDATE_SNAPSHOTS) {
    await mkdir(SNAPSHOT_ROOT, { recursive: true });
    await writeFile(expectedPath, actual);
    return;
  }
  const expected = await readFile(expectedPath).catch((error) => {
    if (error?.code === "ENOENT") assert.fail(`Visual baseline is missing: ${expectedPath}`);
    throw error;
  });
  const actualPng = PNG.sync.read(actual);
  const expectedPng = PNG.sync.read(expected);
  assert.deepEqual([actualPng.width, actualPng.height], [expectedPng.width, expectedPng.height]);
  let different = 0;
  const diff = new PNG({ width: actualPng.width, height: actualPng.height });
  for (let offset = 0; offset < actualPng.data.length; offset += 4) {
    const delta = Math.max(...[0, 1, 2, 3].map((channel) =>
      Math.abs(actualPng.data[offset + channel] - expectedPng.data[offset + channel])));
    if (delta > 24) different += 1;
    const value = delta > 24 ? 255 : Math.round(actualPng.data[offset] * 0.25);
    diff.data[offset] = delta > 24 ? 220 : value;
    diff.data[offset + 1] = delta > 24 ? 0 : value;
    diff.data[offset + 2] = delta > 24 ? 140 : value;
    diff.data[offset + 3] = 255;
  }
  const ratio = different / (actualPng.width * actualPng.height);
  if (ratio > 0.003) {
    const artifacts = join(tmpdir(), "playnavi-survey-v3-visual-actual");
    await mkdir(artifacts, { recursive: true });
    await writeFile(join(artifacts, `${name}.actual.png`), actual);
    await writeFile(join(artifacts, `${name}.diff.png`), PNG.sync.write(diff));
    assert.fail(`${name}: ${(ratio * 100).toFixed(3)}% changed (limit 0.300%). Artifacts: ${artifacts}`);
  }
}

async function assertLayout(page) {
  const layout = await page.evaluate(() => {
    const navigation = document.querySelector(".survey-navigation");
    const page = document.querySelector(".reviewed-voice-step");
    const last = [...(page?.querySelectorAll("input, textarea, summary, button") || [])]
      .filter((element) => {
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0 &&
          !(element.closest("details:not([open])") && !element.matches("summary"));
      }).at(-1) || page;
    const navigationRect = navigation?.getBoundingClientRect();
    const lastRect = last?.getBoundingClientRect();
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      navigationTop: navigationRect?.top,
      lastBottom: lastRect?.bottom,
    };
  });
  assert.ok(layout.scrollWidth <= layout.clientWidth, `horizontal overflow ${layout.scrollWidth}/${layout.clientWidth}`);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(20);
  const overlap = await page.evaluate(() => {
    const navigation = document.querySelector(".survey-navigation")?.getBoundingClientRect();
    const controls = [...document.querySelectorAll(".reviewed-voice-step input, .reviewed-voice-step textarea, .reviewed-voice-step summary, .reviewed-voice-step button")]
      .filter((element) => getComputedStyle(element).display !== "none" && element.getClientRects().length > 0 &&
        !(element.closest("details:not([open])") && !element.matches("summary")));
    const lastElement = controls.at(-1) || document.querySelector(".reviewed-voice-step");
    const last = lastElement?.getBoundingClientRect();
    return navigation && last ? {
      navigationTop: navigation.top,
      lastBottom: last.bottom,
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      lastTag: lastElement ? `${lastElement.tagName}:${lastElement.getAttribute("name") || lastElement.textContent?.slice(0, 20)}` : "none",
    } : null;
  });
  assert.ok(overlap && overlap.lastBottom <= overlap.navigationTop + 1, `sticky navigation must not cover final control: ${JSON.stringify(overlap)}`);
}

async function next(page) {
  const before = await page.locator("#survey-step").textContent();
  await page.locator("#survey-next").click();
  await page.waitForFunction((step) => document.querySelector("#survey-step")?.textContent !== step &&
    document.activeElement?.matches(".voice-page-title, .voice-intro h2"), before);
  assert.equal(await page.evaluate(() => window.scrollY), 0);
}

async function runFlow(browser, fixture, device) {
  const context = await browser.newContext({ viewport: device.viewport, isMobile: true, hasTouch: true, locale: "ja-JP", reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    await page.addInitScript(() => {
      let state = 0x5eed1234;
      Object.defineProperty(Crypto.prototype, "getRandomValues", {
        configurable: true,
        value(array) {
          for (let index = 0; index < array.length; index += 1) {
            state = (state * 1664525 + 1013904223) >>> 0;
            array[index] = state;
          }
          return array;
        },
      });
    });
    await page.goto(`${fixture.origin}/surveys/${SLUG}`, { waitUntil: "networkidle" });
    await page.locator('[data-step="intro"]').waitFor();
    assert.match(await page.locator(".voice-intro").textContent(), /回答データにUIDを保存せず/);
    if (device.snapshot === "intro") await assertSnapshot(page, `${device.name}-v3-intro`);
    await next(page);

    await page.locator('input[name="v3-usage"][value="days_1_4"]').click();
    await page.locator('input[name="v3-satisfaction"][value="somewhat_satisfied"]').click();
    await next(page);
    await next(page); // optional unprompted need

    await page.locator('input[name="valuable_features"][value="play_log"]').click();
    assert.equal(await page.locator('input[name="valuable_features"]:checked').count(), 1);
    await assertLayout(page);
    await next(page);

    await page.locator('input[name="v3-problem"][value="library_input"]').click();
    await next(page);
    await page.locator('input[name="v3-outcome"][value="completed"]').click();
    await next(page);

    await page.locator('input[name="v3-future-role"][value="record"]').click();
    await next(page);
    if (device.snapshot === "candidates") {
      await page.waitForFunction(() => !document.querySelector("#survey-next")?.classList.contains("ready"));
      await assertSnapshot(page, `${device.name}-v3-candidates`);
    }
    await page.locator('input[name="future_candidates"][value="pc_web"]').click();
    await page.locator('input[name="future_candidates"][value="library_ai"]').click();
    assert.equal(await page.locator('input[name="future_candidates"]:checked').count(), 2);
    await next(page);

    await page.locator('input[name="v3-priority"][value="pc_web"]').click();
    await next(page);
    assert.match(await page.locator(".voice-page-description").textContent(), /PC向けWeb版/);
    await page.locator('input[name="v3-detail-a"][value="bulk_edit_logs"]').click();
    await page.locator('input[name="v3-detail-b"][value="both"]').click();
    await next(page);

    await page.locator('input[name="v3-comparison"][value="candidate"]').click();
    await next(page);
    assert.match(await page.locator(".privacy-note").textContent(), /UIDは称号付与だけ/);
    await assertLayout(page);
    await page.locator("#survey-submit").click();
    await page.locator("#result-heading").waitFor();
    assert.equal(await page.locator("#result-heading").textContent(), "回答ありがとうございました");
  } finally {
    await context.close();
  }
}

async function assertDraftPersistence(browser, fixture) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ja-JP", reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    await page.goto(`${fixture.origin}/surveys/${SLUG}`, { waitUntil: "networkidle" });
    await page.locator('[data-step="intro"]').waitFor();
    const before = await page.evaluate((slug) => JSON.parse(sessionStorage.getItem(`pn_survey_draft:${slug}`)), SLUG);
    assert.match(before.submission_token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(before.values.feature_display_order.length, 26);
    assert.equal(before.values.future_display_order.length, 12);

    await page.reload({ waitUntil: "networkidle" });
    await page.locator('[data-step="intro"]').waitFor();
    const restored = await page.evaluate((slug) => JSON.parse(sessionStorage.getItem(`pn_survey_draft:${slug}`)), SLUG);
    assert.deepEqual(restored, before, "token and randomized display orders stay fixed in the same tab");

    restored.values.valuable_features = ["unknown_stale_feature"];
    restored.values.future_candidates = ["none", "pc_web"];
    await page.evaluate(({ slug, draft }) => {
      sessionStorage.setItem(`pn_survey_draft:${slug}`, JSON.stringify(draft));
    }, { slug: SLUG, draft: restored });
    await page.reload({ waitUntil: "networkidle" });
    await page.locator('[data-step="intro"]').waitFor();
    const recovered = await page.evaluate((slug) => JSON.parse(sessionStorage.getItem(`pn_survey_draft:${slug}`)), SLUG);
    assert.deepEqual(recovered.values.valuable_features, [], "unknown Q4 draft IDs are recoverable");
    assert.deepEqual(recovered.values.future_candidates, [], "mixed exclusive Q9 drafts are recoverable");

    await next(page);
    await page.locator('input[name="v3-usage"][value="days_1_4"]').click();
    await page.locator('input[name="v3-satisfaction"][value="somewhat_satisfied"]').click();
    await page.locator('input[name="v3-usage"][value="never_used"]').click();
    assert.equal(await page.locator('input[name="v3-satisfaction"]').count(), 0);
    const pruned = await page.evaluate((slug) => JSON.parse(sessionStorage.getItem(`pn_survey_draft:${slug}`)), SLUG);
    assert.equal(pruned.values.overall_satisfaction, "", "Q1 branch changes prune hidden Q2 data");
    assert.deepEqual(pruned.values.valuable_features, [], "Q1 branch changes prune hidden Q4 data");
    assert.equal(pruned.submission_token, before.submission_token, "branch changes keep the same idempotency token");
  } finally {
    await context.close();
  }
}

test("reviewed schema-v3 current-user route completes in real mobile Chrome", { timeout: 120_000 }, async (t) => {
  try {
    await access(CHROME_PATH, constants.X_OK);
  } catch {
    assert.fail(`Real Chrome is required, but is not executable at ${CHROME_PATH}`);
  }
  const fixture = await fixtureServer();
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
  try {
    await t.test("iPhone-width 390 x 844", () => runFlow(browser, fixture, {
      name: "iphone-390x844", viewport: { width: 390, height: 844 }, snapshot: "intro",
    }));
    await t.test("Android-width 412 x 915", () => runFlow(browser, fixture, {
      name: "android-412x915", viewport: { width: 412, height: 915 }, snapshot: "candidates",
    }));
    await t.test("same-tab draft, random order, token, and branch pruning", () => assertDraftPersistence(browser, fixture));
    assert.equal(fixture.submissions.length, 2);
    for (const submission of fixture.submissions) {
      assert.match(submission.submission_token, /^[A-Za-z0-9_-]{43}$/);
      assert.equal(Object.hasOwn(submission.answers, "user_id"), false);
      assert.deepEqual(submission.answers.valuable_features, ["play_log"]);
      assert.deepEqual(submission.answers.future_candidates, ["pc_web", "library_ai"]);
      assert.equal(submission.answers.future_priority, "pc_web");
      assert.equal(submission.answers.future_priority_mode, "explicit");
      assert.equal(submission.answers.future_detail_a, "bulk_edit_logs");
      assert.equal(submission.answers.improvement_vs_candidate, "candidate");
      assert.equal(submission.answers.feature_display_order.length, 26);
      assert.equal(submission.answers.future_display_order.length, 12);
    }
  } finally {
    await browser.close();
    await fixture.close();
  }
});
