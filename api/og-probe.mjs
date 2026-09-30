import { ImageResponse } from "@vercel/og";
import { createElement } from "react";

export const PROBE_TEXT = "ゼルダの伝説　ティアーズ オブ ザ キングダム";
export const PROBE_WIDTH = 1200;
export const PROBE_HEIGHT = 630;
export const PROBE_CACHE_CONTROL =
  "public, max-age=0, s-maxage=600, stale-while-revalidate=86400";

const FONT_STYLESHEET_URL = new URL(
  `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&text=${encodeURIComponent(PROBE_TEXT)}`,
);
const FONT_TIMEOUT_MS = 2200;

export async function loadSubsetFont(fetchImpl = globalThis.fetch) {
  const signal = AbortSignal.timeout(FONT_TIMEOUT_MS);
  const stylesheet = await fetchImpl(FONT_STYLESHEET_URL, {
    signal,
    headers: { Accept: "text/css" },
  });
  if (!stylesheet.ok) throw new Error("Japanese font stylesheet unavailable");

  const css = await stylesheet.text();
  const fontSource = css.match(
    /src:\s*url\(([^)]+)\)\s*format\(['"](truetype|opentype)['"]\)/,
  );
  if (!fontSource) throw new Error("No supported Japanese font in stylesheet");
  const fontUrl = new URL(fontSource[1].replace(/^['"]|['"]$/g, ""));
  if (fontUrl.protocol !== "https:" || fontUrl.hostname !== "fonts.gstatic.com") {
    throw new Error("Unexpected Japanese font origin");
  }

  const fontResponse = await fetchImpl(fontUrl, { signal });
  if (!fontResponse.ok) throw new Error("Japanese font unavailable");
  const fontData = await fontResponse.arrayBuffer();
  if (fontData.byteLength < 4 || fontData.byteLength > 500_000) {
    throw new Error("Invalid Japanese font size");
  }
  const magic = new DataView(fontData).getUint32(0);
  if (magic !== 0x00010000 && magic !== 0x4f54544f) {
    throw new Error("Unsupported Japanese font format");
  }
  return fontData;
}

let fontPromise;
function getFont() {
  fontPromise ??= loadSubsetFont().catch((error) => {
    fontPromise = undefined;
    throw error;
  });
  return fontPromise;
}

// Preview deployments sit behind Vercel Authentication, so the probe is
// measured on production. It renders one fixed image and takes no input.
export function createOgProbeHandler({ fontLoader = getFont } = {}) {
  return async function handler(request, response) {
    if (request.method !== "GET") {
      response.statusCode = 405;
      response.setHeader("Allow", "GET");
      return response.end("Method Not Allowed");
    }
    // The CDN keys on the query string; refusing it keeps every request on
    // the single cached image instead of forcing a fresh render.
    if (new URL(request.url, "https://playnavi.app").search !== "") {
      response.statusCode = 404;
      response.setHeader("Cache-Control", "no-store");
      return response.end("Not Found");
    }

    try {
      const font = await fontLoader();
      const element = createElement(
        "div",
        {
          style: {
            display: "flex",
            width: "100%",
            height: "100%",
            alignItems: "center",
            justifyContent: "center",
            padding: 72,
            backgroundColor: "#101b34",
            color: "#ffffff",
            fontFamily: "Noto Sans JP",
            fontSize: 68,
            lineHeight: 1.35,
            textAlign: "center",
          },
        },
        PROBE_TEXT,
      );
      const image = new ImageResponse(element, {
        width: PROBE_WIDTH,
        height: PROBE_HEIGHT,
        fonts: [{ name: "Noto Sans JP", data: font, weight: 700, style: "normal" }],
      });
      const png = Buffer.from(await image.arrayBuffer());
      response.statusCode = 200;
      response.setHeader("Content-Type", "image/png");
      response.setHeader("Cache-Control", PROBE_CACHE_CONTROL);
      return response.end(png);
    } catch (error) {
      console.error("OG feasibility probe failed:", error);
      response.statusCode = 503;
      response.setHeader("Cache-Control", "no-store");
      return response.end("Image unavailable");
    }
  };
}

export default createOgProbeHandler();
