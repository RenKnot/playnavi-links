// TASK-20261023-003 (10/26): カードの大きな題 (カタログ・ゲーム・表紙なしの記録) の字の大きさの決まりの試験。
// - 前の決まり (字数だけ) で本番に出た「とにかくBGMが良 / い」のような 1 字だけの行が出ない。
// - 計算 (title-fit.mjs) の折り返しが、カードを描く Satori (@vercel/og) の本物の折り返しと行数で一致する
//   (本物の字体 Noto Sans JP 900 を題の字だけ切り出した tests/fixtures/noto-sans-jp-900-titles.ttf で描き、画素で行を数える)。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ImageResponse } from "@vercel/og";
import { createElement as h } from "react";
import { PNG } from "pngjs";

import { TITLE_SPECS, titleFit, titleText } from "../api/_lib/og-card.mjs";
import { charWidth, fitTitle, FIT_MARGIN, MIN_LAST_LINE, segments, textWidth, wrapTitle } from "../api/_lib/title-fit.mjs";

const TITLES = JSON.parse(await readFile(new URL("./fixtures/title-fit-titles.json", import.meta.url), "utf8"));
const FONT = (await readFile(new URL("./fixtures/noto-sans-jp-900-titles.ttf", import.meta.url))).buffer;

const noOrphan = (lines) => lines.length === 1 || lines.at(-1) >= MIN_LAST_LINE * Math.max(...lines);

test("前の決まりで 1 字だけ次の行に落ちた題は、1 字だけの行の無い一番大きい字になる", () => {
  // 10/26 本番のカタログのカード (幅 516): 前は 56px「とにかくBGMが良 / い」・48px「絶対クリアするぞリス / ト」「近年の名作ホラーゲー / ム」
  const catalog = (title) => titleFit(title, TITLE_SPECS.catalog);
  assert.deepEqual([catalog("とにかくBGMが良い").size, catalog("とにかくBGMが良い").lines.length], [52, 1]);
  assert.deepEqual([catalog("絶対クリアするぞリスト").size, catalog("絶対クリアするぞリスト").lines.length], [44, 1]);
  assert.deepEqual([catalog("近年の名作ホラーゲーム").size, catalog("近年の名作ホラーゲーム").lines.length], [44, 1]);
  // 短い題は今までどおり一番大きい 56px の 1 行
  assert.deepEqual([catalog("名作").size, catalog("名作").lines.length], [56, 1]);
  // 20 字 (アプリの上限) は 2 行で釣り合う大きさ
  const long = catalog("あいうえおかきくけこさしすせそたちつてと");
  assert.equal(long.lines.length, 2);
  assert.ok(noOrphan(long.lines));
});

test("字の幅は字体の実測 (太字の英大文字は和文の 0.6 字より広い)", () => {
  assert.equal(charWidth("あ"), 1);
  assert.equal(charWidth("M"), 0.877);
  assert.ok(Math.abs(textWidth("BGM") - 2.305) < 1e-9);
  assert.equal(charWidth("™"), 1);
  assert.equal(charWidth("é"), 0.7);
});

test("切る所: 小さい字・長音・閉じ括弧・全角の空白の前と、開き括弧の後では切らない。英数字のつながりは切らない", () => {
  const cut = (text) => segments(text).map((s) => s.text);
  assert.deepEqual(cut("キーャーー"), ["キーャーー"]);
  assert.deepEqual(cut("「レトロ」"), ["「レ", "ト", "ロ」"]);
  assert.deepEqual(cut("GOTY2026私的"), ["GOTY2026", "私", "的"]);
  assert.deepEqual(cut("RPG/ADV"), ["RPG/", "ADV"]);
  assert.deepEqual(cut("ラン？　この"), ["ラ", "ン？　", "こ", "の"]);
  assert.deepEqual(cut("Best of 2026"), ["Best ", "of ", "2026"]);
});

