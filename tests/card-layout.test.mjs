// TASK-20261017-002 r10: リンクカードの中の写真・動画の並べ方 (api/_lib/card-layout.mjs) の試験。
// (a) 共有の見本 (tests/fixtures/card-layout-cases.json。アプリの lib/share/linkCardLayout.ts も同じ見本で試す) を 0.5px 以内で再現する
// (b) 見本の全部 + 決まった種から作る 200 通りで、決まり (切らない・箱の中・重ならない・すき間・短い辺・1 枚目は左上) を守る
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { BOX, CARD, GAP, MIN_SIDE, layoutCard } from "../api/_lib/card-layout.mjs";

const FIXTURE = JSON.parse(await readFile(new URL("./fixtures/card-layout-cases.json", import.meta.url), "utf8"));

test("r10: the shared fixture uses the same card, box, gap and minimum side as card-layout.mjs", () => {
  assert.deepEqual(FIXTURE.card, CARD);
  assert.deepEqual(FIXTURE.box, BOX);
  assert.equal(FIXTURE.gap, GAP);
  assert.equal(FIXTURE.minSide, MIN_SIDE);
  // 横長 L・正方形 S・縦長 P の 1〜4 枚の並び全部 (3 + 9 + 27 + 81 = 120) + とても縦長・とても横長などの 12
  assert.equal(FIXTURE.cases.length, 133);
  assert.equal(FIXTURE.cases.filter((c) => /^[LSP]+$/.test(c.key)).length, 120);
});

test("r10: card-layout.mjs reproduces every fixture case within 0.5px", () => {
  for (const c of FIXTURE.cases) {
    const got = layoutCard(c.aspects);
    assert.equal(got.shown, c.shown, `${c.key}: shown`);
    assert.equal(got.slots.length, c.slots.length, `${c.key}: slots`);
    c.slots.forEach((want, i) => {
      if (want === null) { assert.equal(got.slots[i], null, `${c.key}[${i}] dropped`); return; }
      for (const k of ["x", "y", "w", "h"]) {
        assert.ok(Math.abs(got.slots[i][k] - want[k]) <= 0.5, `${c.key}[${i}].${k}: ${got.slots[i][k]} vs ${want[k]}`);
      }
    });
    assert.ok(Math.abs((1000 * got.area) / (CARD.w * CARD.h) / 10 - c.areaPct) <= 0.05 + 1e-9, `${c.key}: area`);
  }
});

// 決まった種の乱数 (mulberry32)。毎回同じ 200 通り
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = rng(20261021);
const RANDOM_CASES = Array.from({ length: 200 }, (_, i) => {
  const n = 1 + Math.floor(random() * 4);
  return { key: `random-${i}`, aspects: Array.from({ length: n }, () => 0.4 + random() * 2.2) };
});

const overlapOf = (p, q) => Math.max(0, Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x)) *
  Math.max(0, Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y));
// 2 つの枠の間のすき間 (横に並ぶなら横の、縦に並ぶなら縦の距離。斜めは両方の大きい方)
function gapBetween(p, q) {
  const dx = Math.max(q.x - (p.x + p.w), p.x - (q.x + q.w));
  const dy = Math.max(q.y - (p.y + p.h), p.y - (q.y + q.h));
  return Math.max(dx, dy);
}

test("r10: every layout keeps the rules (no crop, inside the box, no overlap, gaps, short side, the first item top-left)", () => {
  const eps = 1e-6;
  for (const { key, aspects } of [...FIXTURE.cases, ...RANDOM_CASES]) {
    const { shown, slots, group } = layoutCard(aspects);
    assert.ok(shown >= 1 && shown <= aspects.length, `${key}: shown`);
    // 外すのは後ろからだけ
    slots.forEach((s, i) => assert.equal(s !== null, i < shown, `${key}[${i}]: only the last ones are dropped`));
    const drawn = slots.filter(Boolean);
    drawn.forEach((s, i) => {
      // 切らない: 枠の縦横 = 写真の縦横 (0.5% 以内)
      assert.ok(Math.abs(s.w / s.h - aspects[i]) / aspects[i] < 0.005, `${key}[${i}]: aspect ${s.w / s.h} vs ${aspects[i]}`);
      // 箱の中
      assert.ok(s.x >= BOX.x - eps && s.y >= BOX.y - eps && s.x + s.w <= BOX.x + BOX.w + eps && s.y + s.h <= BOX.y + BOX.h + eps,
        `${key}[${i}]: inside the box ${JSON.stringify(s)}`);
      // 短い辺 (2 枚以上の時だけ。1 枚だけの時は下限を見ない)
      if (drawn.length > 1) assert.ok(Math.min(s.w, s.h) >= MIN_SIDE - eps, `${key}[${i}]: short side ${Math.min(s.w, s.h)}`);
    });
    for (let i = 0; i < drawn.length; i += 1) {
      for (let j = i + 1; j < drawn.length; j += 1) {
        assert.ok(overlapOf(drawn[i], drawn[j]) < eps, `${key}: ${i}/${j} overlap`);
        assert.ok(gapBetween(drawn[i], drawn[j]) >= 7.5, `${key}: ${i}/${j} gap ${gapBetween(drawn[i], drawn[j])}`);
      }
    }
    // 1 枚目はまとまりの左上の角 (読む順の最初)
    const first = drawn[0];
    assert.ok(Math.abs(first.x - group.x) < eps && Math.abs(first.y - group.y) < eps, `${key}: the first item is at the top-left`);
    for (const s of drawn) assert.ok(s.x >= first.x - eps && s.y >= first.y - eps, `${key}: nothing left of / above the first item`);
    // まとまりは箱の真ん中
    assert.ok(Math.abs(group.x - BOX.x - (BOX.w - group.w) / 2) < 0.01 && Math.abs(group.y - BOX.y - (BOX.h - group.h) / 2) < 0.01,
      `${key}: centred`);
  }
});

test("r10: no single photo is cropped or shrunk below the box (one item always fills the box's width or height)", () => {
  for (const a of [0.4, 0.46, 0.75, 1, 4 / 3, 16 / 9, 2.0185, 7 / 3, 2.6]) {
    const { slots: [s] } = layoutCard([a]);
    assert.ok(Math.abs(s.w - BOX.w) < 1e-6 || Math.abs(s.h - BOX.h) < 1e-6, `${a}: ${JSON.stringify(s)}`);
  }
});
