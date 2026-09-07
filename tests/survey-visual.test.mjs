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

import { surveyV2Payload } from "./fixtures/survey-v2-payload.mjs";

const CHROME_PATH = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const SNAPSHOT_ROOT = fileURLToPath(new URL("./snapshots/", import.meta.url));
const UPDATE_SNAPSHOTS = process.env.UPDATE_VISUAL_SNAPSHOTS === "1";
const SLUG = surveyV2Payload.survey.slug;

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
]);

async function startFixtureServer() {
  const submissions = [];
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      response.setHeader("Cache-Control", "no-store");

      if (request.method === "GET" && url.pathname === `/api/surveys/${SLUG}`) {
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(JSON.stringify(surveyV2Payload));
        return;
      }
      if (request.method === "POST" && url.pathname === `/api/surveys/${SLUG}/responses`) {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        submissions.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(JSON.stringify({
          status: "ok",
          submission: {
            submitted_at: "2026-09-07T00:00:00Z",
            already_submitted: false,
          },
          reward: {
            title_id: "playnavi-voice-2026",
            name_ja: "PlayNavi Voice 2026",
            rarity: "common",
            icon_url: null,
            awarded: true,
          },
        }));
        return;
      }

      const relativePath = url.pathname === `/surveys/${SLUG}` || url.pathname === "/"
        ? "index.html"
        : decodeURIComponent(url.pathname).replace(/^\/+/, "");
      if (relativePath.includes("..") || !/^(?:index\.html|logo\.png|assets\/[a-z0-9_./-]+)$/i.test(relativePath)) {
        response.writeHead(404).end();
        return;
      }
      const filePath = join(REPO_ROOT, relativePath);
      response.setHeader("Content-Type", contentTypes.get(extname(filePath)) || "application/octet-stream");
      response.end(await readFile(filePath));
    } catch (error) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.message : "fixture server error");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object");
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

  let expected;
  try {
    expected = await readFile(expectedPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      assert.fail(`Visual baseline is missing: ${expectedPath}. Run UPDATE_VISUAL_SNAPSHOTS=1 npm run test:visual after review.`);
    }
    throw error;
  }
  const actualPng = PNG.sync.read(actual);
  const expectedPng = PNG.sync.read(expected);
  assert.deepEqual(
    [actualPng.width, actualPng.height],
    [expectedPng.width, expectedPng.height],
    `${name}: screenshot dimensions changed`,
  );

  let differentPixels = 0;
  const diff = new PNG({ width: actualPng.width, height: actualPng.height });
  for (let offset = 0; offset < actualPng.data.length; offset += 4) {
    const delta = Math.max(
      Math.abs(actualPng.data[offset] - expectedPng.data[offset]),
      Math.abs(actualPng.data[offset + 1] - expectedPng.data[offset + 1]),
      Math.abs(actualPng.data[offset + 2] - expectedPng.data[offset + 2]),
      Math.abs(actualPng.data[offset + 3] - expectedPng.data[offset + 3]),
    );
    if (delta > 24) differentPixels += 1;
    const value = delta > 24 ? 255 : Math.round(actualPng.data[offset] * 0.25);
    diff.data[offset] = delta > 24 ? 220 : value;
    diff.data[offset + 1] = delta > 24 ? 0 : value;
    diff.data[offset + 2] = delta > 24 ? 140 : value;
    diff.data[offset + 3] = 255;
  }
  const ratio = differentPixels / (actualPng.width * actualPng.height);
  if (ratio > 0.003) {
    const artifactRoot = join(tmpdir(), "playnavi-survey-visual-actual");
    await mkdir(artifactRoot, { recursive: true });
    await writeFile(join(artifactRoot, `${name}.actual.png`), actual);
    await writeFile(join(artifactRoot, `${name}.diff.png`), PNG.sync.write(diff));
    assert.fail(`${name}: ${(ratio * 100).toFixed(3)}% of pixels changed (limit 0.300%). Artifacts: ${artifactRoot}`);
  }
}

