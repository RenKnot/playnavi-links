import { canonicalTargetFromPath, isValidShortCode } from "../../assets/link-routing.mjs";
import { largeImageUrl, validLarge } from "./og-large.mjs";

export const PREVIEW_META_URL =
  "https://irbtguncoatqfikctreq.supabase.co/functions/v1/share-preview-meta";

export const GENERIC_CARD = Object.freeze({
  title: "PlayNavi",
  description: "PlayNaviでゲームの記録をチェック",
  image_url: "https://playnavi.app/logo.png",
});

const ALLOWED_HOSTS = new Set([
  "playnavi.app",
  "links.playnavilab.com",
  "playnavi-links.vercel.app",
]);

const ESCAPES = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
});

export function escapeHtmlAttribute(value) {
  return String(value).replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

function single(value) {
  return typeof value === "string" ? value : null;
}

function withExtraQuery(baseUrl, query, excludedKeys) {
  const url = new URL(baseUrl);
  for (const [key, raw] of Object.entries(query)) {
    if (excludedKeys.has(key)) continue;
    const values = Array.isArray(raw) ? raw : [raw];
    if (values.some((value) => typeof value !== "string")) return null;
    for (const value of values) url.searchParams.append(key, value);
  }
  return url.href.length <= 2048 ? url.href : null;
}

export function previewTarget(request) {
  const host = single(request.headers?.host)?.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) return null;

  const query = request.query ?? {};
  const keys = Object.keys(query).sort();
  const code = single(query.code);
  if (code !== null) {
    if (!isValidShortCode(code)) return null;
    const url = withExtraQuery(`https://${host}/s/${code}`, query, new Set(["code"]));
    if (!url) return null;
    return {
      url,
      upstreamParam: "code",
      upstreamValue: code,
    };
  }

  // Canonical pages are served by links.playnavilab.com only. Keep the
  // playnavi.app paths available for the separate web application.
  if (host !== "links.playnavilab.com") return null;
  const kind = single(query.kind);
  const id = single(query.id);
  const ownerId = single(query.ownerId);
  const rankingId = single(query.rankingId);
  const logId = single(query.logId);
  let path;
  switch (kind) {
    case "game":
      path = `/game/${id}${logId === null ? "" : `?logId=${logId}`}`;
      break;
    case "user":
      path = `/users/${id}`;
      break;
    case "ranking":
      path = `/users/${ownerId}/custom-rankings/${rankingId}`;
      break;
    case "catalog":
      path = `/catalogs/${id}`;
      break;
    default:
      return null;
  }
  if (!canonicalTargetFromPath(path)) return null;
  const requiredKeys = {
    game: logId === null ? ["id", "kind"] : ["id", "kind", "logId"],
    user: ["id", "kind"],
    ranking: ["kind", "ownerId", "rankingId"],
    catalog: ["id", "kind"],
  }[kind];
  // Vercel adds the matched `has: { type: "host" }` value to the rewritten
  // function query. It is routing metadata, not part of the shared URL.
  if (query.host !== undefined && query.host !== host) return null;
  const internalKeys = new Set(requiredKeys);
  if (query.host === host) internalKeys.add("host");
  const url = withExtraQuery(
    `https://${host}${path}`,
    query,
    internalKeys,
  );
  if (!url) return null;
  const hasExtraQuery = keys.some((key) => !internalKeys.has(key));
  return {
    url,
    // The canonical resolver accepts only exact paths. Preserve the requested
    // URL but use a generic card when it carries unsupported query keys.
    upstreamParam: hasExtraQuery ? null : "path",
    upstreamValue: hasExtraQuery ? null : path,
  };
}

export function validCard(payload) {
  if (payload?.status !== "ok" || !payload.card || typeof payload.card !== "object") {
    return null;
  }
  const { title, description, image_url: imageUrl } = payload.card;
  if (
    typeof title !== "string" || !title.trim() ||
    typeof description !== "string" || !description.trim() ||
    typeof imageUrl !== "string"
  ) return null;
  try {
    const parsed = new URL(imageUrl);
    if (parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }
  const large = validLarge(payload.card.large);
  return large
    ? { title, description, image_url: imageUrl, large }
    : { title, description, image_url: imageUrl };
}

// The large card image URL for a validated card, or null for the small card.
export function largeCardImageUrl(card, target) {
  if (!card?.large || !target?.upstreamParam) return null;
  return largeImageUrl(target.upstreamParam, target.upstreamValue, card.large);
}

export function renderPreviewHtml(template, card, url, largeImage = null) {
  const headClose = template.indexOf("</head>");
  if (headClose < 0) throw new Error("index.html has no closing head tag");
  const insertion = template.lastIndexOf("\n", headClose) + 1;
  const tags = (largeImage
    ? [
        ["property", "og:site_name", "PlayNavi"],
        ["property", "og:type", "website"],
        ["property", "og:title", card.title],
        ["property", "og:description", card.description],
        ["property", "og:image", largeImage],
        ["property", "og:image:width", "1200"],
        ["property", "og:image:height", "630"],
        ["property", "og:url", url],
        ["name", "twitter:card", "summary_large_image"],
        ["name", "twitter:image", largeImage],
      ]
    : [
        ["property", "og:site_name", "PlayNavi"],
        ["property", "og:type", "website"],
        ["property", "og:title", card.title],
        ["property", "og:description", card.description],
        ["property", "og:image", card.image_url],
        ["property", "og:url", url],
        ["name", "twitter:card", "summary"],
      ]).map(([attribute, name, value]) =>
    `    <meta ${attribute}="${name}" content="${escapeHtmlAttribute(value)}">`
  ).join("\n");
  return `${template.slice(0, insertion)}${tags}\n${template.slice(insertion)}`;
}
