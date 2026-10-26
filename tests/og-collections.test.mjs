// TASK-20261023-003 E1〜E3: カタログ・Tier表・マイルームの SNS のリンクカード (新しい形) の試験。
// - 順番に強いこと: 新しい鍵 (kind / tier_board / room) が無い答え (古い EF) は、今の形と版のハッシュのまま。
//   新しい鍵は壊れていてもその鍵だけ捨て、カードの残り (古い links が描く部分) は変わらない。
// - Tier表の札の大きさの決まり: 段 1〜8・本数 0〜100・偏り・空の段の全部の組み合わせで、表が枠に収まり、札が枠からはみ出さない。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";

import {
  cardElement, cardText, isR3Collection, loadCardImages, renderCard, renderCardImage, servesJpeg, shelfCoverSize,
  TIER_BOARD_BOX, TIER_FETCH_CONCURRENCY, tierCoverSource, tierLabelSize, tierLayoutOf,
} from "../api/_lib/og-card.mjs";
import { ALLOWED_IMAGE_HOSTS, largeVersion, validLarge } from "../api/_lib/og-large.mjs";
import { bandPaint, TIER_CARD_MAX, TIER_CARD_MIN, TIER_READ_MIN, tierBoardLayout } from "../api/_lib/tier-board.mjs";

const STORAGE = [...ALLOWED_IMAGE_HOSTS].find((host) => host.endsWith(".supabase.co"));
const cover = (id) => `https://images.igdb.com/igdb/image/upload/t_720p/co${id}.jpg`;
const AVATAR = `https://${STORAGE}/storage/v1/object/public/avatars/a.png`;
const FONT = (await readFile(new URL("../node_modules/@vercel/og/dist/Geist-Regular.ttf", import.meta.url))).buffer;
const fontLoader = async () => FONT;
const ASSETS = { logo: "data:image/png;base64,TE9HTw==", logoHeight: 28, badges: [] };
const IMAGE = await sharp({ create: { width: 90, height: 120, channels: 3, background: "#3366cc" } }).jpeg().toBuffer();

// 今の EF の答え (古い形)
const CATALOG_OLD = {
  layout: "grid", title: "Dot art", subtitle: "Hinata catalog", ranked: false, cover_urls: [cover(1), cover(2), cover(3)],
  total_count: 8, description: "RPG", owner_avatar_url: AVATAR,
};
const TIER_OLD = { ...CATALOG_OLD, title: "RPG tiers", subtitle: "Hinata Tier", description: null };
const PROFILE_OLD = {
  layout: "profile", name: "Hinata", avatar_url: AVATAR, background_url: AVATAR,
  stats: { total: 8, playing: 1, completed: 7, streaming_completed: 0, dropped: 0, want_to_play: 0 },
};
const board = (counts, look = "rarity") => ({
  look, mono_color: "cyan",
  tiers: counts.map((count, i) => ({
    rank_name: ["S", "A", "B", "C", "D", "E", "F", "G"][i], label: i === 0 ? "God" : null,
    color_key: ["gold", "purple", "blue", "green", "cyan", "red", "orange", "silver"][i],
    count, cover_urls: Array.from({ length: count }, (_, j) => cover(i * 100 + j)),
  })),
});
const ROOM = { theme: "cyan", cover: "theme", cover_url: null, type_name: "Rune Knight", shelf: "best", cover_urls: [cover(1), cover(2), cover(3)] };

test("E: an answer without the new keys keeps today's shape and version (new links x old edge function)", () => {
  for (const old of [CATALOG_OLD, TIER_OLD, PROFILE_OLD]) {
    const large = validLarge(old);
    assert.ok(large);
    for (const key of ["kind", "tier_board", "room"]) assert.equal(key in large, false, key);
    assert.equal(isR3Collection(large), false);
    assert.equal(servesJpeg(large), false, "old layouts stay PNG");
  }
});

