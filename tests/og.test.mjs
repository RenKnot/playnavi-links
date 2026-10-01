import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import test from "node:test";
import sharp from "sharp";

import { cardText, loadSubsetFont, validLarge } from "../api/_lib/og-card.mjs";
import { ALLOWED_IMAGE_HOSTS } from "../api/_lib/og-large.mjs";
import {
  createOgHandler,
  FALLBACK_CACHE_CONTROL,
  FALLBACK_URL,
  OG_CACHE_CONTROL,
  ogTarget,
} from "../api/og.mjs";
import { renderPreviewHtml } from "../api/_lib/share-preview.mjs";
import { createSharePreviewHandler } from "../api/share-preview.mjs";

const CODE = "AbC_dEf-12345678";
const STORAGE = [...ALLOWED_IMAGE_HOSTS].find((host) => host.endsWith(".supabase.co"));
const COVER = "https://images.igdb.com/igdb/image/upload/t_cover_big/co1.jpg";
const COVER2 = "https://images.igdb.com/igdb/image/upload/t_cover_big/co2.jpg";
const AVATAR = `https://${STORAGE}/storage/v1/object/public/avatars/a.png`;
// Latin-only test text: the bundled Latin font covers it without network access.
const FONT = (await readFile(new URL("../node_modules/@vercel/og/dist/Geist-Regular.ttf", import.meta.url))).buffer;
const fontLoader = async () => FONT;
const IMAGE = await sharp({ create: { width: 60, height: 80, channels: 3, background: "#3366cc" } }).jpeg().toBuffer();

const GAME = { layout: "game", heading: "Ao log", title: "Elden Ring", publisher: "Bandai", developer: "FromSoftware", cover_url: COVER };
const PROFILE = {
  layout: "profile", name: "Ao", avatar_url: AVATAR, background_url: null,
  stats: { total: 10, playing: 1, completed: 2, streaming_completed: 3, dropped: 1, want_to_play: 3 },
};
const GRID = { layout: "grid", title: "Best", subtitle: "Ranking", ranked: true, cover_urls: [COVER, COVER2], total_count: 12 };

test("validLarge accepts the three layouts and normalizes key order", () => {
  assert.deepEqual(validLarge(GAME), GAME);
  assert.deepEqual(validLarge({ ...PROFILE, stats: null }), { ...PROFILE, stats: null });
  assert.deepEqual(validLarge(PROFILE), PROFILE);
  const gridOut = { ...GRID, description: null, owner_avatar_url: null };
  assert.deepEqual(validLarge(GRID), gridOut);
  // New optional grid fields pass through; unknown keys are dropped, not fatal.
  const withOwner = { ...GRID, description: "説明", owner_avatar_url: COVER };
  assert.deepEqual(validLarge({ ...withOwner, future_field: 1 }), withOwner);
  assert.deepEqual(validLarge({ ...GAME, extra: 1 }), GAME);
  assert.deepEqual(validLarge({ ...GRID, cover_urls: [], total_count: 0 }),
    { ...gridOut, cover_urls: [], total_count: 0 });
  assert.deepEqual(validLarge({ ...GAME, heading: null, publisher: null, developer: null, cover_url: null }),
    { ...GAME, heading: null, publisher: null, developer: null, cover_url: null });
});

test("validLarge rejects wrong types, long text, bad counts and disallowed image hosts", () => {
  const rejects = [
    null, "x", [], {}, { ...GAME, layout: "other" },
    { ...GAME, title: "" }, { ...GAME, title: 5 }, { ...GAME, title: "x".repeat(201) },
    { ...GAME, cover_url: "http://images.igdb.com/a.jpg" },
    { ...GAME, cover_url: "https://example.com/a.jpg" },
    { ...GAME, cover_url: "https://images.igdb.com.evil.example/a.jpg" },
    { ...GAME, cover_url: "https://user@images.igdb.com/a.jpg" },
    { ...PROFILE, stats: { ...PROFILE.stats, total: -1 } },
    { ...PROFILE, stats: { ...PROFILE.stats, total: 1.5 } },
    { ...PROFILE, stats: { ...PROFILE.stats, total: "1" } },
    { ...PROFILE, stats: { ...PROFILE.stats, total: Number.MAX_SAFE_INTEGER + 1 } },
    { ...PROFILE, stats: { total: 1 } },
    { ...PROFILE, stats: [] },
    { ...PROFILE, background_url: "javascript:alert(1)" },
    { ...GRID, ranked: "yes" }, { ...GRID, cover_urls: [COVER, COVER, COVER, COVER] },
    { ...GRID, cover_urls: ["https://example.com/a.jpg"] }, { ...GRID, total_count: -3 },
    { ...GRID, subtitle: null }, { ...GRID, owner_avatar_url: "https://example.com/a.png" },
    { ...GRID, description: "x".repeat(201) },
  ];
  for (const large of rejects) assert.equal(validLarge(large), null, JSON.stringify(large));
});

