import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  GENERIC_CARD,
  largeCardImageUrl,
  PREVIEW_META_URL,
  previewTarget,
  renderPreviewHtml,
  SHARE_VIEW_URL,
  shareViewParam,
  validCard,
  validShareView,
} from "./_lib/share-preview.mjs";

const TEMPLATE_PATH = join(process.cwd(), "link.html");
// The function runs in hnd1 next to the Tokyo Supabase project (vercel.json).
// Cold Edge Function starts can exceed 1.5s, and a timed-out fetch leaves the
// generic card in SNS caches, so allow up to 3s before falling back.
export const UPSTREAM_TIMEOUT_MS = 3000;
const DOCUMENT_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
};

async function fetchCard(target, fetchImpl, metaUrl) {
  const url = new URL(metaUrl);
  url.searchParams.set(target.upstreamParam, target.upstreamValue);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (response.status !== 200) return null;
    return validCard(await response.json());
  } catch {
    return null;
  }
}

// TASK-20261017-002 r5: 記録のページの中身 (EF share-view)。リンクカードと同時に聞き、同じ 3 秒で打ち切る。
// 失敗 (404・5xx・時間切れ・形が違う) はすべて null = 埋め込まない (カード・応答の頭・状態は今のまま)
async function fetchShareView(param, fetchImpl, viewUrl) {
  try {
    const url = new URL(viewUrl);
    url.searchParams.set(param.name, param.value);
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (response.status !== 200) return null;
    return validShareView(await response.json(), param);
  } catch {
    return null;
  }
}

export function createSharePreviewHandler({
  fetchImpl = globalThis.fetch,
  readTemplate = () => readFile(TEMPLATE_PATH, "utf8"),
  metaUrl = PREVIEW_META_URL,
  viewUrl = SHARE_VIEW_URL,
} = {}) {
  return async function handler(request, response) {
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      return response.status(405).send("Method Not Allowed");
    }

    let template;
    try {
      template = await readTemplate();
    } catch {
      return response.status(503).send("Page unavailable");
    }

    const target = previewTarget(request);
    const viewParam = shareViewParam(target);
    const [card, shareView] = await Promise.all([
      target?.upstreamParam ? fetchCard(target, fetchImpl, metaUrl) : null,
      viewParam ? fetchShareView(viewParam, fetchImpl, viewUrl) : null,
    ]);
    const html = renderPreviewHtml(
      template,
      card ?? GENERIC_CARD,
      target?.url ?? "https://playnavi.app/",
      largeCardImageUrl(card, target),
      shareView,
    );
    for (const [name, value] of Object.entries(DOCUMENT_HEADERS)) {
      response.setHeader(name, value);
    }
    return response.status(200).send(html);
  };
}

export default createSharePreviewHandler();