test("E: the new keys never change the part an old links site reads (old links x new edge function)", () => {
  const strip = (large) => {
    const { kind, tier_board, room, ...rest } = large;
    return rest;
  };
  const cases = [
    [CATALOG_OLD, { kind: "catalog" }],
    [TIER_OLD, { tier_board: board([3, 3, 2]) }],
    [PROFILE_OLD, { room: ROOM }],
  ];
  for (const [old, extra] of cases) {
    const before = validLarge(old);
    const after = validLarge({ ...old, ...extra });
    assert.deepEqual(strip(after), before);
    // 新しい鍵が付くと版が変わる = SNS は新しい絵を読み直す
    assert.notEqual(largeVersion(after), largeVersion(before));
    assert.equal(servesJpeg(after), true, "the new layouts are JPEG");
  }
});

test("E1: kind accepts only catalog", () => {
  assert.equal(validLarge({ ...CATALOG_OLD, kind: "catalog" }).kind, "catalog");
  for (const bad of ["ranking", 1, null, ""]) assert.equal("kind" in validLarge({ ...CATALOG_OLD, kind: bad }), false, String(bad));
});

test("E2: tier_board is validated as a whole; a broken board is dropped, the card stays", () => {
  const ok = validLarge({ ...TIER_OLD, tier_board: board([3, 0, 2]) });
  assert.deepEqual(ok.tier_board.tiers.map((t) => [t.rank_name, t.count, t.cover_urls.length]), [["S", 3, 3], ["A", 0, 0], ["B", 2, 2]]);
  const bads = [
    { ...board([1]), look: "gold" },
    { ...board([1]), mono_color: "pink" },
    { ...board([]) },
    board([1, 1, 1, 1, 1, 1, 1, 1, 1]),
    { ...board([1]), tiers: [{ ...board([1]).tiers[0], rank_name: "TOOLONG" }] },
    { ...board([1]), tiers: [{ ...board([1]).tiers[0], color_key: "pink" }] },
    { ...board([1]), tiers: [{ ...board([1]).tiers[0], count: -1 }] },
    { ...board([1]), tiers: "x" },
    "x",
  ];
  for (const bad of bads) {
    const large = validLarge({ ...TIER_OLD, tier_board: bad });
    assert.ok(large, "the card itself survives");
    assert.equal("tier_board" in large, false, JSON.stringify(bad).slice(0, 60));
  }
  // 絵の住所が許されない札は「表紙なし」 (位置は保つ)、置いた札は合わせて 100 まで、ラベルが長すぎれば捨てる
  const mixed = board([2]);
  mixed.tiers[0].cover_urls = ["https://evil.example/x.jpg", cover(9)];
  mixed.tiers[0].label = "x".repeat(13);
  const large = validLarge({ ...TIER_OLD, tier_board: mixed });
  assert.deepEqual(large.tier_board.tiers[0].cover_urls, [null, cover(9)]);
  assert.equal(large.tier_board.tiers[0].label, null);
  const many = validLarge({ ...TIER_OLD, tier_board: board([60, 60]) });
  assert.equal(many.tier_board.tiers.reduce((s, t) => s + t.cover_urls.length, 0), 100);
});

test("E3: room is validated; a photo cover without a photo / a best cover without My Best falls back to the theme", () => {
  assert.deepEqual(validLarge({ ...PROFILE_OLD, room: ROOM }).room, ROOM);
  assert.equal(validLarge({ ...PROFILE_OLD, room: { ...ROOM, cover: "photo", cover_url: null } }).room.cover, "theme");
  assert.equal(validLarge({ ...PROFILE_OLD, room: { ...ROOM, cover: "photo", cover_url: "https://evil.example/p.jpg" } }).room.cover, "theme");
  assert.equal(validLarge({ ...PROFILE_OLD, room: { ...ROOM, cover: "best", shelf: "recent" } }).room.cover, "theme");
  const empty = validLarge({ ...PROFILE_OLD, room: { ...ROOM, cover_urls: ["https://evil.example/c.jpg"] } }).room;
  assert.equal(empty.shelf, null);
  assert.deepEqual(empty.cover_urls, []);
  assert.equal(validLarge({ ...PROFILE_OLD, room: { ...ROOM, type_name: "x".repeat(41) } }).room.type_name, null);
  for (const bad of [{ ...ROOM, theme: "gold" }, { ...ROOM, cover: "video" }, "x", []]) {
    assert.equal("room" in validLarge({ ...PROFILE_OLD, room: bad }), false);
  }
});

// ---------------------------------------------------------------- Tier表の札の大きさ (純粋関数で全部の組み合わせ)