test("og targets accept exactly one code or path plus an optional version", () => {
  assert.deepEqual(ogTarget(`/api/og?code=${CODE}&v=abc123`), { param: "code", value: CODE });
  assert.deepEqual(ogTarget(`/api/og?path=${encodeURIComponent("/game/42")}`), { param: "path", value: "/game/42" });
  for (const bad of [
    "/api/og", `/api/og?code=${CODE}&path=%2Fgame%2F42`, `/api/og?code=${CODE}&code=${CODE}`,
    "/api/og?code=bad", "/api/og?path=%2Fnope", `/api/og?code=${CODE}&x=1`,
    `/api/og?code=${CODE}&v=${"a".repeat(33)}`, `/api/og?code=${CODE}&v=a.b`,
  ]) assert.equal(ogTarget(bad), null, bad);
});

test("card text covers dynamic strings and fixed labels, sorted and deduplicated", () => {
  const text = cardText(GAME);
  for (const character of "EldnRgFSoftware販売開発") assert.ok(text.includes(character), character);
  assert.equal(new Set(text).size, text.length);
});

test("font loader keeps the gstatic origin check", async () => {
  await assert.rejects(
    loadSubsetFont("x", 700, async () => new Response(
      "@font-face { src: url(https://example.org/font.ttf) format('truetype'); }",
    )),
    /Unexpected Japanese font origin/,
  );
});

function upstream(large, { failImages = false, metaStatus = 200 } = {}) {
  const seen = [];
  const fetchImpl = async (url) => {
    const href = String(url);
    seen.push(href);
    if (href.includes("/functions/v1/share-preview-meta")) {
      if (metaStatus !== 200) return new Response("no", { status: metaStatus });
      return Response.json({ status: "ok", card: { title: "t", description: "d", image_url: COVER, large } });
    }
    if (failImages) throw new Error("network down");
    return new Response(IMAGE);
  };
  return { fetchImpl, seen };
}

