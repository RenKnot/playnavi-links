import { canonicalTargetFromPath, isValidShortCode } from "../assets/link-routing.mjs";
import { renderCardImage, validLarge, withReason } from "./_lib/og-card.mjs";
import { PREVIEW_META_URL } from "./_lib/share-preview.mjs";

export const OG_CACHE_CONTROL = "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800";
// A moment card draws the owner's private photo (TASK-20261017-002). Keep the
// CDN copy for an hour so a moment made private stops being served soon.
export const OG_MOMENT_CACHE_CONTROL = "public, max-age=0, s-maxage=3600, stale-while-revalidate=600";
export const FALLBACK_URL = "https://playnavi.app/og-fallback.png";
// TASK-20261110-001: the static fallback is only for a bad address now, so nothing should remember it
// (the old "s-maxage=60" let the CDN pin a transient failure; see unavailable() below).
export const FALLBACK_CACHE_CONTROL = "no-store";
// TASK-20261110-001: how long one read of the meta EF (share-preview-meta) may take. 2.5s lost the race
// against the EF's cold start — measured on STG: 2.38s cold, 0.09s warm, 0.59s after 60s idle, 1.1s after
// 120s idle; a cold production card took 3.6s end to end (11/10). vercel.json gives the function 20s.
export const META_TIMEOUT_MS = 8000;
// One read may fail for a passing reason (timeout, 5xx, network); read once more before giving up.
const META_ATTEMPTS = 2;
// TASK-20261110-001: a card that could not be drawn answers 503 with no body. X remembers the first image
// it sees for days and Bluesky bakes it into the post, so a failure must never be cached (no-store) and must
// be visible to the app's warm-up (lib/share/linkCardWarmup.ts) and EF social-post, which retry after this.
export const UNAVAILABLE_CACHE_CONTROL = "no-store";
export const UNAVAILABLE_RETRY_AFTER = "3";
// Only a really drawn card says "rendered" (a CDN copy of it keeps the header); a 503 says "failed" and names
// the stage in X-PlayNavi-Card-Reason so the failure can be told apart without the Vercel log (the app's
// warm-up sends it to Sentry). The value is one of CARD_REASON_PATTERN, never the exception text.
export const CARD_HEADER = "X-PlayNavi-Card";
export const CARD_RENDERED_VALUE = "rendered";
export const CARD_FAILED_VALUE = "failed";
export const CARD_REASON_HEADER = "X-PlayNavi-Card-Reason";
export const CARD_REASON_PATTERN = /^(meta_timeout|meta_status_\d{1,3}|meta_not_ok|meta_invalid|font|render|jpeg_too_large)$/;
const VERSION_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

// Exactly one of `code` / `path`, plus an optional cache-busting `v`.
export function ogTarget(requestUrl) {
  let url;
  try {
    url = new URL(requestUrl, "https://playnavi.app");
  } catch {
    return null;
  }
  const params = url.searchParams;
  const keys = [...params.keys()];
  if (keys.some((key) => !["code", "path", "v"].includes(key))) return null;
  if (new Set(keys).size !== keys.length) return null;
  const v = params.get("v");
  if (v !== null && !VERSION_PATTERN.test(v)) return null;
  const code = params.get("code");
  const path = params.get("path");
  if ((code === null) === (path === null)) return null;
  if (code !== null) return isValidShortCode(code) ? { param: "code", value: code } : null;
  return canonicalTargetFromPath(path) ? { param: "path", value: path } : null;
}

// A meta read failure with its fixed reason word. `permanent` = a second read would answer the same
// (not_found / other 4xx, a payload without a large card), so it is not retried.
const metaFailure = (reason, { permanent = false } = {}) =>
  Object.assign(withReason(new Error(`share-preview-meta ${reason}`), reason), { permanent });
// A read that threw: the timeout, a body that is not JSON, or no answer at all (status 0, as a browser says it).
function thrownMetaReason(error) {
  if (error?.name === "TimeoutError" || error?.name === "AbortError") return "meta_timeout";
  if (error instanceof SyntaxError) return "meta_invalid";
  return "meta_status_0";
}

async function fetchLarge(target, fetchImpl, metaUrl) {
  const url = new URL(metaUrl);
  url.searchParams.set(target.param, target.value);
  let lastError;
  for (let attempt = 1; attempt <= META_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(META_TIMEOUT_MS),
      });
      // 404 (status "not_found") and other 4xx: retried or not, the answer is the same. 5xx is retried.
      if (response.status !== 200) throw metaFailure(`meta_status_${response.status}`, { permanent: response.status < 500 });
      const payload = await response.json();
      if (payload?.status !== "ok") throw metaFailure("meta_not_ok", { permanent: true });
      const large = validLarge(payload.card?.large);
      if (!large) throw metaFailure("meta_invalid", { permanent: true });
      return large;
    } catch (error) {
      if (error?.permanent === true) throw error;
      // timeout (TimeoutError), network error, 5xx, or a body cut off mid-read: once more
      lastError = withReason(error, thrownMetaReason(error));
    }
  }
  throw lastError;
}

// The stage that failed as one of the fixed words; anything untagged is the drawing itself.
export function cardFailureReason(error) {
  return typeof error?.reason === "string" && CARD_REASON_PATTERN.test(error.reason) ? error.reason : "render";
}

// Bad address: the static picture, remembered by nobody.
function fallback(response) {
  response.statusCode = 302;
  response.setHeader("Location", FALLBACK_URL);
  response.setHeader("Cache-Control", FALLBACK_CACHE_CONTROL);
  return response.end();
}

// Could not draw (meta read failed twice / not found / render error): a cacheless 503 so the reader
// (the app's warm-up, EF social-post, an SNS crawler) tries again instead of pinning the fallback.
function unavailable(response, reason) {
  response.statusCode = 503;
  response.setHeader("Cache-Control", UNAVAILABLE_CACHE_CONTROL);
  response.setHeader("Retry-After", UNAVAILABLE_RETRY_AFTER);
  response.setHeader(CARD_HEADER, CARD_FAILED_VALUE);
  response.setHeader(CARD_REASON_HEADER, reason);
  return response.end();
}

export function createOgHandler({
  fetchImpl = globalThis.fetch,
  fontLoader,
  assetsLoader,
  metaUrl = PREVIEW_META_URL,
} = {}) {
  return async function handler(request, response) {
    if (request.method !== "GET") {
      response.statusCode = 405;
      response.setHeader("Allow", "GET");
      response.setHeader("Cache-Control", "no-store");
      return response.end("Method Not Allowed");
    }
    const target = ogTarget(request.url);
    if (!target) return fallback(response);
    try {
      const large = await fetchLarge(target, fetchImpl, metaUrl);
      // TASK-20261017-002 r3: a card with the poster's photos is JPEG (<= 900KB, Bluesky thumb limit).
      const { body, contentType } = await renderCardImage(large, {
        fetchImpl,
        ...(fontLoader ? { fontLoader } : {}),
        ...(assetsLoader ? { assetsLoader } : {}),
      });
      response.statusCode = 200;
      response.setHeader("Content-Type", contentType);
      response.setHeader("Cache-Control", large.layout === "moment" ? OG_MOMENT_CACHE_CONTROL : OG_CACHE_CONTROL);
      response.setHeader(CARD_HEADER, CARD_RENDERED_VALUE);
      return response.end(body);
    } catch (error) {
      const reason = cardFailureReason(error);
      console.error(`OG card render failed (${reason}):`, error?.message ?? error);
      return unavailable(response, reason);
    }
  };
}

export default createOgHandler();