function distributions(tiers, total) {
  const even = Array.from({ length: tiers }, (_, i) => Math.floor(total / tiers) + (i < total % tiers ? 1 : 0));
  const first = Array.from({ length: tiers }, (_, i) => (i === 0 ? total : 0));
  const last = Array.from({ length: tiers }, (_, i) => (i === tiers - 1 ? total : 0));
  // 1 段にほとんど (60 本まで)、残りを下の段へ 1 本ずつ・いちばん上は空
  const skew = Array.from({ length: tiers }, () => 0);
  if (tiers <= 2) skew[tiers - 1] = total;
  else {
    skew[1] = Math.min(total, 60);
    let left = total - skew[1];
    for (let i = 2; left > 0; i = i + 1 >= tiers ? 2 : i + 1) { skew[i] += 1; left -= 1; }
  }
  const alternate = Array.from({ length: tiers }, (_, i) => (i % 2 === 0 ? 1 : 0));
  const altTotal = alternate.reduce((a, b) => a + b, 0);
  const alt = alternate.map((v) => (altTotal ? v * Math.floor(total / altTotal) : 0));
  alt[0] += total - alt.reduce((a, b) => a + b, 0);
  return { even, first, last, skew, alt };
}

test("E2: every combination of 1-8 tiers x 0-100 cards x skew fits the board and keeps every card inside", () => {
  const totals = [0, 1, 2, 3, 5, 8, 12, 20, 30, 52, 60, 86, 100];
  let cases = 0;
  const smallest = {};
  for (let tiers = 1; tiers <= 8; tiers++) {
    for (const total of totals) {
      for (const [kind, counts] of Object.entries(distributions(tiers, total))) {
        const layout = tierBoardLayout(counts, TIER_BOARD_BOX);
        const label = `${tiers} tiers ${total} ${kind} ${counts.join(",")}`;
        cases += 1;
        assert.ok(layout.fits, `${label}: fits (${layout.total} <= ${TIER_BOARD_BOX.height})`);
        assert.ok(layout.cardW >= TIER_CARD_MIN && layout.cardW <= TIER_CARD_MAX, label);
        assert.equal(layout.cardH, Math.round((layout.cardW * 4) / 3), label);
        // 横: 帯 + 余白 + 札の列が枠の幅に入る
        assert.ok(layout.band + layout.pad * 2 + layout.perRow * layout.cardW + (layout.perRow - 1) * layout.gap <= TIER_BOARD_BOX.width, label);
        layout.rows.forEach((row, i) => {
          assert.equal(row.shown + row.more, counts[i], `${label}: row ${i} keeps every card (drawn or +N)`);
          const tiles = row.shown + (row.more > 0 ? 1 : 0);
          assert.ok(tiles <= Math.max(1, row.lines) * layout.perRow, `${label}: row ${i} tiles fit its lines`);
          if (layout.mode === "line") assert.ok(row.lines <= 1, label);
        });
        if (layout.mode === "all") assert.equal(layout.rows.every((r) => r.more === 0), true, label);
        // 全部描く・行の上限つきは札が読める大きさ (48px) 以上。それより小さくなるのは 1 段 1 行の時だけ (段が多い表)
        if (layout.mode !== "line") assert.ok(layout.cardW >= TIER_READ_MIN, `${label}: readable cards`);
        else assert.equal(tierBoardLayout(counts.map(() => 1), TIER_BOARD_BOX).cardW < TIER_READ_MIN || counts.length <= 2, true, label);
        const key = `${tiers}`;
        smallest[key] = Math.min(smallest[key] ?? Infinity, layout.cardW);
      }
    }
  }
  assert.equal(cases, 8 * 13 * 5);
  // 段が 8 つでも札は 30px 以上 (1200 の絵の上)。段が少ないほど大きい
  for (let tiers = 1; tiers <= 8; tiers++) assert.ok(smallest[tiers] >= 30, `${tiers} tiers: ${smallest[tiers]}`);
});