async function withServer(handler, check) {
  const server = createServer((request, response) => {
    Promise.resolve(handler(request, response)).catch((error) => {
      response.statusCode = 500;
      response.end(String(error));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await check(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function pngSize(buffer) {
  assert.deepEqual([...buffer.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

for (const [name, large] of [["game", GAME], ["profile", PROFILE], ["grid", GRID]]) {
  test(`a valid ${name} card renders a cacheable 1200x630 PNG`, async () => {
    const { fetchImpl, seen } = upstream(large);
    await withServer(createOgHandler({ fetchImpl, fontLoader }), async (origin) => {
      const response = await fetch(`${origin}/api/og?code=${CODE}&v=abc`, { redirect: "manual" });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "image/png");
      assert.equal(response.headers.get("cache-control"), OG_CACHE_CONTROL);
      assert.deepEqual(pngSize(Buffer.from(await response.arrayBuffer())), [1200, 630]);
    });
    const meta = new URL(seen[0]);
    assert.deepEqual([...meta.searchParams.keys()], ["code"]);
  });
}

test("image fetch failures degrade to placeholders and still return 200", async () => {
  const { fetchImpl } = upstream(GRID, { failImages: true });
  await withServer(createOgHandler({ fetchImpl, fontLoader }), async (origin) => {
    const response = await fetch(`${origin}/api/og?path=${encodeURIComponent("/catalogs/" + "12345678-1234-1234-1234-123456789abc")}`, { redirect: "manual" });
    assert.equal(response.status, 200);
    assert.deepEqual(pngSize(Buffer.from(await response.arrayBuffer())), [1200, 630]);
  });
});

test("upstream failures, missing large cards and bad parameters redirect to the static fallback", async () => {
  const cases = [
    [upstream(GAME, { metaStatus: 404 }).fetchImpl, `/api/og?code=${CODE}`],
    [upstream(undefined).fetchImpl, `/api/og?code=${CODE}`],
    [upstream({ ...GAME, cover_url: "https://example.com/x.jpg" }).fetchImpl, `/api/og?code=${CODE}`],
    [async () => { throw new Error("timeout"); }, `/api/og?code=${CODE}`],
    [upstream(GAME).fetchImpl, "/api/og?code=bad"],
    [upstream(GAME).fetchImpl, `/api/og?code=${CODE}&x=1`],
  ];
  for (const [fetchImpl, path] of cases) {
    await withServer(createOgHandler({ fetchImpl, fontLoader }), async (origin) => {
      const response = await fetch(`${origin}${path}`, { redirect: "manual" });
      assert.equal(response.status, 302, path);
      assert.equal(response.headers.get("location"), FALLBACK_URL);
      assert.equal(response.headers.get("cache-control"), FALLBACK_CACHE_CONTROL);
    });
  }
  await withServer(createOgHandler({ fetchImpl: upstream(GAME).fetchImpl, fontLoader }), async (origin) => {
    const response = await fetch(`${origin}/api/og?code=${CODE}`, { method: "POST" });
    assert.equal(response.status, 405);
  });
});

test("the static fallback image is a 1200x630 PNG", async () => {
  const buffer = await readFile(new URL("../og-fallback.png", import.meta.url));
  assert.deepEqual(pngSize(buffer), [1200, 630]);
});

test("vercel config routes /api/og to the Tokyo region with its drawn assets", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(config.functions?.["api/og.mjs"], { includeFiles: "{logo.png,assets/og/**}", regions: ["hnd1"] });
  assert.equal(config.functions?.["api/og-probe.mjs"], undefined);
  assert.equal(JSON.stringify(config).includes("og-probe"), false);
});

function recorder() {
  const headers = new Map();
  return {
    headers,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    status(status) { this.statusCode = status; return this; },
    send(body) { this.body = body; return this; },
  };
}
const template = await readFile(new URL("../index.html", import.meta.url), "utf8");
const tag = (html, name) => html.match(new RegExp(`<meta (?:property|name)="${name}" content="([^"]*)">`))?.[1];
const version = (large) => createHash("sha256").update(JSON.stringify(large)).digest("hex").slice(0, 12);

async function sharePage(request, large) {
  const response = recorder();
  await createSharePreviewHandler({ readTemplate: () => template, fetchImpl: upstream(large).fetchImpl })(
    { method: "GET", ...request },
    response,
  );
  return response;
}

test("share pages with a valid large card advertise the large image", async () => {
  const response = await sharePage({ headers: { host: "playnavi.app" }, query: { code: CODE } }, GAME);
  const image = `https://playnavi.app/api/og?code=${CODE}&amp;v=${version(GAME)}`;
  assert.equal(tag(response.body, "og:image"), image);
  assert.equal(tag(response.body, "og:image:width"), "1200");
  assert.equal(tag(response.body, "og:image:height"), "630");
  assert.equal(tag(response.body, "twitter:card"), "summary_large_image");
  assert.equal(tag(response.body, "twitter:image"), image);

  const canonical = await sharePage(
    { headers: { host: "links.playnavilab.com" }, query: { kind: "game", id: "42", logId: "12345678-1234-1234-1234-123456789abc" } }, GAME,
  );
  assert.equal(
    tag(canonical.body, "og:image"),
    `https://playnavi.app/api/og?path=%2Fgame%2F42%3FlogId%3D12345678-1234-1234-1234-123456789abc&amp;v=${version(GAME)}`,
  );
});

test("share pages without a valid large card keep the small card unchanged", async () => {
  for (const large of [undefined, { ...GAME, cover_url: "https://example.com/x.jpg" }]) {
    const response = await sharePage({ headers: { host: "playnavi.app" }, query: { code: CODE } }, large);
    assert.equal(tag(response.body, "og:image"), COVER);
    assert.equal(tag(response.body, "twitter:card"), "summary");
    assert.equal(tag(response.body, "twitter:image"), undefined);
    assert.equal(tag(response.body, "og:image:width"), undefined);
    assert.equal((response.body.match(/<meta (?:property="og:|name="twitter:)/g) ?? []).length, 7);
  }
  const card = { title: "t", description: "d", image_url: COVER };
  assert.equal(renderPreviewHtml(template, card, "https://playnavi.app/"),
    renderPreviewHtml(template, card, "https://playnavi.app/", null));
});

test("profile-cover presets are read from the bundled copies, never fetched", async () => {
  const { presetCoverFile, loadCardImages } = await import("../api/_lib/og-card.mjs");
  const host = "https://abcdefghijklmnop.supabase.co/storage/v1/object/public/profile-covers/presets/v1";
  assert.match(presetCoverFile(`${host}/profile_hero_9.webp`), /assets\/og\/profile-covers\/v1\/profile_hero_9\.webp$/);
  for (const bad of [`${host}/profile_hero_10.webp`, `${host}/../x.webp`, `${host}/profile_hero_1.webp?x=1`,
    "https://example.com/storage/v1/object/public/profile-covers/presets/v1/profile_hero_1.webp", null]) {
    assert.equal(presetCoverFile(bad), null, String(bad));
  }
  let fetched = 0;
  const images = await loadCardImages(
    { layout: "profile", name: "a", avatar_url: null, background_url: `${host}/profile_hero_2.webp`, stats: null },
    async () => { fetched += 1; throw new Error("network"); },
  );
  assert.equal(fetched, 0);
  assert.match(images.background ?? "", /^data:image\//);
});

test("an unloadable profile background falls back to the blurred avatar", async () => {
  const { loadCardImages } = await import("../api/_lib/og-card.mjs");
  const sharp = (await import("sharp")).default;
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#336699" } }).png().toBuffer();
  const avatar = "https://playnavi.app/a.png";
  const images = await loadCardImages(
    { layout: "profile", name: "a", avatar_url: avatar, background_url: "https://playnavi.app/missing.png", stats: null },
    async (url) => String(url) === avatar
      ? new Response(png, { status: 200, headers: { "content-type": "image/png" } })
      : new Response("", { status: 404 }),
  );
  assert.match(images.background ?? "", /^data:image\//);
});
