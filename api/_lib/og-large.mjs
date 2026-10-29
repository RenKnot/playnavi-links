// Pure validation of the optional `card.large` payload from share-preview-meta.
// Kept free of image/font dependencies so the share page function stays light.
import { createHash } from "node:crypto";
import { TIER_COLORS, TIER_LOOKS } from "./tier-board.mjs";

export const OG_IMAGE_ORIGIN = "https://playnavi.app/api/og";
export const ALLOWED_IMAGE_HOSTS = new Set([
  "images.igdb.com",
  "irbtguncoatqfikctreq.supabase.co",
  "playnavi.app",
]);
const MAX_TEXT = 200;
const AXIS_LABEL_MAX = 10;
const TYPE_CODE = /^[ce][bf][is][dw]$/;
const COLOR = /^#[0-9A-Fa-f]{6}$/;
const STAT_KEYS = ["total", "playing", "completed", "streaming_completed", "dropped", "want_to_play"];

class Invalid extends Error {}
const fail = () => { throw new Invalid(); };

// Unknown keys are ignored (the result is rebuilt from known keys only), so
// the edge function can add fields before this site learns about them.
function onlyKeys(object) {
  if (!object || typeof object !== "object" || Array.isArray(object)) fail();
}
function text(value, { nullable = false, allowEmpty = false } = {}) {
  if (value === null && nullable) return null;
  if (typeof value !== "string" || value.length > MAX_TEXT) fail();
  if (!allowEmpty && !value.trim()) {
    if (nullable) return null;
    fail();
  }
  return value;
}
function count(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail();
  return value;
}
export function allowedImageUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "" &&
      url.port === "" && ALLOWED_IMAGE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}
function axis(value) {
  onlyKeys(value);
  const left = text(value.left);
  const right = text(value.right);
  if (left.length > AXIS_LABEL_MAX || right.length > AXIS_LABEL_MAX) fail();
  const { position } = value;
  if (!Number.isInteger(position) || position < 0 || position > 100) fail();
  return { left, right, position };
}
function imageUrl(value) {
  if (value === null) return null;
  if (!allowedImageUrl(value)) fail();
  return value;
}
// Optional field added after the layout shipped: absent or null = not drawn,
// and left out of the normalized copy so older cards keep their version hash.
function optional(large, key, read) {
  const value = large[key];
  return value === undefined || value === null ? {} : { [key]: read(value) };
}
// Satisfaction 0..10 in steps of 0.1 (the app's scale).
function score(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10 ||
    Math.round(value * 10) !== value * 10) fail();
  return value;
}
// A moment photo is a signed URL of the private bucket on an allow-listed host.
const SIGNED_PHOTO_PATH = /^\/storage\/v1\/object\/sign\/game-log-media-private\/[^?#]+$/;
function photoUrl(value) {
  if (value === null) return null;
  if (!allowedImageUrl(value)) fail();
  const url = new URL(value);
  if (!SIGNED_PHOTO_PATH.test(url.pathname) || !url.searchParams.get("token")) fail();
  return value;
}

// TASK-20261017-002 r3 (V1/V2): the drawn previews of the record (C1 `media`)
// and what the share page holds (C1 `counts`). Each media entry goes through
// the same signed-path check as photo_url; a bad entry is dropped, never fatal.
export const MOMENT_MEDIA_MAX = 4;
// r11: レビューは写真 10 枚まで付けられる (app ReviewMediaPicker MAX_REVIEW_MEDIA = 10)。カードに描くのは 8 枚まで (card-layout.mjs MAX_ITEMS)
export const REVIEW_MEDIA_MAX = 8;
function mediaItem(value, { imagesOnly }) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.kind !== "image" && value.kind !== "video") return null;
  if (imagesOnly && value.kind !== "image") return null;
  try {
    photoUrl(value.url);
  } catch {
    return null;
  }
  if (value.url === null) return null;
  if (value.kind === "image") return { kind: "image", url: value.url };
  const duration = value.duration_ms;
  const valid = typeof duration === "number" && Number.isFinite(duration) && duration >= 0 &&
    duration <= 24 * 3600 * 1000;
  return { kind: "video", url: value.url, duration_ms: valid ? Math.round(duration) : null };
}
function mediaList(value, max, { imagesOnly = false } = {}) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 16).map((item) => mediaItem(item, { imagesOnly }))
    .filter(Boolean).slice(0, max);
}
function mediaCounts(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { photos, videos, text: hasText } = value;
  if (!Number.isSafeInteger(photos) || photos < 0 || !Number.isSafeInteger(videos) || videos < 0 ||
    typeof hasText !== "boolean") return null;
  return { photos, videos, text: hasText };
}
// Present only when the edge function sent them, so an old payload keeps the
// exact normalized shape (and version hash) it had before r3.
function r3Fields(large, { spoiler, max, imagesOnly }) {
  const out = {};
  if (large.media !== undefined && large.media !== null) {
    out.media = spoiler ? [] : mediaList(large.media, max, { imagesOnly });
  }
  if (large.counts !== undefined && large.counts !== null) {
    const counts = mediaCounts(large.counts);
    if (counts) out.counts = counts;
  }
  return out;
}

