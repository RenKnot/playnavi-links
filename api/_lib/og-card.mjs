// Large share card (1200x630) layouts and asset loading for api/og.mjs.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "@vercel/og";
import { createElement as h } from "react";
import sharp from "sharp";
import { MAX_ITEMS, layoutCard } from "./card-layout.mjs";
import { allowedImageUrl, validLarge } from "./og-large.mjs";

export { ALLOWED_IMAGE_HOSTS, allowedImageUrl, validLarge } from "./og-large.mjs";

export const W = 1200;
export const H = 630;
export const IMAGE_TIMEOUT_MS = 2000;
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const FONT_TIMEOUT_MS = 2200;
const MAX_INPUT_PIXELS = 40_000_000;

const COVER = { game: [330, 440], grid: [240, 320], gridCompact: [204, 272], moment: [300, 400] };
// Moment photo (TASK-20261017-002): fitted inside this box, aspect kept.
const PHOTO_BOX = [640, 520];
const MOMENT_SPOILER = "ネタバレを含むモーメント";
const OWNER_AVATAR = 44;
const AVATAR = 200;
const ILLUSTRATION = 300;
const DIAGNOSIS_ACCENT = "#70D5E2";
const LOGO_W = 160;
const BADGE = [64, 100];

// ---------------------------------------------------------------- r3 (TASK-20261017-002 V1/V2)
// X draws its own label (the site address / post title) over the bottom-left of the card, so the r3 layouts
// keep the bottom-left SAFE_BOTTOM px free of anything that must be read (r9: the CTA sits bottom-right).
export const SAFE_BOTTOM = 90;
// Cards that carry the poster's photos are JPEG (Bluesky thumb limit 1MB).
export const JPEG_MAX_BYTES = 900_000;
const JPEG_QUALITIES = [86, 78, 70, 60, 50, 40];
// r10: 写真・動画は切らずに並べる (並べ方は card-layout.mjs。アプリのプレビューと同じ答え)。枠の角の丸み
const TILE_RADIUS = 14;
// r10: まとまりの上下の空き (上下は同じ高さ) がこれ以上あれば、上の帯と右下の札をその空きに置く (影は描かない)。
// 足りなければ写真の上に重ね、r9 と同じ薄い影を敷く。並べ方 (写真の位置と大きさ) は札のために変えない
// 64px では X の上下の切れ目 (上下 15px) を避けると帯が窮屈になるので 80px
export const ROOM_MIN = 80;
// X の公式の枠は 2:1 (1200x600) で、1200x630 の絵は上下 15px ずつ切られうる。上の帯の字・アイコンと右下の札はこの内側
export const X_SAFE = { top: 15, bottom: H - 15 };
// r9: 上の帯 (投稿者は左、ゲームは右)。どちらも小さく、主役は写真。
const HEADER = { x: 32, top: 22, h: 56, w: W - 64, gap: 40, shade: 200 };
// 上の帯の影より下 (動画の長さの札をここより下に置き、帯とぶつけない)
const HEADER_CLEAR = 104;
const HEAD_AVATAR = 44;
const HEAD_NAME = 24;
const HEAD_TITLE = 22;
const HEAD_TITLE_MAX = 620;
const THUMB = [40, 53];
// 写真の無い記録: ゲームのカバーを大きく真ん中に。
const HERO_COVER = [352, 470];
// r9: 右下に重ねる遷移文言 (枚数は書かない)。X はカードの左下に住所を重ねるので右下に置く。
export const CTA_LABELS = {
  own: "写真・動画をすべて見る",
  // 同じプレイのほかの記録の写真・動画 (この投稿の物ではない) と分かる言い方
  play: "このプレイの写真・動画を見る",
  moment: "モーメントを見る",
  review: "レビューを見る",
  spoiler: "タップして見る",
};
export const SPOILER_LABEL = "ネタバレを含みます";

// r3 layouts apply only when the edge function sent the r3 keys.
export const isR3 = (large) =>
  (large.layout === "moment" || large.layout === "game") && (large.media !== undefined || large.counts !== undefined);

