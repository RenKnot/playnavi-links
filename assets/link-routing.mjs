export const CANONICAL_ORIGIN = "https://links.playnavilab.com";
// Browser calls the same-origin Vercel proxy. vercel.json owns the upstream EF
// name and can change it without shipping a different browser-side origin.
export const SHORT_LINK_RESOLVER_URL = "/api/share-links";
export const AI_RETURN_ORIGIN = "https://playnavi.app";

const SHORT_CODE_PATTERN = /^[A-Za-z0-9_-]{16}$/;
const UUID_PATTERN =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const GAME_ID_PATTERN = "[1-9][0-9]{0,18}";
const PG_BIGINT_MAX = "9223372036854775807";
const AI_RETURN_ACTIONS = new Set(["log", "wishlist"]);
const AI_RETURN_PROVIDERS = new Set(["chatgpt", "perplexity", "claude", "gemini"]);
const AI_RETURN_INTENTS = new Set([
  "reviews_no_spoiler", "fit_for_me", "similar", "which_platform", "stuck", "series_order",
]);

const CANONICAL_PATTERNS = [
  { type: "log", pattern: new RegExp(`^/game/${GAME_ID_PATTERN}\\?logId=${UUID_PATTERN}$`) },
  { type: "game", pattern: new RegExp(`^/game/${GAME_ID_PATTERN}$`) },
  { type: "ranking", pattern: new RegExp(`^/users/${UUID_PATTERN}/custom-rankings/${UUID_PATTERN}$`) },
  { type: "user", pattern: new RegExp(`^/users/${UUID_PATTERN}$`) },
  { type: "catalog", pattern: new RegExp(`^/catalogs/${UUID_PATTERN}$`) },
];

export class ResolveError extends Error {
  constructor(kind, message, status = null) {
    super(message);
    this.name = "ResolveError";
    this.kind = kind;
    this.status = status;
  }
}

export function isValidShortCode(code) {
  return SHORT_CODE_PATTERN.test(code);
}

export function shortCodeFromPath(pathname) {
  const match = /^\/s\/([^/]+)$/.exec(pathname);
  return match && isValidShortCode(match[1]) ? match[1] : null;
}

export function canonicalTargetFromPath(path) {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
    return null;
  }

  const matched = CANONICAL_PATTERNS.find(({ pattern }) => pattern.test(path));
  if (!matched) return null;
  const gameId = /^\/game\/([1-9][0-9]{0,18})(?:\?|$)/.exec(path)?.[1];
  if (gameId && gameId.length === PG_BIGINT_MAX.length && gameId > PG_BIGINT_MAX) return null;

  return {
    type: matched.type,
    canonicalPath: path,
    canonicalUrl: `${CANONICAL_ORIGIN}${path}`,
    // `/s/{code}` must never reach this conversion. Only an allowlisted canonical
    // path returned above can become a custom-scheme URL.
    schemeUrl: `playnavi:/${path}`,
  };
}

export function aiReturnTargetFromPath(path) {
  // This route is a separate app-return contract, never a short-link resolver
  // target. Rebuild the URL from known values before presenting a browser link.
  if (typeof path !== "string" || !path.startsWith("/a?")) return null;
  let url;
  try {
    url = new URL(path, AI_RETURN_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== AI_RETURN_ORIGIN || url.pathname !== "/a" || url.hash) return null;
  const params = url.searchParams;
  const keys = ["act", "g", "src", "i", "at"];
  if ([...params.keys()].length !== keys.length ||
      keys.some((key) => params.getAll(key).length !== 1)) return null;
  const [action, gameIdText, provider, intent, createdAtText] =
    keys.map((key) => params.get(key));
  if (!AI_RETURN_ACTIONS.has(action) || !/^[1-9][0-9]*$/.test(gameIdText) ||
      !Number.isSafeInteger(Number(gameIdText)) ||
      !AI_RETURN_PROVIDERS.has(provider) || !AI_RETURN_INTENTS.has(intent) ||
      !/^[0-9]{13}$/.test(createdAtText)) return null;

  const canonicalPath = `/a?${new URLSearchParams({
    act: action, g: gameIdText, src: provider, i: intent, at: createdAtText,
  })}`;
  return {
    canonicalPath,
    canonicalUrl: `${AI_RETURN_ORIGIN}${canonicalPath}`,
    schemeUrl: `playnavi:/${canonicalPath}`,
  };
}

export async function resolveShortLink(code, options = {}) {
  if (!isValidShortCode(code)) {
    throw new ResolveError("unavailable", "invalid short-link code");
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const resolverUrl = options.resolverUrl || SHORT_LINK_RESOLVER_URL;
  const url = `${resolverUrl}/${encodeURIComponent(code)}`;

  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      credentials: "omit",
      signal: options.signal,
    });
  } catch (error) {
    throw new ResolveError("temporary", "resolver request failed");
  }

  if (response.status === 404) {
    throw new ResolveError("unavailable", "short link is unavailable", 404);
  }
  if (response.status === 429 || response.status >= 500) {
    throw new ResolveError("temporary", "resolver is temporarily unavailable", response.status);
  }
  if (!response.ok) {
    throw new ResolveError("temporary", "resolver rejected the request", response.status);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new ResolveError("temporary", "resolver returned invalid JSON", response.status);
  }

  const target = canonicalTargetFromPath(payload?.canonical_path);
  if (
    payload?.status !== "ok" ||
    payload?.code !== code ||
    !target ||
    payload?.target_type !== target.type
  ) {
    // Treat an invalid success payload as an outage. Never follow a server-provided
    // absolute URL or arbitrary scheme, even if the resolver is misconfigured.
    throw new ResolveError("temporary", "resolver returned an unsafe canonical path", response.status);
  }
  return target;
}
