import { canonicalTargetFromPath, isValidShortCode } from "../../assets/link-routing.mjs";
import { largeImageUrl, validLarge } from "./og-large.mjs";

export const PREVIEW_META_URL =
  "https://irbtguncoatqfikctreq.supabase.co/functions/v1/share-preview-meta";

// TASK-20261017-002 r5: 記録のページの中身 (EF share-view)。リンクカードの EF と同じプロジェクト
export const SHARE_VIEW_URL = PREVIEW_META_URL.replace(/\/share-preview-meta$/, "/share-view");
// iOS Safari のアプリの帯 (入っていれば「開く」、無ければ「入手」)。App Store の番号は assets/app.mjs の APP_STORE_URL と同じ
export const APP_STORE_ID = "6756201875";

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
  const listId = single(query.listId);
  const logId = single(query.logId);
  // TASK-20261017-002: /game/{id}?logId={log}&moment={memory} (Vercel passes the
  // original query through the /game/:id rewrite). moment needs logId.
  const moment = logId === null ? null : single(query.moment);
  let path;
  switch (kind) {
    case "game":
      path = `/game/${id}${logId === null ? "" : `?logId=${logId}`}${moment === null ? "" : `&moment=${moment}`}`;
      break;
    case "user":
      path = `/users/${id}`;
      break;
    case "best_games":
      path = `/users/${id}/best-games`;
      break;
    case "diagnosis":
      path = `/users/${id}/diagnosis`;
      break;
    case "ranking":
      path = `/users/${ownerId}/custom-rankings/${rankingId}`;
      break;
    case "tier_list":
      path = `/users/${ownerId}/tier-lists/${listId}`;
      break;
    case "catalog":
      path = `/catalogs/${id}`;
      break;
    default:
      return null;
  }
  if (!canonicalTargetFromPath(path)) return null;
  const requiredKeys = {
    game: logId === null
      ? ["id", "kind"]
      : moment === null
      ? ["id", "kind", "logId"]
      : ["id", "kind", "logId", "moment"],
    user: ["id", "kind"],
    best_games: ["id", "kind"],
    diagnosis: ["id", "kind"],
    ranking: ["kind", "ownerId", "rankingId"],
    tier_list: ["kind", "listId", "ownerId"],
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

// ---- TASK-20261017-002 r5: 記録のページの中身を HTML に埋め込む ----
// 見る人がリンクカードをタップした先 (/s/<code> と /game/<id>?logId=…(&moment=…)) で、アプリもログインも無しに
// 記録の中身を 1 回の読み込みで見せる (SNS のアプリ内ブラウザでも速い)。中身は EF share-view (C2) の 200 の本文。

// モーメント・レビューになりうるリンクだけ share-view を聞く: 短縮リンク (種類はサーバでしか分からない) と
// 正規の /game/<id>?logId=… (そのまま share-view の path へ)。ほかの種類は聞かない
export function shareViewParam(target) {
  if (target?.upstreamParam === "code") return { name: "code", value: target.upstreamValue };
  if (target?.upstreamParam === "path") {
    const type = canonicalTargetFromPath(target.upstreamValue)?.type;
    if (type === "moment" || type === "log") return { name: "path", value: target.upstreamValue };
  }
  return null;
}

// EF share-view の 200 の本文を確かめる。形が違えば null (= 埋め込まない = 今の HTML のまま)。
// 中身の細かい確かめ (https の絵だけ等) は描く側 (assets/share-view.mjs shareModel) が行う
export function validShareView(payload, param) {
  if (payload?.status !== "ok" || !payload.view || typeof payload.view !== "object" || Array.isArray(payload.view)) {
    return null;
  }
  const view = payload.view;
  if (view.kind !== "moment" && view.kind !== "review") return null;
  if (typeof view.canonical_path !== "string") return null;
  const canonical = canonicalTargetFromPath(view.canonical_path);
  if (!canonical || canonical.type !== (view.kind === "moment" ? "moment" : "log")) return null;
  if (view.app_url !== canonical.canonicalUrl) return null;
  // 正規の住所で聞いた時は、その住所の中身だけ
  if (param?.name === "path" && view.canonical_path !== param.value) return null;
  return { status: "ok", view };
}

// <script type="application/json"> の中に置ける JSON (</script> で抜けない・JavaScript の改行の 2 文字も逃がす)
export function jsonForScript(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
  );
}

function shareViewTags(shareView) {
  if (!shareView) return [];
  return [
    `    <meta name="apple-itunes-app" content="${
      escapeHtmlAttribute(`app-id=${APP_STORE_ID}, app-argument=${shareView.view.app_url}`)
    }">`,
    // 描く部品を app.mjs と同時に読み始める (app.mjs は中身がある時だけ share-view.mjs を読み込む)
    `    <link rel="modulepreload" href="/assets/share-view.mjs">`,
    // r6 (Q2): 記録のページだけ書体を Noto Sans JP に (Web 版と同じ)。読めない時は端末の書体のまま (display=swap)
    `    <link rel="preconnect" href="https://fonts.googleapis.com">`,
    `    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
    `    <link rel="stylesheet" href="${escapeHtmlAttribute(RECORD_FONT_CSS)}">`,
    `    <script id="pn-share-view" type="application/json">${jsonForScript(shareView)}</script>`,
  ];
}

// r6: 記録のページの <html> に印を付け、色・書体・並びを部品が描く前から当てる (読み込み中に別の画面がちらつかない)。
// 部品が描けなかった時は assets/app.mjs が印を外す (= 今までの画面)
export const RECORD_PAGE_CLASS = "pn-rec-page";
export const RECORD_FONT_CSS = "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap";

function markRecordPage(template) {
  return template.replace(/<html\b([^>]*)>/, (whole, attributes) =>
    /\bclass=/.test(attributes) ? whole : `<html${attributes} class="${RECORD_PAGE_CLASS}">`
  );
}

export function renderPreviewHtml(template, card, url, largeImage = null, shareView = null) {
  if (shareView) template = markRecordPage(template);
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
  ).concat(shareViewTags(shareView)).join("\n");
  return `${template.slice(0, insertion)}${tags}\n${template.slice(insertion)}`;
}