// TASK-20261017-002 r7 (§11 P3/P4): who posted the record, drawn large on the card. Present only when the
// edge function sent author_name (older payloads keep their shape and version hash). A bad icon URL is dropped
// (the card draws the initial), never fatal.
const AUTHOR_NAME_MAX = 100;
function authorFields(large) {
  const name = large.author_name;
  if (typeof name !== "string" || !name.trim() || name.length > AUTHOR_NAME_MAX) return {};
  return {
    author_name: name.trim(),
    author_avatar_url: allowedImageUrl(large.author_avatar_url) ? large.author_avatar_url : null,
  };
}

// TASK-20261017-002 r8 (overview §12.2): photos / video posters of the same play and how many the play has in all
// (= the album on the record page). r8 sent them only for a record without its own photos (up to 5); r11 also sends
// them next to the record's own media to fill the card up to 8 (play_media = the album minus the record's own items,
// at most 8 - media.length). Present only when the edge function sent them (older payloads keep their shape and
// version hash). Bad entries are dropped; a spoiler record never carries them.
export const PLAY_MEDIA_MAX = 8;
function playFields(large, { spoiler }) {
  if (large.play_media === undefined || large.play_media === null) return {};
  const total = large.play_media_total;
  if (!Number.isSafeInteger(total) || total < 0) return {};
  const media = spoiler ? [] : mediaList(large.play_media, PLAY_MEDIA_MAX);
  const c = large.play_media_counts;
  const counts = c && typeof c === "object" && !Array.isArray(c) && Number.isSafeInteger(c.photos) && c.photos >= 0 &&
      Number.isSafeInteger(c.videos) && c.videos >= 0
    ? { photos: c.photos, videos: c.videos }
    : { photos: media.filter((m) => m.kind === "image").length, videos: media.filter((m) => m.kind === "video").length };
  return { play_media: media, play_media_total: Math.max(total, media.length), play_media_counts: counts };
}

// ---------------------------------------------------------------- TASK-20261023-003 E1〜E3
// 新しい鍵 (kind / tier_board / room) は、EF が送った時だけ正規化した写しに入る (古い答えは今の形と版のハッシュのまま)。
// 中身が壊れている時はその鍵だけ捨てる (カード全体は今の形で描く)。古い links はこの鍵を知らないので捨てて今の形を描く。

const chars = (value) => Array.from(value).length;
const plain = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

// E2: 段 1〜8・置いた札は合わせて 100 まで (save_tier_list_v1 の上限)。表紙の URL は 1 枚ずつ確かめ、だめな物は「表紙なし」
export const TIER_BOARD_TIERS_MAX = 8;
export const TIER_BOARD_CARDS_MAX = 100;
function tierBoardField(large) {
  const board = large.tier_board;
  if (!plain(board) || !TIER_LOOKS.includes(board.look) || !TIER_COLORS.includes(board.mono_color)) return {};
  if (!Array.isArray(board.tiers) || board.tiers.length === 0 || board.tiers.length > TIER_BOARD_TIERS_MAX) return {};
  let left = TIER_BOARD_CARDS_MAX;
  const tiers = [];
  for (const tier of board.tiers) {
    if (!plain(tier) || typeof tier.rank_name !== "string") return {};
    const rank = tier.rank_name.trim();
    if (!rank || chars(rank) > 4 || !TIER_COLORS.includes(tier.color_key)) return {};
    const label = typeof tier.label === "string" && tier.label.trim() && chars(tier.label.trim()) <= 12 ? tier.label.trim() : null;
    if (!Array.isArray(tier.cover_urls) || !Number.isSafeInteger(tier.count) || tier.count < 0) return {};
    const covers = tier.cover_urls.slice(0, left).map((url) => (allowedImageUrl(url) ? url : null));
    left -= covers.length;
    tiers.push({ rank_name: rank, label, color_key: tier.color_key, count: Math.min(Math.max(tier.count, covers.length), TIER_BOARD_CARDS_MAX), cover_urls: covers });
  }
  return { tier_board: { look: board.look, mono_color: board.mono_color, tiers } };
}

