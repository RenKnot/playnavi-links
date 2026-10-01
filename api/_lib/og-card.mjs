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

const COVER = { game: [330, 440], grid: [240, 320], gridCompact: [204, 272] };
const OWNER_AVATAR = 44;
const AVATAR = 200;
const ILLUSTRATION = 300;
const DIAGNOSIS_ACCENT = "#70D5E2";
const LOGO_W = 160;
const BADGE = [64, 100];

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
  if (large.layout === "game") parts.push(large.heading ?? "", large.title, large.publisher ?? "", large.developer ?? "");
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

  if (large.layout === "game") {
    const buffer = get(large.cover_url);
    const [cover, background] = await Promise.all([coverUri(buffer, ...COVER.game), blurUri(buffer)]);
    return { cover, background };
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

function gameCard(large, images, assets) {
  const [cw, ch] = COVER.game;
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
        div({ fontSize: large.title.length > 16 ? 56 : 68, lineHeight: 1.25, color: "#FFFFFF", fontWeight: 900,
          lineClamp: 3, overflow: "hidden" }, large.title),
        companies(large.publisher, large.developer),
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

export function cardElement(large, images, assets) {
  if (large.layout === "diagnosis") return diagnosisCard(large, images, assets);
  if (large.layout === "game") return gameCard(large, images, assets);
  if (large.layout === "profile") return profileCard(large, images, assets);
  return gridCard(large, images, assets);
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