test("E2: the real STG boards pick the expected mode and size", () => {
  // STG の見本 (notes/share-r3-e/cases.txt): 8 本 3 段、52 本 5 段、86 本 5 段、1 段に 60 本
  assert.deepEqual(pick([3, 3, 2]), ["all", 105]);
  assert.equal(pick([7, 12, 16, 11, 6])[0], "all");
  assert.deepEqual(pick([10, 20, 28, 20, 8]), ["capped", 57]);
  // 1 段に 60 本: その段だけ 2 行にし、残りを「+N」(1 段 1 行にして 9 枚 + 51 にしない)
  const skew = tierBoardLayout([0, 60, 0, 1, 0], TIER_BOARD_BOX);
  assert.equal(skew.mode, "capped");
  assert.equal(skew.rows[1].lines, 2);
  assert.equal(skew.rows[1].shown + skew.rows[1].more, 60);
  assert.ok(skew.rows[1].shown >= 30);
  // 2 段で 1 段目に 100 本: 5 枚 + 95 にしない
  assert.ok(tierBoardLayout([100, 0], TIER_BOARD_BOX).drawn >= 25);
  function pick(counts) {
    const layout = tierBoardLayout(counts, TIER_BOARD_BOX);
    return [layout.mode, layout.cardW];
  }
});

test("E2: band paints follow the app's tier colors (rarity / neon / mono)", () => {
  assert.equal(bandPaint("rarity", "gold", "cyan", 0, 5).backgroundColor, "#f5b301");
  assert.equal(bandPaint("rarity", "gold", "cyan", 0, 5).ink, "#2b1a00");
  const neon = bandPaint("neon", "purple", "cyan", 0, 5);
  assert.equal(neon.neon, "#c2a0ff");
  assert.equal(neon.italic, false);
  // 単色: 上の段ほど明るく、下の段ほど暗い (アプリ monoBand)
  const top = bandPaint("mono", "silver", "gold", 0, 6).backgroundColor;
  const bottom = bandPaint("mono", "silver", "gold", 5, 6).backgroundColor;
  const light = (hex) => [1, 3, 5].reduce((s, i) => s + parseInt(hex.slice(i, i + 2), 16), 0);
  assert.ok(light(top) > light(bottom));
});

test("E2: labels never drop a single character onto the next line", () => {
  assert.deepEqual(tierLabelSize("殿堂入り", 92), { size: 18, lines: 1 });
  assert.deepEqual(tierLabelSize("かなり好き", 92), { size: 16, lines: 1 });
  assert.equal(tierLabelSize("とても長いラベルの見本です", 84).lines, 2);
  assert.ok(tierLabelSize("とても長いラベルの見本です", 84).size >= 10);
});

test("E2: small cards read the small IGDB cover; other hosts are left as they are", () => {
  assert.equal(tierCoverSource(cover(1), 40), "https://images.igdb.com/igdb/image/upload/t_cover_small/co1.jpg");
  assert.equal(tierCoverSource(cover(1), 80), "https://images.igdb.com/igdb/image/upload/t_cover_big/co1.jpg");
  const other = `https://${STORAGE}/storage/v1/object/public/covers/x.jpg`;
  assert.equal(tierCoverSource(other, 40), other);
});

test("E2: only the drawn covers are fetched, at most 8 at a time, and a failed one is read again once", async () => {
  const large = validLarge({ ...TIER_OLD, tier_board: board([13, 13, 13, 13, 12, 12, 12, 12]) });
  const layout = tierLayoutOf(large);
  let active = 0;
  let peak = 0;
  const seen = new Map();
  const images = await loadCardImages(large, async (url) => {
    const key = String(url);
    seen.set(key, (seen.get(key) ?? 0) + 1);
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    // 最初の 1 回だけ切れる札 (読み直しで読める)
    if (key.endsWith("co5.jpg") && seen.get(key) === 1) return new Response("", { status: 503 });
    return new Response(IMAGE);
  });
  const drawn = layout.rows.reduce((s, r) => s + r.shown, 0);
  assert.equal([...seen.keys()].length, drawn);
  assert.ok(peak <= TIER_FETCH_CONCURRENCY, `peak ${peak}`);
  assert.equal(seen.get("https://images.igdb.com/igdb/image/upload/t_cover_small/co5.jpg"), 2);
  assert.ok(images.tiers.flat().every(Boolean), "every drawn cover is an image after the retry");
});