// 61_000 -> "1:01"
export function formatDuration(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return null;
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// Whether the card draws the poster's own photos (then it is sent as JPEG).
export function drawsUserPhotos(large) {
  // r8: a record without its own photos draws the play's photos (play_media)。r11: 自分の物があっても埋めに使う
  const play = (large.play_media?.length ?? 0) > 0;
  // r9: ネタバレの記録 (モーメントもレビューも) は写真を描かない
  if (large.spoiler === true) return false;
  if (large.layout === "moment") return (large.media?.length ?? 0) > 0 || Boolean(large.photo_url) || play;
  if (large.layout === "game") return (large.media?.length ?? 0) > 0 || play;
  return false;
}

// r11: カードに描く写真・動画は 8 つまで (card-layout.mjs MAX_ITEMS)。その記録の物 (media) が先、まだ 8 に届かなければ
// 同じプレイのアルバムのほかの物 (play_media) で埋める。並べ方はどちらも同じ決まり (切らない)。
// 全部を見せるのはリンクの先の「このプレイのアルバム」。
export const CARD_TILES_MAX = MAX_ITEMS;

// r11: カードに描く順の写真・動画 (own = その記録の物か)。ネタバレの記録は何も描かない
export function cardItems(large) {
  if (large.spoiler === true) return [];
  return [
    ...(large.media ?? []).map((item) => ({ item, own: true })),
    ...(large.play_media ?? []).map((item) => ({ item, own: false })),
  ].slice(0, CARD_TILES_MAX);
}

// ---------------------------------------------------------------- fonts

const FONT_CACHE_LIMIT = 200;
const fontCache = new Map();

export async function loadSubsetFont(text, weight, fetchImpl = globalThis.fetch) {
  const signal = AbortSignal.timeout(FONT_TIMEOUT_MS);
  const stylesheetUrl = new URL(
    `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@${weight}&text=${encodeURIComponent(text)}`,
  );
  const stylesheet = await fetchImpl(stylesheetUrl, { signal, headers: { Accept: "text/css" } });
  if (!stylesheet.ok) throw new Error("Japanese font stylesheet unavailable");
  const css = await stylesheet.text();
  const fontSource = css.match(
    /src:\s*url\(([^)]+)\)\s*format\(['"](truetype|opentype)['"]\)/,
  );
  if (!fontSource) throw new Error("No supported Japanese font in stylesheet");
  const fontUrl = new URL(fontSource[1].replace(/^['"]|['"]$/g, ""));
  if (fontUrl.protocol !== "https:" || fontUrl.hostname !== "fonts.gstatic.com") {
    throw new Error("Unexpected Japanese font origin");
  }
  const fontResponse = await fetchImpl(fontUrl, { signal });
  if (!fontResponse.ok) throw new Error("Japanese font unavailable");
  const fontData = await fontResponse.arrayBuffer();
  if (fontData.byteLength < 4 || fontData.byteLength > 500_000) {
    throw new Error("Invalid Japanese font size");
  }
  const magic = new DataView(fontData).getUint32(0);
  if (magic !== 0x00010000 && magic !== 0x4f54544f) {
    throw new Error("Unsupported Japanese font format");
  }
  return fontData;
}

// Cached by (weight, text); failures are not cached.
export function cachedFont(text, weight, fetchImpl) {
  const key = `${weight}\n${text}`;
  let promise = fontCache.get(key);
  if (!promise) {
    promise = loadSubsetFont(text, weight, fetchImpl).catch((error) => {
      fontCache.delete(key);
      throw error;
    });
    if (fontCache.size >= FONT_CACHE_LIMIT) fontCache.delete(fontCache.keys().next().value);
    fontCache.set(key, promise);
  }
  return promise;
}

// Fixed labels drawn by the layouts plus every dynamic string, deduplicated
// and sorted so identical character sets share one cache entry.
// "…" is drawn by textOverflow: ellipsis, so it must be in every subset.
const FIXED_TEXT = "0123456789+,.…─販売・開発さんのプロフィール総ログ数本プレイ中クリア実況視聴済断念積みゲーあと作品" +
  "ゲーマーDNA対戦没入論理感覚自立仲間集中広範";
export function cardText(large) {
  const parts = [FIXED_TEXT];
  if (large.layout === "game") {
    parts.push(large.heading ?? "", large.title, large.publisher ?? "", large.developer ?? "");
    if (large.score !== undefined) parts.push("満足度/10");
    if (large.excerpt !== undefined) parts.push(large.excerpt);
  }
  if (large.layout === "moment") parts.push(large.heading, large.title, "『』", large.excerpt ?? "", MOMENT_SPOILER);
  // \u2011 = 題名の折れないハイフン (titleText)
  if (isR3(large)) parts.push(authorName(large), titleText(large.title), ...Object.values(CTA_LABELS), SPOILER_LABEL, "満足度/10", "›:", "\u2011");
  if (large.layout === "profile") parts.push(large.name);
  if (large.layout === "grid") parts.push(large.title, large.subtitle, large.description ?? "");
  if (large.layout === "diagnosis") {
    parts.push(large.name, large.type_name, large.title ?? "");
    for (const axis of large.axes) parts.push(axis.left, axis.right);
  }
  return [...new Set([...parts.join("")])].filter((c) => c.trim()).sort().join("");
}

// ---------------------------------------------------------------- images

async function readCapped(response, maxBytes) {
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("image too large");
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error("image too large");
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error("image too large");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

// Fetches an allow-listed image; returns the raw bytes or null on any failure.
export async function fetchImage(url, fetchImpl = globalThis.fetch, {
  timeoutMs = IMAGE_TIMEOUT_MS,
  maxBytes = IMAGE_MAX_BYTES,
} = {}) {
  if (!allowedImageUrl(url)) return null;
  try {
    const response = await fetchImpl(new URL(url), {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error",
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg" },
    });
    if (response.status !== 200) return null;
    const buffer = await readCapped(response, maxBytes);
    return buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
}

const toDataUri = (buffer, type) => `data:image/${type};base64,${buffer.toString("base64")}`;
const pipeline = (buffer) => sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" });

// Each transform returns null instead of throwing so one broken image only
// degrades its own slot.
export async function coverUri(buffer, width, height) {
  if (!buffer) return null;
  try {
    const out = await pipeline(buffer).rotate().resize(width, height, { fit: "cover" })
      .flatten({ background: "#1E293B" }).jpeg({ quality: 86 }).toBuffer();
    return toDataUri(out, "jpeg");
  } catch {
    return null;
  }
}

export async function pngUri(buffer, width, height) {
  if (!buffer) return null;
  try {
    const out = await pipeline(buffer).rotate().resize(width, height, { fit: "cover" }).png().toBuffer();
    return toDataUri(out, "png");
  } catch {
    return null;
  }
}

// Fits inside the box keeping the aspect; returns the drawn size with the URI.
export async function fittedUri(buffer, maxWidth, maxHeight) {
  if (!buffer) return null;
  try {
    const { data, info } = await pipeline(buffer).rotate()
      .resize(maxWidth, maxHeight, { fit: "inside" })
      .flatten({ background: "#1E293B" }).jpeg({ quality: 88 }).toBuffer({ resolveWithObject: true });
    return { uri: toDataUri(data, "jpeg"), width: info.width, height: info.height };
  } catch {
    return null;
  }
}

export async function blurUri(buffer) {
  if (!buffer) return null;
  try {
    const out = await pipeline(buffer).rotate().resize(W, H, { fit: "cover" })
      .flatten({ background: "#0B1524" }).blur(36).modulate({ brightness: 0.75, saturation: 1.1 })
      .jpeg({ quality: 80 }).toBuffer();
    return toDataUri(out, "jpeg");
  } catch {
    return null;
  }
}

let staticAssets;
export function loadStaticAssets(root = process.cwd()) {
  staticAssets ??= (async () => {
    const logo = await sharp(await readFile(join(root, "logo.png"))).resize({ width: LOGO_W * 2 }).png().toBuffer();
    const logoMeta = await sharp(logo).metadata();
    const badges = await Promise.all([1, 2, 3].map(async (n) =>
      toDataUri(await sharp(await readFile(join(root, "assets", "og", `badge_${n}.png`)))
        .resize(BADGE[0] * 2, BADGE[1] * 2, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png().toBuffer(), "png")
    ));
    // r9: 記録のカードに PlayNavi の印は描かない (assets/og/playnavi-mark-white.png は読まない)
    return {
      logo: toDataUri(logo, "png"),
      logoHeight: Math.round((logoMeta.height * LOGO_W) / logoMeta.width),
      badges,
    };
  })().catch((error) => {
    staticAssets = undefined;
    throw error;
  });
  return staticAssets;
}

// The shared profile-cover presets are app-bundled images; their storage
// URLs are identifiers with no stored object (404), so this site ships copies.
const PRESET_COVER = /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/profile-covers\/presets\/v1\/(profile_hero_[1-9]\.webp)$/;
export function presetCoverFile(url, root = process.cwd()) {
  const match = typeof url === "string" ? PRESET_COVER.exec(url) : null;
  return match ? join(root, "assets", "og", "profile-covers", "v1", match[1]) : null;
}

async function loadImage(url, fetchImpl) {
  const file = presetCoverFile(url);
  if (file) return await readFile(file).catch(() => null);
  return await fetchImage(url, fetchImpl);
}

// Fetches every distinct URL once, then derives the drawn sizes.
export async function loadCardImages(large, fetchImpl) {
  const urls = new Set();
  if (large.layout === "game" && large.cover_url) urls.add(large.cover_url);
  if (large.layout === "moment") {
    if (large.photo_url) urls.add(large.photo_url);
    if (large.cover_url) urls.add(large.cover_url);
  }
  // r11: 描く 8 つ (その記録の物 → 同じプレイの物) だけを読む。r9: ネタバレの記録は同じプレイの写真も読まない (描かない)
  if (isR3(large)) for (const { item } of cardItems(large)) urls.add(item.url);
  else for (const item of large.media ?? []) urls.add(item.url);
  if ((large.layout === "moment" || large.layout === "game") && large.author_avatar_url) urls.add(large.author_avatar_url);
  if (large.layout === "profile") {
    if (large.avatar_url) urls.add(large.avatar_url);
    if (large.background_url) urls.add(large.background_url);
  }
  if (large.layout === "diagnosis") {
    if (large.avatar_url) urls.add(large.avatar_url);
    if (large.illustration_url) urls.add(large.illustration_url);
  }
  if (large.layout === "grid") {
    for (const url of large.cover_urls) urls.add(url);
    if (large.owner_avatar_url) urls.add(large.owner_avatar_url);
  }
  const raw = new Map(await Promise.all(
    [...urls].map(async (url) => [url, await loadImage(url, fetchImpl)]),
  ));
  const get = (url) => (url ? raw.get(url) ?? null : null);

  if (isR3(large)) {
    // r10: 投稿者の写真・動画を切らずに並べ (card-layout.mjs)、無ければ同じプレイの写真・動画を同じ決まりで、それも無ければ
    // カバーを大きく。r11: その記録の物のあとを同じプレイの物で 8 つまで埋める (cardItems)。
    // 投稿者のアイコンとカバーの小さな絵は上の帯。背景は 1 枚目をぼかして暗くした物 (無い時はカバー)。
    const spoiler = large.spoiler === true;
    const media = spoiler ? [] : large.media ?? [];
    const coverBuffer = get(large.cover_url);
    const [author, thumb, background, hero, laid] = await Promise.all([
      pngUri(get(large.author_avatar_url), HEAD_AVATAR * 2, HEAD_AVATAR * 2),
      coverUri(coverBuffer, THUMB[0] * 2, THUMB[1] * 2),
      blurUri(coverBuffer ?? get(large.photo_url)),
      media.length === 0 && !spoiler ? coverUri(coverBuffer, ...HERO_COVER) : null,
      layoutTiles(cardItems(large), get),
    ]);
    return {
      author, thumb, background, hero,
      tiles: laid?.tiles ?? [], group: laid?.group ?? null, tilesBackground: laid?.backdrop ?? null,
    };
  }
  if (large.layout === "game") {
    const buffer = get(large.cover_url);
    const [cover, background] = await Promise.all([coverUri(buffer, ...COVER.game), blurUri(buffer)]);
    return { cover, background };
  }
  if (large.layout === "moment") {
    const photoBuffer = get(large.photo_url);
    const coverBuffer = get(large.cover_url);
    const [photo, cover, background] = await Promise.all([
      fittedUri(photoBuffer, ...PHOTO_BOX),
      coverUri(coverBuffer, ...COVER.moment),
      blurUri(photoBuffer ?? coverBuffer),
    ]);
    // A photo that cannot be loaded falls back to the cover.
    return { photo, cover, background };
  }
  if (large.layout === "profile") {
    const [avatar, background] = await Promise.all([
      pngUri(get(large.avatar_url), AVATAR, AVATAR),
      // A background that cannot be loaded falls back to the blurred avatar.
      blurUri(get(large.background_url) ?? get(large.avatar_url)),
    ]);
    return { avatar, background };
  }
  if (large.layout === "diagnosis") {
    const illustration = get(large.illustration_url);
    const [art, owner, background] = await Promise.all([
      pngUri(illustration, ILLUSTRATION, ILLUSTRATION),
      pngUri(get(large.avatar_url), OWNER_AVATAR, OWNER_AVATAR),
      blurUri(illustration ?? get(large.avatar_url)),
    ]);
    return { illustration: art, owner, background };
  }
  const buffers = large.cover_urls.map(get);
  const coverSize = large.description ? COVER.gridCompact : COVER.grid;
  const [background, owner, ...covers] = await Promise.all([
    blurUri(buffers.find(Boolean) ?? null),
    pngUri(get(large.owner_avatar_url), OWNER_AVATAR, OWNER_AVATAR),
    ...buffers.map((buffer) => coverUri(buffer, ...coverSize)),
  ]);
  return { background, owner, covers };
}

// imageAspect = 幅 ÷ 高さ (EXIF の向きを当てた後)。読めない時は null
async function imageAspect(buffer) {
  if (!buffer) return null;
  try {
    const meta = await pipeline(buffer).metadata();
    const swap = (meta.orientation ?? 1) >= 5;
    const width = swap ? meta.height : meta.width;
    const height = swap ? meta.width : meta.height;
    return width > 0 && height > 0 ? width / height : null;
  } catch {
    return null;
  }
}
// r10: 写真・動画 (動画は代表の絵) を、読めた物の縦横で card-layout.mjs に並べてもらい、各枠の大きさにちょうど縮める
// (縦横が同じなので切れない)。読めない物は外す。並べ方が外した物 (短い辺が足りない) は描かない。
// 背景は 1 枚目をぼかした物。返り値の tiles は表示する順 (外した物を除く。own = その記録の物か)、group はまとまりの外枠
// r11: entries = cardItems の { item, own } (8 つまで)。読めた 1 枚目がその記録の物で、同じプレイの物も並ぶ時は heroFirst
// (その記録の 1 枚目がいちばん大きい)。その記録の物だけ・同じプレイの物だけの時は r10 と同じ並べ方
async function layoutTiles(entries, get) {
  if (entries.length === 0) return null;
  const read = await Promise.all(entries.map(async ({ item, own }) => {
    const buffer = get(item.url);
    return { item, own, buffer, aspect: await imageAspect(buffer) };
  }));
  const usable = read.filter((entry) => entry.aspect !== null).slice(0, CARD_TILES_MAX);
  if (usable.length === 0) return null;
  const heroFirst = usable[0].own && usable.some((entry) => !entry.own);
  const layout = layoutCard(usable.map((entry) => entry.aspect), { heroFirst });
  const shown = usable.map((entry, i) => ({ ...entry, slot: layout.slots[i] })).filter((entry) => entry.slot);
  if (shown.length === 0) return null;
  const [backdropUri, ...cut] = await Promise.all([
    blurUri(shown[0].buffer),
    ...shown.map((entry) => coverUri(entry.buffer, Math.max(1, Math.round(entry.slot.w)), Math.max(1, Math.round(entry.slot.h)))),
  ]);
  // 縮めるのに失敗した枠は空の枠 (並べ方は変えない)。1 つも描けなければ写真なしの形へ
  const tiles = shown.map((entry, i) => ({ item: entry.item, own: entry.own, slot: entry.slot, image: cut[i] }));
  return tiles.some((tile) => tile.image) ? { tiles, group: layout.group, backdrop: backdropUri, heroFirst } : null;
}

// ---------------------------------------------------------------- layouts

const div = (style, ...children) => h("div", { style: { display: "flex", ...style } }, ...children);
const img = (src, style) => h("img", { src, style });
const FULL = { position: "absolute", left: 0, top: 0, width: W, height: H };
const DARK_GRADIENT = "linear-gradient(135deg, #1B2B45 0%, #0B1524 60%, #070D18 100%)";
const ELLIPSIS = { overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" };
const n = (value) => value.toLocaleString("en-US");

function placeholder(width, height, radius) {
  return div({ width, height, borderRadius: radius, backgroundColor: "rgba(148,163,184,0.28)",
    border: "2px solid rgba(255,255,255,0.18)" });
}

function frame(assets, background, ...children) {
  return div(
    { width: W, height: H, position: "relative", backgroundColor: "#0B1524", fontFamily: "Noto Sans JP" },
    background
      ? img(background, FULL)
      : div({ ...FULL, backgroundImage: DARK_GRADIENT }),
    div({ ...FULL, backgroundImage: "linear-gradient(90deg, rgba(8,14,26,0.55) 0%, rgba(8,14,26,0.35) 100%)" }),
    ...children,
    img(assets.logo, { position: "absolute", right: 36, bottom: 30, width: LOGO_W, height: assets.logoHeight }),
  );
}

function companies(publisher, developer) {
  const rows = publisher && developer && publisher === developer
    ? [["販売・開発", publisher]]
    : [["販売", publisher], ["開発", developer]].filter(([, v]) => v);
  if (rows.length === 0) return null;
  return div(
    { flexDirection: "column", marginTop: 30 },
    ...rows.map(([label, value]) =>
      div(
        { alignItems: "center", marginTop: 10 },
        div({ fontSize: 24, color: "#BFD0E0", fontWeight: 700, border: "2px solid rgba(255,255,255,0.35)",
          borderRadius: 8, padding: "2px 10px", marginRight: 14, flexShrink: 0 }, label),
        div({ fontSize: 30, color: "#F1F5F9", fontWeight: 700, maxWidth: 560, ...ELLIPSIS }, value),
      )
    ),
  );
}

function scoreBadge(score) {
  const value = Number.isInteger(score) ? String(score) : score.toFixed(1);
  return div(
    { alignItems: "flex-end", marginTop: 26 },
    div({ fontSize: 28, color: "#FDE68A", fontWeight: 900, marginBottom: 6 }, "満足度"),
    div({ fontSize: 64, color: "#FFFFFF", fontWeight: 900, lineHeight: 1, marginLeft: 12 }, value),
    div({ fontSize: 30, color: "#E2E8F0", fontWeight: 700, marginLeft: 6, marginBottom: 4 }, "/10"),
  );
}

function gameCard(large, images, assets) {
  const [cw, ch] = COVER.game;
  // A log card with a satisfaction or review text draws those instead of the credits.
  const record = large.score !== undefined || large.excerpt !== undefined;
  return frame(
    assets,
    images.background,
    div(
      { ...FULL, alignItems: "center", padding: "0 80px 0 72px" },
      images.cover
        ? img(images.cover, { width: cw, height: ch, borderRadius: 16, boxShadow: "0 16px 48px rgba(0,0,0,0.55)" })
        : placeholder(cw, ch, 16),
      div(
        { flexDirection: "column", marginLeft: 56, flex: 1, minWidth: 0 },
        large.heading
          ? div({ fontSize: 30, color: "#E2E8F0", fontWeight: 700, marginBottom: 14, maxWidth: 640, ...ELLIPSIS }, large.heading)
          : null,
        record
          ? div({ fontSize: large.title.length > 16 ? 44 : 54, lineHeight: 1.25, color: "#FFFFFF", fontWeight: 900,
            lineClamp: 2, overflow: "hidden" }, large.title)
          : div({ fontSize: large.title.length > 16 ? 56 : 68, lineHeight: 1.25, color: "#FFFFFF", fontWeight: 900,
            lineClamp: 3, overflow: "hidden" }, large.title),
        record && large.score !== undefined ? scoreBadge(large.score) : null,
        record && large.excerpt !== undefined
          ? div({ display: "block", fontSize: 28, lineHeight: 1.5, color: "#F1F5F9", fontWeight: 700, marginTop: 22,
            maxWidth: 640, overflow: "hidden", lineClamp: 3 }, large.excerpt)
          : null,
        record ? null : companies(large.publisher, large.developer),
      ),
    ),
  );
}

// Same order and dark-theme colors as UserActivityRankingRow.tsx in the app.
const STATUS = [
  ["playing", "プレイ中", "#1D4ED8", "#DBEAFE"],
  ["completed", "クリア", "#166534", "#DCFCE7"],
  ["streaming_completed", "実況視聴済", "#6D28D9", "#EDE9FE"],
  ["dropped", "断念", "#B91C1C", "#FEE2E2"],
  ["want_to_play", "積みゲー", "#C2410C", "#FFEDD5"],
];

function profileCard(large, images, assets) {
  const stats = large.stats;
  const avatar = images.avatar
    ? img(images.avatar, { width: AVATAR, height: AVATAR, borderRadius: 24, border: "4px solid rgba(255,255,255,0.9)",
      boxShadow: "0 12px 36px rgba(0,0,0,0.45)" })
    : div({ width: AVATAR, height: AVATAR, borderRadius: 24, backgroundColor: "#334155",
      border: "4px solid rgba(255,255,255,0.9)" });
  const label = `${large.name}さんのプロフィール`;
  // Japanese glyphs are about 1em wide: size the label to the 832px column
  // (1200 - 2x64 padding - avatar - gap) so most names fit untruncated.
  const nameSize = Math.max(36, Math.min(66, Math.floor(820 / label.length)));
  const name = div({ fontSize: nameSize, color: "#FFFFFF", fontWeight: 900, maxWidth: 832, ...ELLIPSIS }, label);
  if (!stats) {
    return frame(
      assets,
      images.background,
      div({ ...FULL, alignItems: "center", padding: "0 64px" }, avatar,
        div({ flexDirection: "column", marginLeft: 40, minWidth: 0 }, name)),
    );
  }
  return frame(
    assets,
    images.background,
    div(
      { position: "absolute", left: 64, top: 84, right: 64, alignItems: "center" },
      avatar,
      div(
        { flexDirection: "column", marginLeft: 40, minWidth: 0 },
        name,
        div(
          { alignItems: "flex-end", marginTop: 8 },
          div({ fontSize: 30, color: "#E2E8F0", fontWeight: 700, marginBottom: 8 }, "総ログ数"),
          div({ fontSize: 72, color: "#FFFFFF", fontWeight: 900, lineHeight: 1, marginLeft: 16 }, n(stats.total)),
          div({ fontSize: 34, color: "#FFFFFF", fontWeight: 900, marginLeft: 6, marginBottom: 6 }, "本"),
        ),
      ),
    ),
    div(
      { position: "absolute", left: 64, right: 64, top: 392 },
      ...STATUS.map(([key, label, fg, bg], i) =>
        div(
          { flex: 1, alignItems: "center", justifyContent: "center", marginLeft: i === 0 ? 0 : 14,
            height: 104, backgroundColor: bg, borderRadius: 20 },
          div({ fontSize: 26, color: fg, fontWeight: 700 }, label),
          div({ fontSize: stats[key] >= 10_000 ? 34 : 44, color: fg, fontWeight: 900, marginLeft: 8 }, n(stats[key])),
        )
      ),
    ),
  );
}

function gridCard(large, images, assets) {
  const [cw, ch] = large.description ? COVER.gridCompact : COVER.grid;
  const covers = images.covers;
  const remaining = covers.length > 0 ? large.total_count - covers.length : 0;
  // Owner line: icon + "○○さんのランキング/カタログ".
  const owner = large.subtitle
    ? div(
      { alignItems: "center", marginTop: 10 },
      images.owner
        ? img(images.owner, { width: OWNER_AVATAR, height: OWNER_AVATAR, borderRadius: 10,
          border: "2px solid rgba(255,255,255,0.85)" })
        : null,
      div({ fontSize: 26, color: "#E2E8F0", fontWeight: 700, marginLeft: images.owner ? 12 : 0, ...ELLIPSIS },
        large.subtitle),
    )
    : null;
  const heading = div(
    { flexDirection: "column", maxWidth: W - 128 },
    div({ fontSize: large.title.length > 18 ? 48 : 56, color: "#FFFFFF", fontWeight: 900, lineHeight: 1.2,
      ...ELLIPSIS }, large.title),
    large.description
      ? div({ fontSize: 24, color: "#F1F5F9", fontWeight: 700, lineHeight: 1.4, marginTop: 6,
        maxHeight: 68, overflow: "hidden", lineClamp: 2 }, large.description)
      : null,
    owner,
  );
  if (covers.length === 0) {
    return frame(assets, images.background,
      div({ ...FULL, alignItems: "center", padding: "0 64px" }, heading));
  }
  const items = covers.map((cover, i) =>
    div(
      { position: "relative", marginLeft: i === 0 ? 0 : 32, width: cw, height: ch },
      cover
        ? img(cover, { width: cw, height: ch, borderRadius: 14, boxShadow: "0 14px 40px rgba(0,0,0,0.55)" })
        : placeholder(cw, ch, 14),
      large.ranked
        ? img(assets.badges[i], { position: "absolute", left: -14, top: -20, width: BADGE[0], height: BADGE[1] })
        : null,
    )
  );
  if (remaining > 0) {
    const label = `+${n(remaining)}`;
    items.push(div(
      { marginLeft: 32, width: cw, height: ch, borderRadius: 14, backgroundColor: "rgba(8,14,26,0.62)",
        border: "2px solid rgba(255,255,255,0.22)", flexDirection: "column", alignItems: "center",
        justifyContent: "center" },
      div({ fontSize: label.length > 5 ? 56 : 80, color: "#FFFFFF", fontWeight: 900, lineHeight: 1 }, label),
      div({ fontSize: 30, color: "#E2E8F0", fontWeight: 700, marginTop: 14 }, "作品"),
    ));
  }
  return frame(
    assets,
    images.background,
    div({ position: "absolute", left: 64, right: 64, top: 44 }, heading),
    div({ position: "absolute", left: 0, right: 0, top: large.description ? 268 : 210, justifyContent: "center" },
      ...items),
  );
}

const AXIS_BAR = 360;
const AXIS_DOT = 26;

function typeNameSize(name) {
  const length = name.length;
  if (length <= 9) return 64;
  if (length <= 11) return 56;
  return 48;
}

function diagnosisCard(large, images, assets) {
  const accent = large.color ?? DIAGNOSIS_ACCENT;
  const art = images.illustration
    ? img(images.illustration, { width: ILLUSTRATION, height: ILLUSTRATION, borderRadius: 24,
      border: "4px solid rgba(255,255,255,0.92)", boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
      backgroundColor: "#FFFFFF" })
    : placeholder(ILLUSTRATION, ILLUSTRATION, 24);
  const owner = div(
    { alignItems: "center" },
    images.owner
      ? img(images.owner, { width: OWNER_AVATAR, height: OWNER_AVATAR, borderRadius: 10,
        border: "2px solid rgba(255,255,255,0.85)", flexShrink: 0 })
      : null,
    div({ fontSize: 26, color: "#E2E8F0", fontWeight: 700, marginLeft: images.owner ? 12 : 0, ...ELLIPSIS },
      `${large.name}さんのゲーマーDNA`),
  );
  const typeName = div({ fontSize: typeNameSize(large.type_name), color: accent, fontWeight: 900, lineHeight: 1.2,
    marginTop: 12, lineClamp: 2, overflow: "hidden" }, large.type_name);
  const title = large.title
    ? div({ marginTop: 10 },
      div({ fontSize: 26, color: "#FFFFFF", fontWeight: 700, padding: "4px 18px", borderRadius: 999,
        backgroundColor: "rgba(8,14,26,0.55)", border: `2px solid ${accent}`, maxWidth: 680, ...ELLIPSIS },
      `─ ${large.title} ─`))
    : null;
  const axisLabel = (value, align) => div({ width: 96, fontSize: 24, color: "#F1F5F9", fontWeight: 700,
    justifyContent: align, ...ELLIPSIS }, value);
  const axes = div(
    { flexDirection: "column", marginTop: 22 },
    ...large.axes.map((axis, i) =>
      div(
        { alignItems: "center", marginTop: i === 0 ? 0 : 14 },
        axisLabel(axis.left, "flex-end"),
        div(
          { position: "relative", width: AXIS_BAR, height: AXIS_DOT, marginLeft: 18, marginRight: 18,
            alignItems: "center" },
          div({ width: AXIS_BAR, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.32)" }),
          div({ position: "absolute", left: Math.round(((AXIS_BAR - AXIS_DOT) * axis.position) / 100), top: 0,
            width: AXIS_DOT, height: AXIS_DOT, borderRadius: AXIS_DOT / 2, backgroundColor: accent,
            border: "3px solid #FFFFFF", boxShadow: "0 2px 8px rgba(0,0,0,0.45)" }),
        ),
        axisLabel(axis.right, "flex-start"),
      )
    ),
  );
  return frame(
    assets,
    images.background,
    div(
      { ...FULL, alignItems: "center", padding: "0 64px 40px 72px" },
      art,
      div({ flexDirection: "column", marginLeft: 52, flex: 1, minWidth: 0 }, owner, typeName, title, axes),
    ),
  );
}

function excerptSize(text) {
  const length = [...text].length;
  if (length <= 36) return 38;
  if (length <= 72) return 32;
  return 28;
}

// TASK-20261017-002: the photo large on the left, then who / what they wrote /
// which game. No photo (none, video only, spoiler, load failure) = the cover.
function momentCard(large, images, assets) {
  const photo = images.photo;
  const [cw, ch] = COVER.moment;
  const media = photo
    ? img(photo.uri, { width: photo.width, height: photo.height, borderRadius: 18,
      boxShadow: "0 16px 48px rgba(0,0,0,0.55)" })
    : images.cover
    ? img(images.cover, { width: cw, height: ch, borderRadius: 16, boxShadow: "0 16px 48px rgba(0,0,0,0.55)" })
    : placeholder(cw, ch, 16);
  const mediaWidth = photo ? photo.width : cw;
  const columnWidth = W - 56 - mediaWidth - 48 - 56;
  const body = large.spoiler
    ? div({ marginTop: 20 },
      div({ fontSize: 30, color: "#FFFFFF", fontWeight: 900, padding: "8px 22px", borderRadius: 999,
        backgroundColor: "rgba(8,14,26,0.6)", border: "2px solid #FBBF24" }, MOMENT_SPOILER))
    : large.excerpt
    ? div({ display: "block", fontSize: excerptSize(large.excerpt), lineHeight: 1.45, color: "#FFFFFF", fontWeight: 900,
      marginTop: 16, overflow: "hidden", lineClamp: 6 }, large.excerpt)
    : null;
  return frame(
    assets,
    images.background,
    div(
      { ...FULL, alignItems: "center", padding: "0 56px 0 56px" },
      media,
      div(
        { flexDirection: "column", marginLeft: 48, width: columnWidth, minWidth: 0, paddingBottom: 40 },
        div({ fontSize: 26, color: "#E2E8F0", fontWeight: 700, maxWidth: columnWidth, ...ELLIPSIS }, large.heading),
        body,
        div({ display: "block", fontSize: body ? 26 : 44, color: body ? "#BFD0E0" : "#FFFFFF", fontWeight: body ? 700 : 900,
          lineHeight: 1.35, marginTop: 22, maxWidth: columnWidth, overflow: "hidden", lineClamp: 2 },
        `『${large.title}』`),
      ),
    ),
  );
}

const PLAY_ICON = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">' +
  '<circle cx="48" cy="48" r="45" fill="#08101C" fill-opacity="0.62" stroke="#FFFFFF" stroke-width="4"/>' +
  '<path d="M39 29 L71 48 L39 67 Z" fill="#FFFFFF"/></svg>',
).toString("base64")}`;

// ---------------------------------------------------------------- r9 layouts (TASK-20261017-002 r9)
// 写真・動画が主役 (Emiya 10/21「リンクカードは写真を主役にしていいのでは？」)。r10: 投稿者の写真・動画は切らずに並べ
// (並べ方は card-layout.mjs。Emiya 10/21「パターンの洗い出しもせずにとりあえずで作ってない？」)、
// 上の細い帯の左に投稿者の小さなアイコンと名前、右にゲーム (小さなカバー・題名、レビューは満足度) を置く。PlayNavi の印は描かない。
// 枚数も書かない。右下に重ねた札「写真・動画をすべて見る ›」で先へ誘う (X はカードの左下に住所を重ねるので、札は右下)。
// 自分の写真・動画が無い記録は、同じプレイの写真・動画を切らずに並べ (札は「このプレイの写真・動画を見る ›」)、それも無ければ
// ゲームのカバーを大きく真ん中に。ネタバレはぼかしたカバーに「ネタバレを含みます」だけ (写真は読まない・描かない)。

// The poster's name: the new author_name, else the old heading "<name>さんのモーメント / プレイ記録".
export function authorName(large) {
  if (typeof large.author_name === "string" && large.author_name.trim()) return large.author_name.trim();
  const match = /^(.+?)さんの(?:モーメント|プレイ記録)$/.exec(large.heading ?? "");
  return match ? match[1] : "ユーザー";
}

const scoreValue = (score) => (Number.isInteger(score) ? String(score) : score.toFixed(1));
const reviewScore = (large) => (large.layout === "game" && typeof large.score === "number" ? large.score : null);
const TEXT_SHADOW = "0 1px 4px rgba(0,0,0,0.6)";
// 字幅の見積もり (和文 1em・欧文と数字 0.6em)
const ems = (value) => [...String(value)].reduce((w, ch) => w + (ch.charCodeAt(0) < 0x2e80 ? 0.6 : 1), 0);

// どの形で描くか: own = その記録の写真・動画を描く (r11: 同じプレイの物で埋めていても) / play = 同じプレイの写真・動画だけ /
// plain = カバー / spoiler = ネタバレ
export function recordMode(large, images = {}) {
  if (large.spoiler === true) return "spoiler";
  const tiles = (images.tiles ?? []).filter((tile) => tile?.image);
  if (tiles.some((tile) => tile.own)) return "own";
  if (tiles.length > 0) return "play";
  return "plain";
}

// 右下の遷移文言 (枚数は書かない)。「画像」は PlayNavi が作る絵と紛れるので使わず「写真・動画」と言う
export function ctaText(large, mode) {
  if (mode === "own" || mode === "play" || mode === "spoiler") return `${CTA_LABELS[mode]} ›`;
  return `${large.layout === "moment" ? CTA_LABELS.moment : CTA_LABELS.review} ›`;
}

const SCORE_LABEL = 16;
const SCORE_VALUE = 24;
const scoreChipWidth = (score) =>
  Math.ceil(ems("満足度") * SCORE_LABEL + 8 + ems(scoreValue(score)) * SCORE_VALUE + 3 + ems("/10") * SCORE_LABEL + 30);

// 上の帯の幅の割り振り: 名前とゲーム名が両方入れば両方そのまま。入らない時は名前に 4 割まで、残りをゲーム名へ
// (どちらも … で切る)。左右の塊は重ならない。
export function headerWidths(name, title, { thumb = false, score = null, width = HEADER.w } = {}) {
  // + 10 = 右の余白 (paddingRight 6) と見積もりの誤差
  const nameNeed = Math.ceil(ems(name) * HEAD_NAME) + 10;
  const titleNeed = Math.min(Math.ceil(ems(title) * HEAD_TITLE) + 10, HEAD_TITLE_MAX);
  const rightFixed = (thumb ? THUMB[0] + 12 : 0) + (score === null ? 0 : scoreChipWidth(score) + 14);
  const room = width - HEADER.gap - (HEAD_AVATAR + 12) - rightFixed;
  if (nameNeed + titleNeed <= room) return { name: nameNeed, title: titleNeed, room };
  const nameW = Math.min(nameNeed, Math.max(Math.round(room * 0.4), room - titleNeed));
  return { name: nameW, title: room - nameW, room };
}

function avatarCircle(uri, name, size, ring) {
  const style = { width: size, height: size, borderRadius: size / 2, flexShrink: 0,
    border: `${ring}px solid rgba(255,255,255,0.9)`, boxShadow: "0 2px 10px rgba(0,0,0,0.4)" };
  if (uri) return img(uri, style);
  return div({ ...style, alignItems: "center", justifyContent: "center", backgroundColor: "#0D7C90",
    fontSize: Math.round(size * 0.44), color: "#FFFFFF", fontWeight: 700 }, [...name][0] ?? "?");
}

function scoreChip(score) {
  return div(
    { height: 40, alignItems: "center", padding: "0 15px", borderRadius: 20, flexShrink: 0,
      backgroundColor: "rgba(8,12,20,0.5)", border: "1px solid rgba(255,255,255,0.3)" },
    div({ fontSize: SCORE_LABEL, color: "rgba(255,255,255,0.8)", fontWeight: 700, marginTop: 3 }, "満足度"),
    div({ fontSize: SCORE_VALUE, color: "#FFFFFF", fontWeight: 900, lineHeight: 1, marginLeft: 8 }, scoreValue(score)),
    div({ fontSize: SCORE_LABEL, color: "rgba(255,255,255,0.7)", fontWeight: 700, marginLeft: 3, marginTop: 5 }, "/10"),
  );
}

// 上の帯: 左に投稿者 (小さなアイコン + 名前)、右にゲーム ([満足度] + 小さなカバー + 題名)。写真の上には上からの薄い影。
// r10: top = 帯の上端 (既定は r9 の位置)、shade = 上からの薄い影 (写真の上の空きに置く時は描かない)、inset = 左右の端からの距離
function header(large, images, { thumb, top = null, shade = true, inset = HEADER.x }) {
  const name = authorName(large);
  const title = titleText(large.title);
  const score = reviewScore(large);
  const showThumb = thumb && Boolean(images.thumb);
  const widths = headerWidths(name, title, { thumb: showThumb, score, width: W - 2 * inset });
  // paddingRight: 末尾の … が切り取られて「‥」に見えないよう、はみ出し分の余白
  const text = { fontWeight: 700, color: "#FFFFFF", lineHeight: 1.25, textShadow: TEXT_SHADOW, paddingRight: 6, ...ELLIPSIS };
  const y = top ?? HEADER.top;
  return [
    shade
      ? div({ position: "absolute", left: 0, top: 0, width: W, height: HEADER.shade, backgroundImage:
        "linear-gradient(180deg, rgba(4,8,16,0.64) 0%, rgba(4,8,16,0.34) 45%, rgba(4,8,16,0) 100%)" })
      : null,
    div(
      { position: "absolute", left: inset, top: y, height: HEADER.h, alignItems: "center" },
      avatarCircle(images.author, name, HEAD_AVATAR, 2),
      div({ ...text, marginLeft: 12, fontSize: HEAD_NAME, maxWidth: widths.name }, name),
    ),
    div(
      { position: "absolute", right: inset, top: y, height: HEADER.h, alignItems: "center" },
      score === null ? null : scoreChip(score),
      showThumb
        ? img(images.thumb, { width: THUMB[0], height: THUMB[1], borderRadius: 6, flexShrink: 0, marginLeft: score === null ? 0 : 14,
          border: "1px solid rgba(255,255,255,0.4)", boxShadow: "0 3px 10px rgba(0,0,0,0.4)" })
        : null,
      div({ ...text, marginLeft: showThumb ? 12 : score === null ? 0 : 14, fontSize: HEAD_TITLE,
        color: "rgba(255,255,255,0.95)", maxWidth: widths.title }, title),
    ),
  ];
}

const CHEVRON = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="44" viewBox="0 0 26 44">' +
  '<path d="M6 6 L20 22 L6 38" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
).toString("base64")}`;

// 右下の札 (すりガラス風: 暗い半透明 + 細い白の縁)。r10: 写真の下の空きに置く時は bottom を渡す。空きが狭い時は一回り小さく
const CTA = { right: 28, bottom: 28, h: 62, compactH: 52 };
function ctaPill(label, { bottom = CTA.bottom, right = CTA.right, compact = false } = {}) {
  const height = compact ? CTA.compactH : CTA.h;
  return div(
    { position: "absolute", right, bottom, height, alignItems: "center", padding: compact ? "0 22px 0 26px" : "0 26px 0 30px",
      borderRadius: height / 2, backgroundColor: "rgba(10,14,22,0.58)", border: "2px solid rgba(255,255,255,0.62)",
      boxShadow: "0 8px 28px rgba(0,0,0,0.4)" },
    div({ fontSize: compact ? 24 : 27, fontWeight: 700, color: "#FFFFFF", lineHeight: 1.2 }, label),
    img(CHEVRON, { width: compact ? 12 : 13, height: compact ? 20 : 22, marginLeft: compact ? 12 : 14 }),
  );
}

const bottomShade = () => div({ position: "absolute", left: 0, top: H - 190, width: W, height: 190, backgroundImage:
  "linear-gradient(0deg, rgba(4,8,16,0.5) 0%, rgba(4,8,16,0.18) 55%, rgba(4,8,16,0) 100%)" });

function durationChip(text, position) {
  return div({ position: "absolute", ...position, height: 36, alignItems: "center", padding: "0 14px", borderRadius: 18,
    fontSize: 22, fontWeight: 700, color: "#FFFFFF", backgroundColor: "rgba(8,12,20,0.66)" }, text);
}

const shell = (...children) => div(
  { width: W, height: H, position: "relative", overflow: "hidden", backgroundColor: "#0B1524", fontFamily: "Noto Sans JP" },
  ...children.flat(),
);
const backdrop = (uri, dim) => [
  uri ? img(uri, FULL) : div({ ...FULL, backgroundImage: DARK_GRADIENT }),
  div({ ...FULL, backgroundColor: `rgba(4,8,16,${dim})` }),
];

// r10: 上の帯と右下の札をどこに置くか。まとまりは上下の真ん中にあるので、上と下の空きは同じ高さ。
// 空きが ROOM_MIN 以上なら、帯と札をその空きに (X に切られうる上下 15px の内側で、空きの真ん中寄り)。足りなければ写真の上に重ねる
// 重ねる時、まとまりの左右の空きが狭い (SIDE_INSET_BELOW 未満) と、帯の端のアイコンや札が写真の縁をまたいで落ち着かないので、
// 帯と札をまとまりの内側へ寄せる (inset / ctaRight)。左右が広く空いている時 (縦長 1 枚など) はカードの端のまま
const SIDE_INSET_BELOW = 140;
export function chromePlacement(group) {
  const room = group ? group.y : 0;
  if (room < ROOM_MIN) {
    const side = group ? group.x : 0;
    const narrow = side < SIDE_INSET_BELOW;
    // overlayTop: 帯のアイコンが写真の上端から少し下がる所 (左右の inset と釣り合う)
    return { room, headerTop: null, ctaBottom: null, compact: false, overlayTop: Math.max(HEADER.top, Math.round((group?.y ?? 0) + 8)),
      inset: narrow ? Math.max(HEADER.x, Math.round(side + 18)) : HEADER.x,
      ctaRight: narrow ? Math.max(CTA.right, Math.round(side + 16)) : CTA.right };
  }
  const compact = room < CTA.h + 2 * 16;
  const ctaH = compact ? CTA.compactH : CTA.h;
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  return {
    room,
    // 帯の中身 (いちばん背の高い小さなカバー) が X_SAFE.top より下に来るように
    headerTop: clamp(Math.round((room - HEADER.h) / 2), X_SAFE.top - (HEADER.h - THUMB[1]) / 2, HEADER.top),
    ctaBottom: clamp(Math.round((room - ctaH) / 2), H - X_SAFE.bottom, CTA.bottom),
    compact, inset: HEADER.x, ctaRight: CTA.right,
  };
}

// r10: 札を写真に重ねる時の置き場所。まとまりの下の縁に接する枠のうち、札が丸ごと収まる (左右上下に 16px の余白) いちばん右の枠の
// 右下に置く (小さな枠を札で隠さない・枠の縁をまたがない)。札の左端は X の住所の札 (左下) と重ならない所まで。
// 収まる枠が無ければ null (カードの右下の角に置く)
const CTA_SAFE_LEFT = 260;
export function ctaWidth(label, compact = false) {
  // 字 + 左右の余白 + › + 縁
  return Math.ceil(ems(label) * (compact ? 24 : 27)) + (compact ? 48 + 24 : 56 + 27) + 4;
}
export function ctaOverTile(tiles, group, label) {
  if (!group) return null;
  const width = ctaWidth(label);
  const bottomEdge = group.y + group.h;
  const fits = tiles.map((tile) => tile.slot).filter((slot) => Math.abs(slot.y + slot.h - bottomEdge) < 1 &&
    slot.w >= width + 32 && slot.h >= CTA.h + 32 && slot.x + slot.w - 16 - width >= CTA_SAFE_LEFT);
  if (fits.length === 0) return null;
  const slot = fits.reduce((a, b) => (b.x > a.x ? b : a));
  return { right: Math.round(W - (slot.x + slot.w) + 16), bottom: Math.round(H - bottomEdge + 16) };
}

// 写真・動画 1 つ分の枠 (切らずに、枠の大きさ = 写真の大きさ)。角を丸めて薄い影。動画は真ん中に ▶、右上に長さ
// (上の帯を写真に重ねる時は、帯より下へずらす)
function mediaTile({ item, image, slot }, { headerOverlay }) {
  const size = Math.round(Math.min(112, Math.min(slot.w, slot.h) * 0.3));
  const duration = item.kind === "video" ? formatDuration(item.duration_ms) : null;
  // 帯の下 (帯の上端 + 高さ + 余白) まで下げる
  const chipTop = headerOverlay && slot.y < HEADER_CLEAR + 10 ? Math.round(HEADER_CLEAR + 10 - slot.y) : 14;
  return div(
    { position: "absolute", left: slot.x, top: slot.y, width: slot.w, height: slot.h, borderRadius: TILE_RADIUS,
      backgroundColor: "rgba(30,41,59,0.85)", boxShadow: "0 10px 30px rgba(0,0,0,0.42)", alignItems: "center", justifyContent: "center" },
    image ? img(image, { position: "absolute", left: 0, top: 0, width: slot.w, height: slot.h, borderRadius: TILE_RADIUS }) : null,
    item.kind === "video" ? img(PLAY_ICON, { width: size, height: size }) : null,
    duration ? durationChip(duration, { right: 14, top: chipTop }) : null,
  );
}

// 写真・動画を並べたカード (投稿者の物 = own、同じプレイの物 = play)。ぼかした 1 枚目の上に、切らずに並べる
function tilesCard(large, images, { tiles, group, background, dim, label }) {
  const place = chromePlacement(group);
  const headerOverlay = place.headerTop === null;
  return shell(
    backdrop(background, dim),
    tiles.map((tile) => mediaTile(tile, { headerOverlay })),
    place.ctaBottom === null ? bottomShade() : null,
    header(large, images, { thumb: true, top: place.headerTop ?? place.overlayTop, shade: headerOverlay, inset: place.inset }),
    ctaPill(label, place.ctaBottom === null
      ? ctaOverTile(tiles, group, label) ?? { right: place.ctaRight }
      : { bottom: place.ctaBottom, compact: place.compact }),
  );
}

// 投稿者の写真・動画 (r11: 8 つに届かない分は同じプレイの写真・動画で埋め、その記録の 1 枚目がいちばん大きい)。
// 札は「写真・動画をすべて見る」
function photoCard(large, images) {
  return tilesCard(large, images, { tiles: images.tiles, group: images.group, background: images.tilesBackground ?? images.background,
    dim: 0.34, label: CTA_LABELS.own });
}

// r8〜r11: 自分の写真・動画が無い記録 (文だけのモーメント・写真の無いレビュー) で、同じプレイに写真・動画がある時。
// そのプレイの写真・動画を 8 つまで、投稿者の物と同じ決まりで切らずに並べる (札は「このプレイの写真・動画を見る」)。
// この投稿の物ではないので、背景は少し暗く
function playCard(large, images) {
  return tilesCard(large, images, { tiles: images.tiles, group: images.group, background: images.tilesBackground ?? images.background,
    dim: 0.46, label: CTA_LABELS.play });
}

// 描く写真・動画が何も無い: ぼかしたカバーの上に、ゲームのカバーを大きく真ん中に (感想の文は描かない)。
// カバーが主役なので、上の帯の小さなカバーは省く。
function plainCard(large, images) {
  const [cw, ch] = HERO_COVER;
  const top = HEADER_CLEAR - 8 + Math.round((H - (HEADER_CLEAR - 8) - 30 - ch) / 2);
  const hero = images.hero
    ? div({ position: "absolute", left: (W - cw) / 2, top, width: cw, height: ch, borderRadius: 18, overflow: "hidden",
      border: "1px solid rgba(255,255,255,0.22)", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" },
    img(images.hero, { width: cw, height: ch }))
    : div({ position: "absolute", left: 140, top: 150, width: W - 280, height: 300, alignItems: "center", justifyContent: "center" },
      div({ display: "block", fontSize: 52, lineHeight: 1.3, color: "#FFFFFF", fontWeight: 900, textAlign: "center",
        overflow: "hidden", lineClamp: 2, ...titleWordBreak(large.title, 52, W - 280) }, titleText(large.title)));
  return shell(
    backdrop(images.background, 0.42),
    hero,
    bottomShade(),
    header(large, images, { thumb: !images.hero }),
    ctaPill(ctaText(large, "plain").replace(/ ›$/, "")),
  );
}

// ネタバレ: 写真は描かない。ぼかしたカバーの真ん中に「ネタバレを含みます」だけ
function spoilerCard(large, images) {
  return shell(
    backdrop(images.background, 0.5),
    div({ ...FULL, alignItems: "center", justifyContent: "center" },
      div({ height: 76, alignItems: "center", padding: "0 42px", borderRadius: 38, border: "2px solid #FBBF24",
        backgroundColor: "rgba(8,12,20,0.6)", boxShadow: "0 10px 32px rgba(0,0,0,0.4)",
        fontSize: 34, fontWeight: 700, color: "#FFFFFF" }, SPOILER_LABEL)),
    bottomShade(),
    header(large, images, { thumb: true }),
    ctaPill(CTA_LABELS.spoiler),
  );
}

// 題名の折り返し (TASK-20261017-002 10/20): 日本語は既定だとどの字の間でも折れ、「そ / して伝説へ」のように語の途中で切れる。
// 空白で区切った塊がどれも 1 行に収まる時だけ、空白の所で折る (keep-all)。収まらない塊がある時は今まで通り
export function titleWordBreak(text, fontSize, width) {
  const parts = String(text).split(/\s+/).filter(Boolean);
  if (parts.length < 2) return {};
  const longest = Math.max(...parts.map((part) => ems(part)));
  return longest * fontSize <= width ? { wordBreak: "keep-all" } : {};
}

// 英数字の間のハイフン (HD-2D など) で折れないよう、折れないハイフン (U+2011) に置き換えて描く
export function titleText(text) {
  return String(text).replace(/([0-9A-Za-z])-(?=[0-9A-Za-z])/g, "$1‑");
}

function recordCard(large, images) {
  const mode = recordMode(large, images);
  if (mode === "spoiler") return spoilerCard(large, images);
  if (mode === "own") return photoCard(large, images);
  if (mode === "play") return playCard(large, images);
  return plainCard(large, images);
}

export function cardElement(large, images, assets) {
  if (isR3(large)) return recordCard(large, images, assets);
  if (large.layout === "moment") return momentCard(large, images, assets);
  if (large.layout === "diagnosis") return diagnosisCard(large, images, assets);
  if (large.layout === "game") return gameCard(large, images, assets);
  if (large.layout === "profile") return profileCard(large, images, assets);
  return gridCard(large, images, assets);
}

// Encodes the drawn PNG as JPEG at the highest quality that fits the limit.
export async function toJpeg(png, maxBytes = JPEG_MAX_BYTES) {
  let out = null;
  for (const quality of JPEG_QUALITIES) {
    out = await sharp(png).flatten({ background: "#0B1524" }).jpeg({ quality, mozjpeg: true }).toBuffer();
    if (out.length <= maxBytes) return out;
  }
  throw new Error(`card JPEG exceeds ${maxBytes} bytes`);
}

// r10: the record cards (moment / review) are always JPEG, also without photos (blurred cover). The PNG of the cover
// card reached ~950KB, close to Bluesky's 1,000,000-byte thumb limit (app.bsky.embed.external thumb maxSize).
export function servesJpeg(large) {
  return drawsUserPhotos(large) || isR3(large);
}

// Renders a raw `large` payload: { body, contentType }. Record cards and cards that draw the
// poster's photos are JPEG <= JPEG_MAX_BYTES; the rest stay PNG.
export async function renderCardImage(rawLarge, options = {}) {
  const large = validLarge(rawLarge);
  if (!large) throw new Error("invalid large card");
  const png = await renderCard(large, options);
  return servesJpeg(large)
    ? { body: await toJpeg(png), contentType: "image/jpeg" }
    : { body: png, contentType: "image/png" };
}

// Renders a validated `large` payload to a PNG buffer.
export async function renderCard(rawLarge, {
  fetchImpl = globalThis.fetch,
  fontLoader = (text, weight) => cachedFont(text, weight, fetchImpl),
  assetsLoader = loadStaticAssets,
} = {}) {
  const large = validLarge(rawLarge);
  if (!large) throw new Error("invalid large card");
  const text = cardText(large);
  const [assets, images, bold, black] = await Promise.all([
    assetsLoader(),
    loadCardImages(large, fetchImpl),
    fontLoader(text, 700),
    fontLoader(text, 900),
  ]);
  const response = new ImageResponse(cardElement(large, images, assets), {
    width: W,
    height: H,
    fonts: [
      { name: "Noto Sans JP", data: bold, weight: 700, style: "normal" },
      { name: "Noto Sans JP", data: black, weight: 900, style: "normal" },
    ],
  });
  return Buffer.from(await response.arrayBuffer());
}