// E3: マイルーム。テーマの名前はアプリ constants/theme.ts roomGradients のキー (DB の CHECK と同じ 10 個)
export const ROOM_THEMES = ["cyan", "blue", "purple", "pink", "red", "amber", "green", "teal", "brown", "slate"];
export const ROOM_COVERS_MAX = 5;
const ROOM_TYPE_NAME_MAX = 40;
function roomField(large) {
  const room = large.room;
  if (!plain(room) || !ROOM_THEMES.includes(room.theme) || !["photo", "theme", "best"].includes(room.cover)) return {};
  const coverUrl = allowedImageUrl(room.cover_url) ? room.cover_url : null;
  const covers = Array.isArray(room.cover_urls) ? room.cover_urls.filter((url) => allowedImageUrl(url)).slice(0, ROOM_COVERS_MAX) : [];
  const shelf = covers.length > 0 && (room.shelf === "best" || room.shelf === "recent") ? room.shelf : null;
  // 写真の表紙なのに写真が無い・マイベストの表紙なのにマイベストが無い時はテーマの色 (アプリ resolveProfileCoverKind と同じ戻し方)
  const cover = room.cover === "photo" && !coverUrl ? "theme" : room.cover === "best" && shelf !== "best" ? "theme" : room.cover;
  const typeName = typeof room.type_name === "string" && room.type_name.trim() && chars(room.type_name.trim()) <= ROOM_TYPE_NAME_MAX
    ? room.type_name.trim()
    : null;
  return { room: { theme: room.theme, cover, cover_url: cover === "photo" ? coverUrl : null, type_name: typeName, shelf, cover_urls: shelf ? covers : [] } };
}

