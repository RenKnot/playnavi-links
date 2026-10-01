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

export function largeVersion(large) {
  return createHash("sha256").update(JSON.stringify(large)).digest("hex").slice(0, 12);
}

// `large` must already be the normalized output of validLarge.
export function largeImageUrl(upstreamParam, upstreamValue, large) {
  if (upstreamParam !== "code" && upstreamParam !== "path") return null;
  const url = new URL(OG_IMAGE_ORIGIN);
  url.searchParams.set(upstreamParam, upstreamValue);
  url.searchParams.set("v", largeVersion(large));
  return url.href;
}
