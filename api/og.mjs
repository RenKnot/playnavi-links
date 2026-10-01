import { canonicalTargetFromPath, isValidShortCode } from "../assets/link-routing.mjs";
import { renderCard, validLarge } from "./_lib/og-card.mjs";
import { PREVIEW_META_URL } from "./_lib/share-preview.mjs";

export const OG_CACHE_CONTROL = "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800";
export const FALLBACK_URL = "https://playnavi.app/og-fallback.png";
export const FALLBACK_CACHE_CONTROL = "public, max-age=0, s-maxage=60";
export const META_TIMEOUT_MS = 2500;
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

async function fetchLarge(target, fetchImpl, metaUrl) {
  const url = new URL(metaUrl);
  url.searchParams.set(target.param, target.value);
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(META_TIMEOUT_MS),
  });
  if (response.status !== 200) throw new Error(`share-preview-meta ${response.status}`);
  const payload = await response.json();
  if (payload?.status !== "ok") throw new Error("share-preview-meta not ok");
  const large = validLarge(payload.card?.large);
  if (!large) throw new Error("share-preview-meta has no valid large card");
  return large;
}

function fallback(response) {
  response.statusCode = 302;
  response.setHeader("Location", FALLBACK_URL);
  response.setHeader("Cache-Control", FALLBACK_CACHE_CONTROL);
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
      const png = await renderCard(large, {
        fetchImpl,
        ...(fontLoader ? { fontLoader } : {}),
        ...(assetsLoader ? { assetsLoader } : {}),
      });
      response.statusCode = 200;
      response.setHeader("Content-Type", "image/png");
      response.setHeader("Cache-Control", OG_CACHE_CONTROL);
      return response.end(png);
    } catch (error) {
      console.error("OG card render failed:", error?.message ?? error);
      return fallback(response);
    }
  };
}

export default createOgHandler();