// Returns a normalized copy (fixed key order) or null.
export function validLarge(large) {
  try {
    if (!large || typeof large !== "object") return null;
    switch (large.layout) {
      case "game":
        onlyKeys(large);
        return {
          layout: "game",
          heading: text(large.heading, { nullable: true }),
          title: text(large.title),
          publisher: text(large.publisher, { nullable: true }),
          developer: text(large.developer, { nullable: true }),
          cover_url: imageUrl(large.cover_url),
          // log cards (TASK-20261017-002): satisfaction and the head of the review.
          ...optional(large, "score", score),
          ...optional(large, "excerpt", (value) => text(value)),
          // r3: review photos (images only; r11: at most 8), what the page holds, spoiler.
          ...r3Fields(large, { spoiler: large.spoiler === true, max: REVIEW_MEDIA_MAX, imagesOnly: true }),
          ...(typeof large.spoiler === "boolean" ? { spoiler: large.spoiler } : {}),
          ...authorFields(large),
          ...playFields(large, { spoiler: false }),
        };
      case "moment":
        onlyKeys(large);
        if (typeof large.spoiler !== "boolean") fail();
        return {
          layout: "moment",
          heading: text(large.heading),
          title: text(large.title),
          // A spoiler moment never carries its text or its photo.
          excerpt: large.spoiler ? null : text(large.excerpt, { nullable: true }),
          spoiler: large.spoiler,
          photo_url: large.spoiler ? null : photoUrl(large.photo_url),
          cover_url: imageUrl(large.cover_url),
          // r3: up to 4 photos / video posters in the record's order. A spoiler never carries them.
          ...r3Fields(large, { spoiler: large.spoiler, max: MOMENT_MEDIA_MAX, imagesOnly: false }),
          ...authorFields(large),
          ...playFields(large, { spoiler: large.spoiler }),
        };
      case "profile": {
        onlyKeys(large);
        let stats = null;
        if (large.stats !== null) {
          onlyKeys(large.stats);
          stats = Object.fromEntries(STAT_KEYS.map((key) => [key, count(large.stats[key])]));
        }
        return {
          layout: "profile",
          name: text(large.name),
          avatar_url: imageUrl(large.avatar_url),
          background_url: imageUrl(large.background_url),
          stats,
          ...roomField(large),
        };
      }
      case "grid":
        onlyKeys(large);
        if (typeof large.ranked !== "boolean") fail();
        if (!Array.isArray(large.cover_urls) || large.cover_urls.length > 3) fail();
        return {
          layout: "grid",
          title: text(large.title),
          subtitle: text(large.subtitle, { allowEmpty: true }),
          // Optional: older edge-function responses do not carry these.
          description: large.description === undefined
            ? null
            : text(large.description, { nullable: true }),
          owner_avatar_url: large.owner_avatar_url === undefined
            ? null
            : imageUrl(large.owner_avatar_url),
          ranked: large.ranked,
          cover_urls: large.cover_urls.map((url) => {
            if (!allowedImageUrl(url)) fail();
            return url;
          }),
          total_count: count(large.total_count),
          // E1: カタログ (表紙を扇に重ねた形で描く)
          ...(large.kind === "catalog" ? { kind: "catalog" } : {}),
          // E2: Tier表そのもの
          ...tierBoardField(large),
        };
      case "diagnosis":
        onlyKeys(large);
        if (typeof large.type_code !== "string" || !TYPE_CODE.test(large.type_code)) fail();
        if (large.color !== null && (typeof large.color !== "string" || !COLOR.test(large.color))) fail();
        if (!Array.isArray(large.axes) || large.axes.length !== 4) fail();
        return {
          layout: "diagnosis",
          name: text(large.name),
          avatar_url: imageUrl(large.avatar_url),
          type_name: text(large.type_name),
          title: text(large.title, { nullable: true }),
          type_code: large.type_code,
          illustration_url: imageUrl(large.illustration_url),
          color: large.color,
          axes: large.axes.map(axis),
        };
      default:
        return null;
    }
  } catch (error) {
    if (error instanceof Invalid) return null;
    throw error;
  }
}

// The moment photo URL carries a fresh signature on every read; the version
// hashes the stored object (origin + path) instead, so the image URL stays the
// same between reads and the CDN copy is reused.
const unsigned = (value) => {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`;
};
// 秒に丸めた長さ (ms の形のまま。もともと 1000 の倍数の物は今までの版の印のまま)
const videoSeconds = (item) =>
  item.kind === "video" && typeof item.duration_ms === "number"
    ? { duration_ms: Math.round(item.duration_ms / 1000) * 1000 }
    : {};
function versionSource(large) {
  let source = large;
  if (large.layout === "moment" && large.photo_url) source = { ...source, photo_url: unsigned(large.photo_url) };
  // r3: the media URLs are signed too; hash only the stored objects.
  // TASK-20261021-002 10/29: 動画の長さは描く単位 (秒。og-card.mjs formatDuration と同じ丸め) で数える。
  // 変換中はアプリが測った長さ、変換の後は作り直した動画の長さ (ms がずれる) なので、ms のままだと絵が同じでも版の印が変わる
  if (Array.isArray(large.media) && large.media.length > 0) {
    source = { ...source, media: large.media.map((item) => ({ ...item, url: unsigned(item.url), ...videoSeconds(item) })) };
  }
  // r8: the play's photos are signed too
  if (Array.isArray(large.play_media) && large.play_media.length > 0) {
    source = { ...source, play_media: large.play_media.map((item) => ({ ...item, url: unsigned(item.url) })) };
  }
  return source;
}

export function largeVersion(large) {
  return createHash("sha256").update(JSON.stringify(versionSource(large))).digest("hex").slice(0, 12);
}

// `large` must already be the normalized output of validLarge.
export function largeImageUrl(upstreamParam, upstreamValue, large) {
  if (upstreamParam !== "code" && upstreamParam !== "path") return null;
  const url = new URL(OG_IMAGE_ORIGIN);
  url.searchParams.set(upstreamParam, upstreamValue);
  url.searchParams.set("v", largeVersion(large));
  return url.href;
}