test("どの題でも: 当たった大きさは行数の上限以内・枠に収まり・1 字だけの行が無く、枠を少し狭めても同じ行数", () => {
  const base = "あいうえおかきくけこさしすせそたちつてと";
  const mixed = ["RPG", "BGM", "GOTY", "Switch 2", "HD‑2D", "「名作」", "ー", "ッ", "、", " "];
  const titles = [...TITLES.catalog, ...TITLES.game];
  for (let n = 1; n <= 40; n++) titles.push(base.repeat(2).slice(0, n));
  for (let i = 0; i < mixed.length; i++) for (let n = 0; n <= 18; n += 3) titles.push(base.slice(0, n) + mixed[i] + base.slice(n, n + 6));
  for (const [name, spec] of Object.entries(TITLE_SPECS)) {
    for (const title of titles) {
      const fit = titleFit(title, spec);
      if (!fit.fitted) {
        assert.equal(fit.size, spec.fallback(title), `${name} ${title}`);
        continue;
      }
      assert.ok(spec.sizes.includes(fit.size), `${name} ${title}`);
      assert.ok(fit.lines.length <= spec.maxLines, `${name} ${title} ${fit.lines}`);
      assert.ok(fit.lines.every((w) => w <= spec.width), `${name} ${title} ${fit.lines}`);
      assert.ok(noOrphan(fit.lines), `${name} ${title} ${fit.lines}`);
      const tight = wrapTitle(titleText(title), fit.size, spec.width * FIT_MARGIN, { keepAll: fit.keepAll });
      assert.equal(tight.length, fit.lines.length, `${name} ${title}`);
    }
  }
});

test("とても長い題 (上限の行数でも収まらない) は前の字数の決まりの大きさ", () => {
  const title = "あ".repeat(80);
  for (const spec of Object.values(TITLE_SPECS)) {
    const fit = titleFit(title, spec);
    assert.equal(fit.fitted, false);
    assert.equal(fit.size, spec.fallback(title));
  }
  assert.equal(fitTitle("", { width: 500, sizes: [56], maxLines: 2, fallback: 56 }).fitted, false);
});

// 本物の描画で、題だけを同じ字の大きさ・幅・語の切り方で描き、行の数と各行の右端を画素から測る
async function renderLines(text, size, width, keepAll) {
  const lineBox = Math.round(size * 1.25);
  const height = lineBox * 6;
  const element = h("div", { style: { width: width + 120, height, display: "flex", backgroundColor: "#000", fontFamily: "N" } },
    h("div", { style: { display: "block", width, fontSize: size, lineHeight: 1.25, color: "#FFF", fontWeight: 900,
      ...(keepAll ? { wordBreak: "keep-all" } : {}) } }, text));
  const res = new ImageResponse(element, { width: width + 120, height, fonts: [{ name: "N", data: FONT, weight: 900, style: "normal" }] });
  const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
  const lines = [];
  for (let k = 0; k < 6; k++) {
    let right = -1;
    // 字の胴 (行の箱の 25〜75%) だけを見る (p・y の下や濁点は隣の行の箱にはみ出すことがある)
    for (let y = k * lineBox + Math.round(lineBox * 0.25); y < k * lineBox + Math.round(lineBox * 0.75); y++) {
      for (let x = png.width - 1; x > right; x--) {
        if (png.data[(y * png.width + x) * 4] > 128) {
          right = x;
          break;
        }
      }
    }
    if (right >= 0) lines.push(right + 1);
  }
  return lines;
}

test("計算の折り返しは、本物の描画 (Satori + Noto Sans JP 900) と行数が同じ・1 字だけの行も出ない", async () => {
  let checked = 0;
  for (const [name, spec] of Object.entries(TITLE_SPECS)) {
    const titles = name === "catalog" ? TITLES.catalog : TITLES.game;
    for (const title of titles) {
      const fit = titleFit(title, spec);
      const real = await renderLines(titleText(title), fit.size, spec.width, fit.keepAll);
      assert.equal(real.length, fit.lines.length, `${name} ${fit.size}px ${title}: 計算 ${fit.lines.map(Math.round)} 本物 ${real}`);
      if (fit.fitted && real.length > 1) {
        // 本物の幅は字の墨の右端 (閉じ括弧・「！」は字送りより狭い) なので、少しゆるく 0.3
        assert.ok(real.at(-1) >= 0.3 * Math.max(...real), `${name} ${title}: 本物 ${real}`);
      }
      checked++;
    }
  }
  assert.equal(checked, TITLES.catalog.length * 1 + TITLES.game.length * 3);
});
