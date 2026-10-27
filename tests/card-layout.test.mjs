// TASK-20261017-002 r10 → r11: リンクカードの中の写真・動画の並べ方 (api/_lib/card-layout.mjs) の試験。
// (a) 共有の見本 (tests/fixtures/card-layout-cases.json。アプリの lib/share/linkCardLayout.ts も同じ見本で試す) を 0.5px 以内で再現する
// (b) 見本の全部 + 決まった種から作る 1〜10 枚の 400 通りで、決まり (切らない・箱の中・重ならない・すき間・短い辺・1 枚目は左上・
//     heroFirst なら 1 枚目がいちばん大きい・描くのは 8 枚まで・外すのは後ろからだけ) を守る
// (c) 8 枚のいちばん重い並びでも 1 秒かからない (カードを作るたびに走るので)
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { BOX, CARD, GAP, MAX_ITEMS, MIN_SIDE, layoutCard } from "../api/_lib/card-layout.mjs";

const FIXTURE = JSON.parse(await readFile(new URL("./fixtures/card-layout-cases.json", import.meta.url), "utf8"));

test("r11: the shared fixture uses the same card, box, gap, minimum side and maximum count as card-layout.mjs", () => {
  assert.equal(FIXTURE.version, 2);
  assert.deepEqual(FIXTURE.card, CARD);
  assert.deepEqual(FIXTURE.box, BOX);
  assert.equal(FIXTURE.gap, GAP);
  assert.equal(FIXTURE.minSide, MIN_SIDE);
  assert.equal(FIXTURE.maxItems, MAX_ITEMS);
  assert.equal(MAX_ITEMS, 8);
  assert.equal(FIXTURE.cases.length, 347);
  const plain = FIXTURE.cases.filter((c) => !c.heroFirst);
  // 横長 L・正方形 S・縦長 P の 1〜4 枚の並び全部 (3 + 9 + 27 + 81 = 120)
  assert.equal(plain.filter((c) => /^[LSP]{1,4}$/.test(c.key)).length, 120);
  // 5〜8 枚は L/S/P の組み合わせ全部 (21 + 28 + 36 + 45 = 130)
  const multisetsOf = (n) => plain.filter((c) => c.key.length === n && /^L*S*P*$/.test(c.key)).length;
  assert.deepEqual([5, 6, 7, 8].map(multisetsOf), [21, 28, 36, 45]);
  // 9 枚以上 (描くのは 8 枚まで) と heroFirst (同じプレイの写真で埋める時) の見本
  assert.ok(plain.filter((c) => c.aspects.length > MAX_ITEMS).length >= 3);
  assert.equal(FIXTURE.cases.filter((c) => c.heroFirst).length, 41);
});

test("r11: card-layout.mjs reproduces every fixture case within 0.5px (heroFirst taken from the case)", () => {
  for (const c of FIXTURE.cases) {
    const label = `${c.key}${c.heroFirst ? " (heroFirst)" : ""}`;
    const got = layoutCard(c.aspects, { heroFirst: c.heroFirst });
    assert.equal(got.shown, c.shown, `${label}: shown`);
    assert.equal(got.slots.length, c.slots.length, `${label}: slots`);
    c.slots.forEach((want, i) => {
      if (want === null) { assert.equal(got.slots[i], null, `${label}[${i}] dropped`); return; }
      for (const k of ["x", "y", "w", "h"]) {
        assert.ok(Math.abs(got.slots[i][k] - want[k]) <= 0.5, `${label}[${i}].${k}: ${got.slots[i][k]} vs ${want[k]}`);
      }
    });
    assert.ok(Math.abs((1000 * got.area) / (CARD.w * CARD.h) / 10 - c.areaPct) <= 0.05 + 1e-9, `${label}: area`);
  }
});

// 決まった種の乱数 (mulberry32)。毎回同じ 400 通り (1〜10 枚。半分は heroFirst)
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
const RANDOM_CASES = Array.from({ length: 400 }, (_, i) => {
  const n = 1 + Math.floor(random() * 10);
  return { key: `random-${i}`, heroFirst: i % 2 === 1, aspects: Array.from({ length: n }, () => 0.4 + random() * 2.2) };
});

const overlapOf = (p, q) => Math.max(0, Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x)) *
  Math.max(0, Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y));
// 2 つの枠の間のすき間 (横に並ぶなら横の、縦に並ぶなら縦の距離。斜めは両方の大きい方)
function gapBetween(p, q) {
  const dx = Math.max(q.x - (p.x + p.w), p.x - (q.x + q.w));
  const dy = Math.max(q.y - (p.y + p.h), p.y - (q.y + q.h));
  return Math.max(dx, dy);
}