async function assertMobileLayout(page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.scrollWidth <= dimensions.clientWidth,
    `horizontal overflow: ${dimensions.scrollWidth}px > ${dimensions.clientWidth}px`,
  );

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(30);
  const overlap = await page.evaluate(() => {
    const navigation = document.querySelector(".survey-navigation");
    const visiblePage = document.querySelector(".voice-step-page");
    const actionable = visiblePage
      ? [...visiblePage.querySelectorAll("input, select, textarea, summary, button")].filter((element) => {
          const style = getComputedStyle(element);
          return style.display !== "none" && style.visibility !== "hidden";
        })
      : [];
    const last = actionable.at(-1) || visiblePage;
    if (!navigation || !last) return null;
    const navigationRect = navigation.getBoundingClientRect();
    const lastRect = last.getBoundingClientRect();
    return {
      navigationTop: navigationRect.top,
      lastActionBottom: lastRect.bottom,
      navigationVisible: navigationRect.top < window.innerHeight,
    };
  });
  assert.ok(overlap?.navigationVisible, "sticky survey navigation is not visible at the bottom of the page");
  assert.ok(
    overlap.lastActionBottom <= overlap.navigationTop + 1,
    `sticky navigation overlaps the final control (${overlap.lastActionBottom}px > ${overlap.navigationTop}px)`,
  );
}

async function nextPage(page, previousStep) {
  await page.locator("#survey-next").click();
  await page.waitForFunction((step) => {
    const heading = document.activeElement;
    return document.querySelector("#survey-step")?.textContent !== step
      && heading?.matches(".voice-page-title, .voice-intro h2");
  }, previousStep);
  assert.equal(await page.evaluate(() => window.scrollY), 0, "page transitions return to the top");
}

