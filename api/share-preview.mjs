import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  GENERIC_CARD,
  PREVIEW_META_URL,
  previewTarget,
  renderPreviewHtml,
  validCard,
} from "./_lib/share-preview.mjs";

const TEMPLATE_PATH = join(process.cwd(), "index.html");
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

export function createSharePreviewHandler({
  fetchImpl = globalThis.fetch,
  readTemplate = () => readFile(TEMPLATE_PATH, "utf8"),
  metaUrl = PREVIEW_META_URL,
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
    const card = target?.upstreamParam ? await fetchCard(target, fetchImpl, metaUrl) : null;
    const html = renderPreviewHtml(
      template,
      card ?? GENERIC_CARD,
      target?.url ?? "https://playnavi.app/",
    );
    for (const [name, value] of Object.entries(DOCUMENT_HEADERS)) {
      response.setHeader(name, value);
    }
    return response.status(200).send(html);
  };
}

export default createSharePreviewHandler();
