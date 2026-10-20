// Large share card (1200x630) layouts and asset loading for api/og.mjs.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "@vercel/og";
import { createElement as h } from "react";
import sharp from "sharp";
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
// X draws the post title over the bottom-left of the card, so the r3 layouts
// keep everything that matters above the bottom 90px and put the logo top-right.
export const SAFE_BOTTOM = 90;
// Cards that carry the poster's photos are JPEG (Bluesky thumb limit 1MB).
export const JPEG_MAX_BYTES = 900_000;
const JPEG_QUALITIES = [86, 78, 70, 60, 50, 40];
const CTA = "タップして見る";
const CTA_SPOILER_MOMENT = "ネタバレを含むモーメント";
const COLLAGE = { x: 40, y: 40, w: 640, h: 500, gap: 10 };
const REVIEW_COVER = [270, 360];
const REVIEW_PHOTOS = { w: 300, h: 360, gap: 10 };
const R3_PHOTO_BOX = [600, 500];

// Tile rectangles inside the collage box: 1 = one large, 2 = side by side,
// 3 = one large + two stacked, 4 = 2x2.
export function collageSlots(count, { w, h, gap } = COLLAGE) {
  const half = (w - gap) / 2;
  const halfH = (h - gap) / 2;
  switch (count) {
    case 1: return [{ x: 0, y: 0, w, h }];
    case 2: return [{ x: 0, y: 0, w: half, h }, { x: half + gap, y: 0, w: half, h }];
    case 3: {
      const big = Math.round((w - gap) * 0.66);
      const small = w - gap - big;
      return [
        { x: 0, y: 0, w: big, h },
        { x: big + gap, y: 0, w: small, h: halfH },
        { x: big + gap, y: halfH + gap, w: small, h: halfH },
      ];
    }
    case 4: return [
      { x: 0, y: 0, w: half, h: halfH }, { x: half + gap, y: 0, w: half, h: halfH },
      { x: 0, y: halfH + gap, w: half, h: halfH }, { x: half + gap, y: halfH + gap, w: half, h: halfH },
    ];
    default: return [];
  }
}

// Review photos next to the cover: 1 = one tall, 2 = stacked, 3 = one + two below.
export function reviewSlots(count, { w, h, gap } = REVIEW_PHOTOS) {
  const halfH = (h - gap) / 2;
  const halfW = (w - gap) / 2;
  switch (count) {
    case 1: return [{ x: 0, y: 0, w, h }];
    case 2: return [{ x: 0, y: 0, w, h: halfH }, { x: 0, y: halfH + gap, w, h: halfH }];
    case 3: return [
      { x: 0, y: 0, w, h: halfH },
      { x: 0, y: halfH + gap, w: halfW, h: halfH }, { x: halfW + gap, y: halfH + gap, w: halfW, h: halfH },
    ];
    default: return [];
  }
}

// r3 layouts apply only when the edge function sent the r3 keys.
export const isR3 = (large) =>
  (large.layout === "moment" || large.layout === "game") && (large.media !== undefined || large.counts !== undefined);

// What the share page holds, in the order of the V2 example ("動画 1・写真 3・全文").
export function chipParts(large) {
  if (large.layout === "moment") {
    if (large.spoiler) return [CTA_SPOILER_MOMENT];
    const media = large.media ?? [];
    const counts = large.counts ?? {
      photos: media.filter((item) => item.kind === "image").length,
      videos: media.filter((item) => item.kind === "video").length,
      text: false,
    };
    return [
      counts.videos > 0 ? `動画 ${counts.videos}` : null,
      counts.photos > 0 ? `写真 ${counts.photos}` : null,
      counts.text ? "全文" : null,
    ].filter(Boolean);
  }
  if (large.layout === "game") {
    const photos = large.counts?.photos ?? (large.media ?? []).length;
    return [
      large.score !== undefined ? "満足度" : null,
      large.counts?.text ? (large.spoiler ? "ネタバレを含む感想" : "感想の全文") : null,
      photos > 0 ? `写真 ${photos}` : null,
    ].filter(Boolean);
  }
  return [];
}

