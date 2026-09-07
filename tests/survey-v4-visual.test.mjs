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
import { surveyV4Payload } from "./fixtures/survey-v4-payload.mjs";

const CHROME_PATH = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const SNAPSHOT_ROOT = fileURLToPath(new URL("./snapshots/", import.meta.url));
const UPDATE_SNAPSHOTS = process.env.UPDATE_VISUAL_SNAPSHOTS === "1";
const SLUG = surveyV4Payload.survey.slug;
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
        response.end(JSON.stringify(surveyV4Payload));
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
  for (let offset = 0; offset < actualPng.data.length; offset += 4) {
    const delta = Math.max(...[0, 1, 2, 3].map((channel) =>
      Math.abs(actualPng.data[offset + channel] - expectedPng.data[offset + channel])));
    if (delta > 24) different += 1;
  }
  const ratio = different / (actualPng.width * actualPng.height);
  if (ratio > 0.003) {
    const artifacts = join(tmpdir(), "playnavi-survey-v4-visual-actual");
    await mkdir(artifacts, { recursive: true });
    await writeFile(join(artifacts, `${name}.actual.png`), actual);
    assert.fail(`${name}: ${(ratio * 100).toFixed(3)}% changed (limit 0.300%). Artifacts: ${artifacts}`);
  }
}

async function assertLayout(page) {
  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(layout.scrollWidth <= layout.clientWidth, `horizontal overflow ${layout.scrollWidth}/${layout.clientWidth}`);
}

async function next(page) {
  const before = await page.locator("#survey-step").textContent();
  await page.locator("#survey-next").click();
  await page.waitForFunction((step) => document.querySelector("#survey-step")?.textContent !== step &&
    document.activeElement?.matches(".voice-page-title, .voice-intro h2"), before);
  assert.equal(await page.evaluate(() => window.scrollY), 0);
}

async function preparePage(page) {
  await page.addInitScript(() => {
    const NativeDate = Date;
    const fixedNow = NativeDate.parse("2026-09-07T03:00:00Z");
    globalThis.Date = class extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [fixedNow])); }
      static now() { return fixedNow; }
    };
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
}

