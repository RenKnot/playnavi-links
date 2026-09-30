import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createOgProbeHandler,
  loadSubsetFont,
  PROBE_CACHE_CONTROL,
  PROBE_HEIGHT,
  PROBE_TEXT,
  PROBE_WIDTH,
} from "../api/og-probe.mjs";

test("the font request includes only the Japanese proof text and accepts a TrueType subset", async () => {
  const font = new Uint8Array([0, 1, 0, 0, 1]);
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(String(url));
    return seen.length === 1
      ? new Response(
          "@font-face { src: url(https://fonts.gstatic.com/probe.ttf) format('truetype'); }",
        )
      : new Response(font);
  };
  const result = await loadSubsetFont(fetchImpl);
  assert.deepEqual(new Uint8Array(result), font);
  assert.equal(new URL(seen[0]).searchParams.get("text"), PROBE_TEXT);
  assert.equal(seen[1], "https://fonts.gstatic.com/probe.ttf");
});

test("the font loader rejects a stylesheet that redirects font loading elsewhere", async () => {
  await assert.rejects(
    loadSubsetFont(async () => new Response(
      "@font-face { src: url(https://example.org/font.ttf) format('truetype'); }",
    )),
    /Unexpected Japanese font origin/,
  );
});

test("the proof endpoint is inert in production and only accepts GET", async () => {
  let fontLoads = 0;
  const fontLoader = async () => { fontLoads += 1; };
  const production = createOgProbeHandler({ deploymentEnv: "production", fontLoader });
  assert.equal((await production({ method: "GET" })).status, 404);
  const unknown = createOgProbeHandler({ deploymentEnv: "unknown", fontLoader });
  assert.equal((await unknown({ method: "GET" })).status, 404);

  const preview = createOgProbeHandler({ deploymentEnv: "preview", fontLoader });
  const methodResponse = await preview({ method: "POST" });
  assert.equal(methodResponse.status, 405);
  assert.equal(methodResponse.headers.get("Allow"), "GET");
  assert.equal(fontLoads, 0);
});

test("the proof response has the PNG dimensions and a short CDN cache policy", async () => {
  assert.equal(PROBE_WIDTH, 1200);
  assert.equal(PROBE_HEIGHT, 630);
  assert.match(PROBE_CACHE_CONTROL, /s-maxage=600/);
  assert.doesNotMatch(PROBE_CACHE_CONTROL, /immutable/);
});

test("live Google Fonts subset renders an actual 1200×630 Japanese PNG", {
  skip: process.env.PLAYNAVI_OG_PROBE_LIVE !== "1",
}, async () => {
  const preview = createOgProbeHandler({ deploymentEnv: "preview" });
  const response = await preview({ method: "GET" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("cache-control"), PROBE_CACHE_CONTROL);

  const png = Buffer.from(await response.arrayBuffer());
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), PROBE_WIDTH);
  assert.equal(png.readUInt32BE(20), PROBE_HEIGHT);
  assert.ok(png.length > 10_000);
});