export function chipText(large) {
  const parts = chipParts(large);
  return parts.length > 0 ? `${CTA}｜${parts.join("・")}` : CTA;
}

// 61_000 -> "1:01"
export function formatDuration(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return null;
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// Whether the card draws the poster's own photos (then it is sent as JPEG).
export function drawsUserPhotos(large) {
  if (large.layout === "moment") return !large.spoiler && ((large.media?.length ?? 0) > 0 || Boolean(large.photo_url));
  if (large.layout === "game") return (large.media?.length ?? 0) > 0;
  return false;
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
  if (isR3(large)) parts.push(chipText(large), "›:", "\u2011");
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
  for (const item of large.media ?? []) urls.add(item.url);
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

  if (large.layout === "game" && (large.media?.length ?? 0) > 0) {
    // r3 review with photos: a smaller cover and the photos beside it.
    const buffer = get(large.cover_url);
    const slots = reviewSlots(large.media.length);
    const [cover, background, ...tiles] = await Promise.all([
      coverUri(buffer, ...REVIEW_COVER),
      blurUri(buffer ?? get(large.media[0].url)),
      ...large.media.map((item, i) => coverUri(get(item.url), slots[i].w, slots[i].h)),
    ]);
    return { cover, background, tiles };
  }
  if (large.layout === "game") {
    const buffer = get(large.cover_url);
    const [cover, background] = await Promise.all([coverUri(buffer, ...COVER.game), blurUri(buffer)]);
    return { cover, background };
  }
  if (large.layout === "moment" && (large.media?.length ?? 0) > 0) {
    // r3 collage. A tile that cannot be loaded is drawn as an empty frame.
    const slots = collageSlots(large.media.length);
    const firstLoaded = large.media.map((item) => get(item.url)).find(Boolean) ?? null;
    const [cover, background, ...tiles] = await Promise.all([
      coverUri(get(large.cover_url), ...COVER.moment),
      blurUri(firstLoaded ?? get(large.cover_url)),
      ...large.media.map((item, i) => coverUri(get(item.url), slots[i].w, slots[i].h)),
    ]);
    return { cover, background, tiles };
  }
  if (large.layout === "moment") {
    const photoBuffer = get(large.photo_url);
    const coverBuffer = get(large.cover_url);
    const [photo, cover, background] = await Promise.all([
      fittedUri(photoBuffer, ...(isR3(large) ? R3_PHOTO_BOX : PHOTO_BOX)),
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

// ---------------------------------------------------------------- r3 layouts

// Same as frame() but the logo sits top-right, clear of X's bottom-left title.
function frameTopLogo(assets, background, ...children) {
  return div(
    { width: W, height: H, position: "relative", backgroundColor: "#0B1524", fontFamily: "Noto Sans JP" },
    background
      ? img(background, FULL)
      : div({ ...FULL, backgroundImage: DARK_GRADIENT }),
    div({ ...FULL, backgroundImage: "linear-gradient(90deg, rgba(8,14,26,0.62) 0%, rgba(8,14,26,0.45) 100%)" }),
    ...children,
    img(assets.logo, { position: "absolute", right: 36, top: 30, width: LOGO_W, height: assets.logoHeight }),
  );
}

const PLAY_ICON = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">' +
  '<circle cx="48" cy="48" r="45" fill="#08101C" fill-opacity="0.62" stroke="#FFFFFF" stroke-width="4"/>' +
  '<path d="M39 29 L71 48 L39 67 Z" fill="#FFFFFF"/></svg>',
).toString("base64")}`;

function mediaTile(item, uri, slot) {
  const size = Math.round(Math.min(96, Math.min(slot.w, slot.h) * 0.36));
  const duration = item.kind === "video" ? formatDuration(item.duration_ms) : null;
  return div(
    { position: "absolute", left: slot.x, top: slot.y, width: slot.w, height: slot.h, borderRadius: 14,
      overflow: "hidden", backgroundColor: "rgba(148,163,184,0.28)", alignItems: "center", justifyContent: "center",
      boxShadow: "0 10px 30px rgba(0,0,0,0.45)" },
    uri ? img(uri, { position: "absolute", left: 0, top: 0, width: slot.w, height: slot.h }) : null,
    item.kind === "video" ? img(PLAY_ICON, { width: size, height: size }) : null,
    duration
      ? div({ position: "absolute", right: 10, bottom: 10, fontSize: slot.h > 300 ? 26 : 22, fontWeight: 700,
        color: "#FFFFFF", backgroundColor: "rgba(8,14,26,0.72)", borderRadius: 8, padding: "2px 10px" }, duration)
      : null,
  );
}

function tiles(media, uris, slots, box) {
  return div(
    { position: "relative", width: box.w, height: box.h, flexShrink: 0 },
    ...media.map((item, i) => mediaTile(item, uris[i] ?? null, slots[i])),
  );
}

// "タップして見る ›" + what is behind the tap.
function chip(large, maxWidth) {
  const parts = chipParts(large);
  const spoiler = large.spoiler === true && large.layout === "moment";
  return div(
    { flexDirection: "column", alignSelf: "flex-start", marginTop: 28, padding: "14px 24px", borderRadius: 18, maxWidth,
      backgroundColor: "#FFFFFF", border: spoiler ? "4px solid #FBBF24" : "0",
      boxShadow: "0 10px 28px rgba(0,0,0,0.35)" },
    div({ fontSize: 32, color: "#0B6775", fontWeight: 900, lineHeight: 1.25 }, `${CTA} ›`),
    parts.length > 0
      ? div({ fontSize: 26, color: "#1E293B", fontWeight: 700, lineHeight: 1.35, marginTop: 4, maxWidth: maxWidth - 48,
        ...ELLIPSIS }, parts.join("・"))
      : null,
  );
}

function rightColumn(left, width, ...children) {
  return div(
    { position: "absolute", left, top: 90, width, height: H - SAFE_BOTTOM - 90, flexDirection: "column",
      justifyContent: "center", minWidth: 0 },
    ...children,
  );
}

// 題名の折り返し (TASK-20261017-002 10/20): 日本語は既定だとどの字の間でも折れ、「そ / して伝説へ」のように語の途中で切れる。
// 空白で区切った塊がどれも 1 行に収まる時だけ、空白の所で折る (keep-all)。収まらない塊がある時は今まで通り
export function titleWordBreak(text, fontSize, width) {
  const parts = String(text).split(/\s+/).filter(Boolean);
  if (parts.length < 2) return {};
  const longest = Math.max(...parts.map((part) => [...part].reduce((w, ch) => w + (ch.charCodeAt(0) < 0x2e80 ? 0.6 : 1), 0)));
  return longest * fontSize <= width ? { wordBreak: "keep-all" } : {};
}

// 英数字の間のハイフン (HD-2D など) で折れないよう、折れないハイフン (U+2011) に置き換えて描く
export function titleText(text) {
  return String(text).replace(/([0-9A-Za-z])-(?=[0-9A-Za-z])/g, "$1\u2011");
}

function momentCardR3(large, images, assets) {
  const media = large.media ?? [];
  let left;
  let leftWidth;
  if (images.tiles && media.length > 0) {
    left = div({ position: "absolute", left: COLLAGE.x, top: COLLAGE.y },
      tiles(media, images.tiles, collageSlots(media.length), COLLAGE));
    leftWidth = COLLAGE.w;
  } else {
    const photo = images.photo;
    const [cw, ch] = COVER.moment;
    const width = photo ? photo.width : cw;
    const height = photo ? photo.height : ch;
    const top = Math.round(40 + (H - SAFE_BOTTOM - 40 - height) / 2);
    left = div({ position: "absolute", left: 56, top },
      photo
        ? img(photo.uri, { width, height, borderRadius: 18, boxShadow: "0 16px 48px rgba(0,0,0,0.55)" })
        : images.cover
        ? img(images.cover, { width, height, borderRadius: 16, boxShadow: "0 16px 48px rgba(0,0,0,0.55)" })
        : placeholder(width, height, 16));
    leftWidth = 16 + width;
  }
  const colLeft = COLLAGE.x + leftWidth + 44;
  const colWidth = W - colLeft - 44;
  return frameTopLogo(
    assets,
    images.background,
    left,
    rightColumn(
      colLeft,
      colWidth,
      div({ fontSize: 28, color: "#E2E8F0", fontWeight: 700, maxWidth: colWidth, ...ELLIPSIS }, large.heading),
      div({ display: "block", fontSize: large.title.length > 14 ? 38 : 46, lineHeight: 1.3, color: "#FFFFFF",
        fontWeight: 900, marginTop: 14, maxWidth: colWidth, overflow: "hidden", lineClamp: 3,
        ...titleWordBreak(`『${large.title}』`, large.title.length > 14 ? 38 : 46, colWidth) }, titleText(`『${large.title}』`)),
      chip(large, colWidth),
    ),
  );
}

function gameCardR3(large, images, assets) {
  const media = large.media ?? [];
  const withPhotos = images.tiles && media.length > 0;
  const [cw, ch] = withPhotos ? REVIEW_COVER : COVER.game;
  const top = Math.round(40 + (H - SAFE_BOTTOM - 40 - ch) / 2);
  const cover = images.cover
    ? img(images.cover, { width: cw, height: ch, borderRadius: 16, boxShadow: "0 16px 48px rgba(0,0,0,0.55)" })
    : placeholder(cw, ch, 16);
  const left = div(
    { position: "absolute", left: 48, top, alignItems: "flex-start" },
    cover,
    withPhotos
      ? div({ marginLeft: 14 }, tiles(media, images.tiles, reviewSlots(media.length), REVIEW_PHOTOS))
      : null,
  );
  const leftWidth = cw + (withPhotos ? 14 + REVIEW_PHOTOS.w : 0);
  const colLeft = 48 + leftWidth + 44;
  const colWidth = W - colLeft - 44;
  return frameTopLogo(
    assets,
    images.background,
    left,
    rightColumn(
      colLeft,
      colWidth,
      large.heading
        ? div({ fontSize: 28, color: "#E2E8F0", fontWeight: 700, maxWidth: colWidth, ...ELLIPSIS }, large.heading)
        : null,
      div({ display: "block", fontSize: large.title.length > 14 ? 38 : 48, lineHeight: 1.25, color: "#FFFFFF",
        fontWeight: 900, marginTop: 12, maxWidth: colWidth, overflow: "hidden", lineClamp: 2,
        ...titleWordBreak(large.title, large.title.length > 14 ? 38 : 48, colWidth) }, titleText(large.title)),
      large.score !== undefined ? scoreBadge(large.score) : null,
      chip(large, colWidth),
    ),
  );
}

export function cardElement(large, images, assets) {
  if (isR3(large)) return large.layout === "moment" ? momentCardR3(large, images, assets) : gameCardR3(large, images, assets);
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

// Renders a raw `large` payload: { body, contentType }. Cards that draw the
// poster's photos are JPEG <= JPEG_MAX_BYTES; the rest stay PNG.
export async function renderCardImage(rawLarge, options = {}) {
  const large = validLarge(rawLarge);
  if (!large) throw new Error("invalid large card");
  const png = await renderCard(large, options);
  return drawsUserPhotos(large)
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