test("E1-E3: the new cards render as 1200x630 JPEG, also with nothing to show", async () => {
  const fetchImpl = async () => new Response(IMAGE);
  const cases = [
    { ...CATALOG_OLD, kind: "catalog" },
    { ...CATALOG_OLD, kind: "catalog", cover_urls: [], total_count: 0, description: null },
    { ...CATALOG_OLD, kind: "catalog", cover_urls: [cover(1)] },
    { ...TIER_OLD, tier_board: board([3, 3, 2]) },
    { ...TIER_OLD, tier_board: board([0, 0, 0, 0, 0, 0, 0, 0], "neon") },
    { ...TIER_OLD, tier_board: board([0, 60, 0, 1, 0]) },
    { ...TIER_OLD, tier_board: { ...board([5, 0, 5, 9, 0, 1]), look: "mono", mono_color: "gold" } },
    { ...PROFILE_OLD, room: ROOM },
    { ...PROFILE_OLD, avatar_url: null, stats: null, room: { ...ROOM, shelf: null, cover_urls: [], type_name: null } },
    { ...PROFILE_OLD, room: { ...ROOM, cover: "best", cover_urls: [cover(1), cover(2), cover(3), cover(4), cover(5)] } },
    { ...PROFILE_OLD, room: { ...ROOM, cover: "photo", cover_url: AVATAR } },
  ];
  for (const raw of cases) {
    const { body, contentType } = await renderCardImage(raw, { fetchImpl, fontLoader });
    assert.equal(contentType, "image/jpeg");
    const meta = await sharp(body).metadata();
    assert.deepEqual([meta.width, meta.height], [1200, 630]);
  }
  // 古い形は今のまま PNG
  const png = await renderCard(CATALOG_OLD, { fetchImpl, fontLoader });
  assert.deepEqual([...png.subarray(1, 4)].map((c) => String.fromCharCode(c)).join(""), "PNG");
});

test("E2: the Tier card draws no owner name; E1 the catalog card says カタログ and the count", async () => {
  const fetchImpl = async () => new Response(IMAGE);
  const texts = (node, out = []) => {
    if (node === null || node === undefined || typeof node === "boolean") return out;
    if (Array.isArray(node)) { for (const child of node) texts(child, out); return out; }
    if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
    texts(node.props?.children, out);
    return out;
  };
  const tier = validLarge({ ...TIER_OLD, subtitle: "Hinataさんの Tier表", tier_board: board([3, 3, 2]) });
  const tierTexts = texts(cardElement(tier, await loadCardImages(tier, fetchImpl), ASSETS)).join("|");
  assert.equal(tierTexts.includes("Hinata"), false, tierTexts);
  assert.ok(tierTexts.includes("Tier表") && tierTexts.includes("8本") && tierTexts.includes("RPG tiers"));
  const catalog = validLarge({ ...CATALOG_OLD, subtitle: "ひなたさんのカタログ", kind: "catalog" });
  const catalogTexts = texts(cardElement(catalog, await loadCardImages(catalog, fetchImpl), ASSETS)).join("|");
  assert.ok(catalogTexts.includes("カタログ") && catalogTexts.includes("· 8本") && catalogTexts.includes("ひなた|"), catalogTexts);
});

test("E1-E3: every drawn word is in the font subset", () => {
  const tier = validLarge({ ...TIER_OLD, tier_board: { ...board([1, 1]), tiers: [{ ...board([1]).tiers[0], rank_name: "神", label: "殿堂入り" }, board([1, 1]).tiers[1]] } });
  for (const ch of "Tier表本+神殿堂入り…") assert.ok(cardText(tier).includes(ch), ch);
  const catalog = validLarge({ ...CATALOG_OLD, kind: "catalog" });
  for (const ch of "カタログ本·") assert.ok(cardText(catalog).includes(ch), ch);
  const room = validLarge({ ...PROFILE_OLD, room: { ...ROOM, type_name: "共創のルーンナイト" } });
  for (const ch of "マイルームベスト最近のゲーム記録クリアプレイ中積み共創ルーンナイト") assert.ok(cardText(room).includes(ch), ch);
});

test("E3: the shelf covers grow when there are fewer of them", () => {
  assert.deepEqual(shelfCoverSize(1), [132, 176]);
  assert.deepEqual(shelfCoverSize(3), [128, 171]);
  assert.deepEqual(shelfCoverSize(4), [98, 131]);
});
