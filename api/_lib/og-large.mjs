// Pure validation of the optional `card.large` payload from share-preview-meta.
// Kept free of image/font dependencies so the share page function stays light.
import { createHash } from "node:crypto";

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
export const REVIEW_MEDIA_MAX = 3;
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
          // r3: review photos (images only, at most 3), what the page holds, spoiler.
          ...r3Fields(large, { spoiler: large.spoiler === true, max: REVIEW_MEDIA_MAX, imagesOnly: true }),
          ...(typeof large.spoiler === "boolean" ? { spoiler: large.spoiler } : {}),
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
function versionSource(large) {
  let source = large;
  if (large.layout === "moment" && large.photo_url) source = { ...source, photo_url: unsigned(large.photo_url) };
  // r3: the media URLs are signed too; hash only the stored objects.
  if (Array.isArray(large.media) && large.media.length > 0) {
    source = { ...source, media: large.media.map((item) => ({ ...item, url: unsigned(item.url) })) };
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