test("r11: every layout keeps the rules (no crop, inside the box, no overlap, gaps, short side, first item top-left, hero largest, at most 8, only trailing items dropped)", () => {
  const eps = 1e-6;
  let checked = 0;
  for (const { key, aspects, heroFirst } of [...FIXTURE.cases, ...RANDOM_CASES]) {
    const label = `${key}${heroFirst ? " (heroFirst)" : ""}`;
    const { shown, slots, group } = layoutCard(aspects, { heroFirst });
    assert.equal(slots.length, aspects.length, `${label}: one slot per input`);
    assert.ok(shown >= 1 && shown <= Math.min(aspects.length, MAX_ITEMS), `${label}: shown ${shown}`);
    // 外すのは後ろからだけ (8 枚を超える分も)
    slots.forEach((s, i) => assert.equal(s !== null, i < shown, `${label}[${i}]: only the last ones are dropped`));
    const drawn = slots.filter(Boolean);
    drawn.forEach((s, i) => {
      // 切らない: 枠の縦横 = 写真の縦横 (0.5% 以内)
      assert.ok(Math.abs(s.w / s.h - aspects[i]) / aspects[i] < 0.005, `${label}[${i}]: aspect ${s.w / s.h} vs ${aspects[i]}`);
      // 箱の中
      assert.ok(s.x >= BOX.x - eps && s.y >= BOX.y - eps && s.x + s.w <= BOX.x + BOX.w + eps && s.y + s.h <= BOX.y + BOX.h + eps,
        `${label}[${i}]: inside the box ${JSON.stringify(s)}`);
      // 短い辺 (2 枚以上の時だけ。1 枚だけの時は下限を見ない)
      if (drawn.length > 1) assert.ok(Math.min(s.w, s.h) >= MIN_SIDE - eps, `${label}[${i}]: short side ${Math.min(s.w, s.h)}`);
    });
    for (let i = 0; i < drawn.length; i += 1) {
      for (let j = i + 1; j < drawn.length; j += 1) {
        assert.ok(overlapOf(drawn[i], drawn[j]) < eps, `${label}: ${i}/${j} overlap`);
        assert.ok(gapBetween(drawn[i], drawn[j]) >= 7.5, `${label}: ${i}/${j} gap ${gapBetween(drawn[i], drawn[j])}`);
      }
    }
    // 1 枚目はまとまりの左上の角 (読む順の最初)
    const first = drawn[0];
    assert.ok(Math.abs(first.x - group.x) < eps && Math.abs(first.y - group.y) < eps, `${label}: the first item is at the top-left`);
    for (const s of drawn) assert.ok(s.x >= first.x - eps && s.y >= first.y - eps, `${label}: nothing left of / above the first item`);
    // heroFirst: 1 枚目 (その記録の写真) の面積がほかのどれ以上 (同じ大きさは可。1px² の誤差)
    if (heroFirst) for (const s of drawn.slice(1)) assert.ok(s.w * s.h <= first.w * first.h + 1, `${label}: the first item is the largest`);
    // まとまりは箱の真ん中
    assert.ok(Math.abs(group.x - BOX.x - (BOX.w - group.w) / 2) < 0.01 && Math.abs(group.y - BOX.y - (BOX.h - group.h) / 2) < 0.01,
      `${label}: centred`);
    checked += 1;
  }
  assert.equal(checked, FIXTURE.cases.length + RANDOM_CASES.length);
  // 乱数の 400 通りに 9 枚以上と heroFirst の 2 枚以上が入っている
  assert.ok(RANDOM_CASES.some((c) => c.aspects.length > MAX_ITEMS));
  assert.ok(RANDOM_CASES.some((c) => c.heroFirst && c.aspects.length >= 5));
});

test("r10: no single photo is cropped or shrunk below the box (one item always fills the box's width or height)", () => {
  for (const a of [0.4, 0.46, 0.75, 1, 4 / 3, 16 / 9, 2.0185, 7 / 3, 2.6]) {
    for (const heroFirst of [false, true]) {
      const { slots: [s] } = layoutCard([a], { heroFirst });
      assert.ok(Math.abs(s.w - BOX.w) < 1e-6 || Math.abs(s.h - BOX.h) < 1e-6, `${a}: ${JSON.stringify(s)}`);
    }
  }
});

test("r11: the heaviest 8-item layouts finish within 1 second each on this machine", (t) => {
  const K = { L: 16 / 9, S: 1, P: 3 / 4, T: 9 / 19.5, W: 7 / 3 };
  let worst = 0;
  for (const key of ["LLLLLLLL", "SSSSSSSS", "PPPPPPPP", "LPSLPSLP", "TTTTTTTT", "WWWWWWWW", "LLLLLLLLLL", "PLLLLLLL", "LSPLSPLS"]) {
    for (const heroFirst of [false, true]) {
      const t0 = performance.now();
      layoutCard([...key].map((k) => K[k]), { heroFirst });
      worst = Math.max(worst, performance.now() - t0);
    }
  }
  t.diagnostic(`worst 8-item layout: ${worst.toFixed(0)}ms`);
  assert.ok(worst < 1000, `worst ${worst.toFixed(0)}ms`);
});