async function runMobileFlow(browser, fixture, device) {
  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: "ja-JP",
    colorScheme: "light",
    reducedMotion: "reduce",
    timezoneId: "Asia/Tokyo",
  });
  const page = await context.newPage();
  try {
    await page.goto(`${fixture.origin}/surveys/${SLUG}`, { waitUntil: "networkidle" });
    await page.locator('[data-step="intro"]').waitFor();

    const progress = page.getByRole("progressbar", { name: "アンケートの回答進捗" });
    assert.equal(await progress.getAttribute("aria-valuemin"), "1");
    assert.equal(await progress.getAttribute("aria-valuenow"), "1");
    assert.match(await progress.getAttribute("aria-valuetext"), /^\d+ステップ中1ステップ目$/);
    await assertMobileLayout(page);
    if (device.snapshot === "intro") await assertSnapshot(page, `${device.name}-intro`);

    let step = await page.locator("#survey-step").textContent();
    await nextPage(page, step);
    assert.equal(await page.locator(".voice-page-title").textContent(), "まず、普段の利用について");

    await page.locator('input[name="usage-frequency"][value="daily"]').click();
    await page.waitForFunction(() => document.activeElement?.closest("[data-error-id]")?.dataset.errorId === "overall_satisfaction");
    await page.locator('input[name="overall-satisfaction"][value="somewhat_satisfied"]').click();
    await page.waitForFunction(() => document.activeElement?.id === "survey-next");
    assert.ok(await page.locator("#survey-next").evaluate((element) => element.classList.contains("ready")), "last answer highlights the next action");
    await page.evaluate(() => window.scrollTo(0, 0));
    if (device.snapshot === "basic") await assertSnapshot(page, `${device.name}-basic-complete`);
    await assertMobileLayout(page);

    step = await page.locator("#survey-step").textContent();
    await nextPage(page, step);
    for (let categoryIndex = 0; categoryIndex < 7; categoryIndex += 1) {
      assert.match(await page.locator(".voice-page-title").textContent(), new RegExp(`^${categoryIndex + 1}\\.`));
      if (categoryIndex === 0) {
        await page.locator("#survey-next").click();
        const firstInvalid = page.locator('[data-error-id="priority:game_news"]');
        await firstInvalid.waitFor();
        assert.equal(await firstInvalid.getAttribute("aria-invalid"), "true");
        assert.equal(await firstInvalid.getAttribute("aria-describedby"), "survey-error");
        assert.equal(await page.locator("#survey-error").getAttribute("role"), "alert");
        assert.equal(await page.locator("#survey-error").isVisible(), true);
      }

      const choices = page.locator('.voice-step-page input[type="radio"][value="medium"]');
      const choiceCount = await choices.count();
      assert.ok(choiceCount >= 3 && choiceCount <= 4, "each category exposes its bounded feature set");
      const initialScroll = await page.evaluate(() => window.scrollY);
      await choices.nth(0).click();
      if (categoryIndex === 0) {
        await page.waitForFunction(() => document.activeElement?.closest("[data-error-id]")?.dataset.errorId === "priority:events");
        assert.ok(await page.evaluate(() => window.scrollY) > initialScroll, "one-tap priority selection scrolls to the next question");
      }
      for (let index = 1; index < choiceCount; index += 1) await choices.nth(index).click();
      await assertMobileLayout(page);
      step = await page.locator("#survey-step").textContent();
      await nextPage(page, step);
    }

    assert.equal(await page.locator(".voice-page-title").textContent(), "力を入れてほしいカテゴリ");
    const categoryRanking = page.locator('[data-error-id="category_top:0"]');
    const firstCategory = categoryRanking.locator('[data-option-id="news_deals"]');
    await firstCategory.click();
    await page.waitForFunction(() => document.activeElement?.dataset.optionId === "news_deals");
    assert.equal(await firstCategory.getAttribute("aria-pressed"), "true");
    assert.match(await firstCategory.getAttribute("aria-label"), /1位/);
    await assertMobileLayout(page);
    step = await page.locator("#survey-step").textContent();
    await nextPage(page, step);

    assert.match(await page.locator(".voice-page-title").textContent(), /最新情報・イベント・お得情報を詳しく/);
    const detailGroups = page.locator(".voice-step-page [data-error-id]");
    assert.equal(await detailGroups.count(), 8);
    for (let index = 0; index < 8; index += 1) {
      await detailGroups.nth(index).locator('input[type="radio"]').first().click();
    }
    await assertMobileLayout(page);
    step = await page.locator("#survey-step").textContent();
    await nextPage(page, step);

    assert.equal(await page.locator(".voice-page-title").textContent(), "これから期待する機能");
    await page.locator('input[name="future-interest"][value="none"]').click();
    await page.waitForFunction(() => document.activeElement?.id === "survey-next");
    await assertMobileLayout(page);
    step = await page.locator("#survey-step").textContent();
    await nextPage(page, step);

    assert.equal(await page.locator(".voice-page-title").textContent(), "回答内容の確認");
    assert.equal(await page.locator("#survey-submit").isVisible(), true);
    await assertMobileLayout(page);
    await page.locator("#survey-submit").click();
    await page.locator("#result-heading").waitFor();
    assert.equal(await page.locator("#result-heading").textContent(), "回答ありがとうございました");
    await page.getByText("PlayNavi Voice 2026", { exact: true }).last().waitFor();
  } finally {
    await context.close();
  }
}

test("schema-v2 survey stays usable and visually stable in real mobile Chrome", { timeout: 120_000 }, async (t) => {
  try {
    await access(CHROME_PATH, constants.X_OK);
  } catch {
    assert.fail(`Real Chrome is required for survey visual regression tests, but is not executable at ${CHROME_PATH}. Set CHROME_PATH explicitly; this test must not be skipped.`);
  }

  const fixture = await startFixtureServer();
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--force-color-profile=srgb", "--font-render-hinting=none"],
  });
  try {
    await t.test("iPhone-width 390 x 844", () => runMobileFlow(browser, fixture, {
      name: "iphone-390x844",
      viewport: { width: 390, height: 844 },
      snapshot: "intro",
    }));
    await t.test("Android-width 412 x 915", () => runMobileFlow(browser, fixture, {
      name: "android-412x915",
      viewport: { width: 412, height: 915 },
      snapshot: "basic",
    }));
    assert.equal(fixture.submissions.length, 2);
    for (const submission of fixture.submissions) {
      assert.equal(Object.keys(submission.answers.feature_priorities).length, 26);
      assert.deepEqual(submission.answers.category_top, ["news_deals"]);
      assert.equal(Object.keys(submission.answers.feature_details).length, 4);
      assert.equal(submission.answers.future_interest, "none");
    }
  } finally {
    await browser.close();
    await fixture.close();
  }
});