async function runFlow(browser, fixture, device) {
  const context = await browser.newContext({ viewport: device.viewport, isMobile: true, hasTouch: true, locale: "ja-JP", reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    await preparePage(page);
    await page.goto(`${fixture.origin}/surveys/${SLUG}`, { waitUntil: "networkidle" });
    await page.locator('[data-step="intro"]').waitFor();
    assert.match(await page.locator(".voice-intro").textContent(), /異なる利用スタイル/);
    await next(page);

    assert.equal(await page.locator('[data-step="play_segment"] .voice-page-description').textContent(),
      "対象期間は2026/08/10〜2026/09/06です。忙しい週と遊んだ週を含め、おおよそでお答えください。");
    await page.locator('input[name="v4-gameplay-hours"][value="h3_lt7"]').click();
    await page.locator('input[name="v4-primary-device"][value="pc"]').click();
    if (device.snapshot === "play") {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(20);
      await assertSnapshot(page, `${device.name}-v4-play-segment`);
    }
    await assertLayout(page);
    await next(page);

    await page.locator('input[name="v3-usage"][value="days_1_4"]').click();
    await page.locator('input[name="v3-satisfaction"][value="somewhat_satisfied"]').click();
    await next(page);
    await next(page); // Q3 is optional and precedes S3/S4.

    assert.equal(await page.locator('[data-step="style_segment"]').count(), 1);
    await page.locator('input[name="v4-info-seeking"][value="days_5_14"]').click();
    await page.locator('input[name="v4-record-detail"][value="simple"]').click();
    if (device.snapshot === "style") {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(20);
      await assertSnapshot(page, `${device.name}-v4-style-segment`);
    }
    await assertLayout(page);
    await next(page);

    await page.locator('input[name="valuable_features"][value="play_log"]').click();
    await next(page);
    await page.locator('input[name="v3-problem"][value="library_input"]').click();
    await next(page);
    await page.locator('input[name="v3-outcome"][value="completed"]').click();
    await next(page);
    await page.locator('input[name="v3-future-role"][value="record"]').click();
    await next(page);
    await page.locator('input[name="future_candidates"][value="pc_web"]').click();
    await page.locator('input[name="future_candidates"][value="library_ai"]').click();
    await next(page);
    await page.locator('input[name="v3-priority"][value="pc_web"]').click();
    await next(page);
    await page.locator('input[name="v3-detail-a"][value="bulk_edit_logs"]').click();
    await page.locator('input[name="v3-detail-b"][value="both"]').click();
    await next(page);
    await page.locator('input[name="v3-comparison"][value="candidate"]').click();
    await next(page);
    assert.match(await page.locator(".privacy-note").textContent(), /UIDは称号付与だけ/);
    await page.locator("#survey-submit").click();
    await page.locator("#result-heading").waitFor();
  } finally {
    await context.close();
  }
}

async function assertDraftAndBranch(browser, fixture) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, locale: "ja-JP", reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    await preparePage(page);
    await page.goto(`${fixture.origin}/surveys/${SLUG}`, { waitUntil: "networkidle" });
    const before = await page.evaluate((slug) => JSON.parse(sessionStorage.getItem(`pn_survey_draft:${slug}`)), SLUG);
    assert.equal(before.schema_version, 4);
    assert.equal(before.values.reference_period_end_on, "2026-09-06");
    assert.match(before.submission_token, /^[A-Za-z0-9_-]{43}$/);
    before.values.future_role = "record";
    before.values.future_candidates = ["pc_web"];
    before.values.future_priority = "pc_web";
    before.values.future_priority_mode = "inherited";
    await page.evaluate(({ slug, draft }) => {
      sessionStorage.setItem(`pn_survey_draft:${slug}`, JSON.stringify(draft));
    }, { slug: SLUG, draft: before });
    await page.reload({ waitUntil: "networkidle" });
    const restored = await page.evaluate((slug) => JSON.parse(sessionStorage.getItem(`pn_survey_draft:${slug}`)), SLUG);
    assert.deepEqual(restored, before, "v4 period, token, and display orders stay fixed in the same tab");

    await next(page);
    await page.locator('input[name="v4-gameplay-hours"][value="lt_1h"]').click();
    await page.locator('input[name="v4-primary-device"][value="tie"]').click();
    await page.locator('input[name="v4-gameplay-hours"][value="none"]').click();
    assert.equal(await page.locator('input[name="v4-primary-device"]').count(), 0);
    const pruned = await page.evaluate((slug) => JSON.parse(sessionStorage.getItem(`pn_survey_draft:${slug}`)), SLUG);
    assert.equal(pruned.values.primary_play_device_4w, "");
    assert.equal(pruned.values.reference_period_end_on, "2026-09-06");
    assert.equal(pruned.values.future_role, "record", "S1 must not change the Q8 direction");
    assert.deepEqual(pruned.values.future_candidates, ["pc_web"], "S1 must not change Q9 candidates");
  } finally {
    await context.close();
  }
}

test("segmented schema-v4 completes in real mobile Chrome", { timeout: 120_000 }, async (t) => {
  await access(CHROME_PATH, constants.X_OK).catch(() => assert.fail(`Real Chrome is required at ${CHROME_PATH}`));
  const fixture = await fixtureServer();
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
  try {
    await t.test("iPhone-width 390 x 844", () => runFlow(browser, fixture, {
      name: "iphone-390x844", viewport: { width: 390, height: 844 }, snapshot: "play",
    }));
    await t.test("Android-width 412 x 915", () => runFlow(browser, fixture, {
      name: "android-412x915", viewport: { width: 412, height: 915 }, snapshot: "style",
    }));
    await t.test("same-tab fixed period and S2 branch pruning", () => assertDraftAndBranch(browser, fixture));
    assert.equal(fixture.submissions.length, 2);
    for (const { answers, submission_token: token } of fixture.submissions) {
      assert.match(token, /^[A-Za-z0-9_-]{43}$/);
      assert.equal(Object.keys(answers).length, 27);
      assert.equal(answers.reference_period_end_on, "2026-09-06");
      assert.equal(answers.play_time_4w, "h3_lt7");
      assert.equal(answers.primary_play_device_4w, "pc");
      assert.equal(answers.info_seek_days_4w, "days_5_14");
      assert.equal(answers.recording_preference, "simple");
      assert.equal(Object.hasOwn(answers, "user_id"), false);
      assert.equal(answers.future_detail_a, "bulk_edit_logs");
    }
  } finally {
    await browser.close();
    await fixture.close();
  }
});
