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
  OG_MOMENT_CACHE_CONTROL,
  ogTarget,
} from "../api/og.mjs";
import { largeVersion } from "../api/_lib/og-large.mjs";
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

const DIAGNOSIS = {
  layout: "diagnosis", name: "Ao", avatar_url: AVATAR, type_name: "Sage", title: "Seeker", type_code: "ebid",
  illustration_url: "https://playnavi.app/diagnosis/ebid.png", color: "#7C5CFF",
  axes: [
    { left: "PvP", right: "Deep", position: 0 }, { left: "Logic", right: "Feel", position: 70 },
    { left: "Solo", right: "Team", position: 45 }, { left: "Focus", right: "Wide", position: 100 },
  ],
};

test("validLarge accepts the diagnosis layout and drops unknown keys", () => {
  assert.deepEqual(validLarge(DIAGNOSIS), DIAGNOSIS);
  assert.deepEqual(validLarge({ ...DIAGNOSIS, extra: 1, axes: DIAGNOSIS.axes.map((a) => ({ ...a, x: 1 })) }), DIAGNOSIS);
  const nulls = { ...DIAGNOSIS, avatar_url: null, title: null, illustration_url: null, color: null };
  assert.deepEqual(validLarge(nulls), nulls);
  for (const code of ["cfsw", "ebid", "cbiw"]) assert.equal(validLarge({ ...DIAGNOSIS, type_code: code })?.type_code, code);
});

test("validLarge rejects malformed diagnosis payloads", () => {
  const axes = DIAGNOSIS.axes;
  const rejects = [
    { ...DIAGNOSIS, type_code: "abcd" }, { ...DIAGNOSIS, type_code: "EBID" }, { ...DIAGNOSIS, type_code: null },
    { ...DIAGNOSIS, color: "#FFF" }, { ...DIAGNOSIS, color: "red" }, { ...DIAGNOSIS, color: "#GGGGGG" },
    { ...DIAGNOSIS, axes: axes.slice(0, 3) }, { ...DIAGNOSIS, axes: [...axes, axes[0]] }, { ...DIAGNOSIS, axes: null },
    { ...DIAGNOSIS, axes: [{ ...axes[0], position: 101 }, ...axes.slice(1)] },
    { ...DIAGNOSIS, axes: [{ ...axes[0], position: -1 }, ...axes.slice(1)] },
    { ...DIAGNOSIS, axes: [{ ...axes[0], position: 50.5 }, ...axes.slice(1)] },
    { ...DIAGNOSIS, axes: [{ ...axes[0], position: "50" }, ...axes.slice(1)] },
    { ...DIAGNOSIS, axes: [{ ...axes[0], left: "x".repeat(11) }, ...axes.slice(1)] },
    { ...DIAGNOSIS, axes: [{ ...axes[0], right: "" }, ...axes.slice(1)] },
    { ...DIAGNOSIS, axes: [null, ...axes.slice(1)] },
    { ...DIAGNOSIS, name: "" }, { ...DIAGNOSIS, type_name: "" },
    { ...DIAGNOSIS, illustration_url: "https://example.com/a.png" },
    { ...DIAGNOSIS, avatar_url: "http://playnavi.app/a.png" },
  ];
  for (const large of rejects) assert.equal(validLarge(large), null, JSON.stringify(large));
});

test("diagnosis card text and every card subset include the ellipsis and drawn labels", () => {
  const text = cardText(DIAGNOSIS);
  for (const character of "…─ゲーマーDNA対戦没入論理感覚自立仲間集中広範SageSeekrPvPDpLgcFlTm") {
    assert.ok(text.includes(character), character);
  }
  assert.ok(cardText(GAME).includes("…"));
  assert.ok(cardText(PROFILE).includes("…"));
  assert.ok(cardText(GRID).includes("…"));
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

async function jpegSize(buffer) {
  assert.deepEqual([...buffer.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  const meta = await sharp(buffer).metadata();
  assert.equal(meta.format, "jpeg");
  return [meta.width, meta.height];
}

function pngSize(buffer) {
  assert.deepEqual([...buffer.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

for (const [name, large] of [["game", GAME], ["profile", PROFILE], ["grid", GRID], ["diagnosis", DIAGNOSIS]]) {
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

// ---------------------------------------------------------------- TASK-20261017-002 moment / log record

const PHOTO_PATH = `/storage/v1/object/sign/game-log-media-private/${"1".repeat(8)}-u/memories/m/p.jpg`;
const photo = (token) => `https://${STORAGE}${PHOTO_PATH}?token=${token}`;
const MOMENT = {
  layout: "moment", heading: "Ao moment", title: "Elden Ring", excerpt: "Beat the boss",
  spoiler: false, photo_url: photo("aaa"), cover_url: COVER,
};

test("validLarge accepts the moment layout; a spoiler drops text and photo", () => {
  assert.deepEqual(validLarge(MOMENT), MOMENT);
  assert.deepEqual(validLarge({ ...MOMENT, future_field: 1 }), MOMENT);
  assert.deepEqual(validLarge({ ...MOMENT, photo_url: null, excerpt: null, cover_url: null }),
    { ...MOMENT, photo_url: null, excerpt: null, cover_url: null });
  assert.deepEqual(validLarge({ ...MOMENT, spoiler: true }), { ...MOMENT, spoiler: true, excerpt: null, photo_url: null });
  const rejects = [
    { ...MOMENT, spoiler: "no" }, { ...MOMENT, heading: "" }, { ...MOMENT, title: null },
    { ...MOMENT, excerpt: "x".repeat(201) },
    // Only a signed URL of the private photo bucket on an allow-listed host.
    { ...MOMENT, photo_url: COVER },
    { ...MOMENT, photo_url: `https://${STORAGE}${PHOTO_PATH}` },
    { ...MOMENT, photo_url: `https://${STORAGE}/storage/v1/object/public/avatars/a.png?token=x` },
    { ...MOMENT, photo_url: `https://example.com${PHOTO_PATH}?token=x` },
    { ...MOMENT, cover_url: "https://example.com/a.jpg" },
  ];
  for (const large of rejects) assert.equal(validLarge(large), null, JSON.stringify(large));
});

test("log cards may add a satisfaction and review head; old payloads keep their shape and version", () => {
  const record = { ...GAME, score: 8.5, excerpt: "Great" };
  assert.deepEqual(validLarge(record), record);
  // null / absent fields are left out, so a game card hashes exactly as before.
  assert.deepEqual(validLarge({ ...GAME, score: null, excerpt: null }), GAME);
  assert.equal(largeVersion(validLarge({ ...GAME, score: null, excerpt: null })), largeVersion(GAME));
  for (const score of [-1, 10.5, 7.25, "9", Number.NaN]) {
    assert.equal(validLarge({ ...GAME, score }), null, String(score));
  }
  assert.equal(validLarge({ ...GAME, excerpt: "" }), null);
  assert.ok(cardText(record).includes("満"));
  assert.ok(cardText(record).includes("G"));
});

test("the moment image version ignores the photo signature but follows the photo itself", () => {
  const a = validLarge(MOMENT);
  const b = validLarge({ ...MOMENT, photo_url: photo("bbb") });
  assert.equal(largeVersion(a), largeVersion(b));
  assert.notEqual(largeVersion(a), largeVersion(validLarge({ ...MOMENT, photo_url: photo("aaa").replace("p.jpg", "q.jpg") })));
  assert.notEqual(largeVersion(a), largeVersion(validLarge({ ...MOMENT, excerpt: "Other" })));
});

for (const [name, large] of [
  ["moment with a photo", MOMENT],
  ["moment without a photo", { ...MOMENT, photo_url: null }],
  ["spoiler moment", { ...MOMENT, spoiler: true }],
  ["log with a satisfaction and review head", { ...GAME, score: 9, excerpt: "Great game" }],
]) {
  test(`a valid ${name} card renders a 1200x630 image`, async () => {
    const { fetchImpl, seen } = upstream(large);
    await withServer(createOgHandler({ fetchImpl, fontLoader }), async (origin) => {
      const response = await fetch(`${origin}/api/og?code=${CODE}&v=abc`, { redirect: "manual" });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"),
        large.layout === "moment" ? OG_MOMENT_CACHE_CONTROL : OG_CACHE_CONTROL);
      const body = Buffer.from(await response.arrayBuffer());
      // r3: a card that draws the poster's photo is JPEG (Bluesky thumb limit); the rest stay PNG.
      if (large.layout === "moment" && large.photo_url && !large.spoiler) {
        assert.equal(response.headers.get("content-type"), "image/jpeg");
        assert.deepEqual(await jpegSize(body), [1200, 630]);
      } else {
        assert.equal(response.headers.get("content-type"), "image/png");
        assert.deepEqual(pngSize(body), [1200, 630]);
      }
    });
    if (large.layout === "moment" && large.photo_url && !large.spoiler) {
      assert.ok(seen.includes(large.photo_url), "the signed photo is fetched while drawing");
    } else {
      assert.ok(!seen.some((url) => url.includes("/object/sign/")), "no photo fetched");
    }
  });
}

test("a moment photo that cannot be loaded falls back to the cover and still renders", async () => {
  const fetchImpl = async (url) => {
    const href = String(url);
    if (href.includes("/functions/v1/share-preview-meta")) {
      return Response.json({ status: "ok", card: { title: "t", description: "d", image_url: COVER, large: MOMENT } });
    }
    if (href.includes("/object/sign/")) return new Response("expired", { status: 400 });
    return new Response(IMAGE);
  };
  const { loadCardImages } = await import("../api/_lib/og-card.mjs");
  const images = await loadCardImages(validLarge(MOMENT), fetchImpl);
  assert.equal(images.photo, null);
  assert.match(images.cover ?? "", /^data:image\//);
  await withServer(createOgHandler({ fetchImpl, fontLoader }), async (origin) => {
    const response = await fetch(`${origin}/api/og?code=${CODE}`, { redirect: "manual" });
    assert.equal(response.status, 200);
  });
});

test("moment share pages advertise a large image whose URL is stable across signatures", async () => {
  const first = await sharePage({ headers: { host: "playnavi.app" }, query: { code: CODE } }, MOMENT);
  const second = await sharePage({ headers: { host: "playnavi.app" }, query: { code: CODE } },
    { ...MOMENT, photo_url: photo("zzz") });
  assert.equal(tag(first.body, "twitter:card"), "summary_large_image");
  assert.equal(tag(first.body, "og:image"), tag(second.body, "og:image"));
  // The signed photo URL never appears in the page itself.
  assert.equal(first.body.includes("token=aaa"), false);
  assert.equal(first.body.includes("/object/sign/"), false);
  const canonical = await sharePage({
    headers: { host: "links.playnavilab.com" },
    query: { kind: "game", id: "42", logId: "12345678-1234-1234-1234-123456789abc", moment: "abcdefab-cdef-cdef-cdef-abcdefabcdef" },
  }, MOMENT);
  assert.equal(
    tag(canonical.body, "og:image"),
    `https://playnavi.app/api/og?path=${encodeURIComponent("/game/42?logId=12345678-1234-1234-1234-123456789abc&moment=abcdefab-cdef-cdef-cdef-abcdefabcdef")}&amp;v=${largeVersion(validLarge(MOMENT))}`,
  );
});

test("an old links site shape (no moment layout) still gets a small card from a moment response", async () => {
  // validCard keeps title / description / image_url even when large is unknown to it.
  const response = await sharePage({ headers: { host: "playnavi.app" }, query: { code: CODE } }, { ...MOMENT, layout: "future" });
  assert.equal(tag(response.body, "twitter:card"), "summary");
  assert.equal(tag(response.body, "og:image"), COVER);
});

// ---------------------------------------------------------------- TASK-20261017-002 r3 (V1/V2)

const { chipText, collageSlots, drawsUserPhotos, formatDuration, isR3, reviewSlots, toJpeg, JPEG_MAX_BYTES, SAFE_BOTTOM, H: CARD_H } =
  await import("../api/_lib/og-card.mjs");
const signed = (name, token = "t") => `https://${STORAGE}/storage/v1/object/sign/game-log-media-private/u/memories/m/${name}?token=${token}`;
const image = (name, token) => ({ kind: "image", url: signed(name, token) });
const video = (name, duration_ms = 83_000, token) => ({ kind: "video", url: signed(name, token), duration_ms });
const R3_MOMENT = {
  ...MOMENT, photo_url: signed("a.jpg"),
  media: [video("v.jpg"), image("a.jpg"), image("b.jpg"), image("c.jpg")],
  counts: { photos: 3, videos: 1, text: true },
};
const R3_REVIEW = {
  ...GAME, heading: "Ao log", score: 8.5,
  media: [image("r1.jpg"), image("r2.jpg"), image("r3.jpg")],
  counts: { photos: 3, videos: 0, text: true }, spoiler: false,
};

test("r3: moment media and counts are validated entry by entry; bad entries are dropped, not fatal", () => {
  assert.deepEqual(validLarge(R3_MOMENT).media, R3_MOMENT.media);
  assert.deepEqual(validLarge(R3_MOMENT).counts, R3_MOMENT.counts);
  const noisy = validLarge({
    ...R3_MOMENT,
    media: [
      image("a.jpg"),
      { kind: "image", url: COVER }, // not the private bucket
      { kind: "image", url: signed("x.jpg").replace(/\?token=.*/, "") }, // unsigned
      { kind: "image", url: `https://${STORAGE}/storage/v1/object/public/avatars/a.png?token=x` },
      { kind: "image", url: `https://example.com/storage/v1/object/sign/game-log-media-private/a.jpg?token=x` },
      { kind: "audio", url: signed("y.jpg") }, null, "x", { kind: "image" },
      { kind: "video", url: signed("v.jpg"), duration_ms: "12" },
      { kind: "video", url: signed("w.jpg"), duration_ms: 1234.4, extra: 1 },
      image("b.jpg"), image("c.jpg"), image("d.jpg"),
    ],
  });
  assert.deepEqual(noisy.media, [
    image("a.jpg"),
    { kind: "video", url: signed("v.jpg"), duration_ms: null },
    { kind: "video", url: signed("w.jpg"), duration_ms: 1234 },
    image("b.jpg"),
  ], "at most 4, record order kept");
  // A broken counts object is dropped; the card still renders.
  assert.equal(validLarge({ ...R3_MOMENT, counts: { photos: -1, videos: 0, text: true } }).counts, undefined);
  assert.equal(validLarge({ ...R3_MOMENT, counts: "3" }).counts, undefined);
  assert.deepEqual(validLarge({ ...R3_MOMENT, media: "nope" }).media, []);
  // A spoiler moment never carries media, even if the payload had some.
  assert.deepEqual(validLarge({ ...R3_MOMENT, spoiler: true }).media, []);
  // Old payloads (no media / counts) keep their exact shape and version.
  assert.deepEqual(Object.keys(validLarge(MOMENT)), Object.keys(MOMENT));
  assert.equal(isR3(validLarge(MOMENT)), false);
  assert.equal(isR3(validLarge(GAME)), false);
  assert.equal(isR3(validLarge(R3_MOMENT)), true);
});

test("r3: review media are images only (at most 3) and a spoiler review carries none", () => {
  const review = validLarge({ ...R3_REVIEW, media: [video("v.jpg"), ...R3_REVIEW.media, image("r4.jpg")] });
  assert.deepEqual(review.media, R3_REVIEW.media);
  assert.equal(review.spoiler, false);
  assert.deepEqual(validLarge({ ...R3_REVIEW, spoiler: true }).media, []);
  assert.equal(validLarge({ ...R3_REVIEW, spoiler: "yes" }).spoiler, undefined);
  // A plain game card is untouched.
  assert.deepEqual(validLarge(GAME), GAME);
});

test("r3: the image version ignores media signatures but follows the stored objects", () => {
  const a = largeVersion(validLarge(R3_MOMENT));
  const resigned = { ...R3_MOMENT, photo_url: signed("a.jpg", "zz"), media: R3_MOMENT.media.map((item) => ({ ...item, url: item.url.replace("token=t", "token=zz") })) };
  assert.equal(largeVersion(validLarge(resigned)), a);
  assert.notEqual(largeVersion(validLarge({ ...R3_MOMENT, media: [image("other.jpg")] })), a);
  assert.equal(largeVersion(validLarge({ ...R3_REVIEW, media: R3_REVIEW.media.map((item) => ({ ...item, url: item.url.replace("token=t", "token=q") })) })),
    largeVersion(validLarge(R3_REVIEW)));
  // The share page advertises the same og:image URL on every read.
  assert.doesNotMatch(JSON.stringify(a), /token/);
});

test("r3: collage and review slots tile their box without overlap", () => {
  const box = { w: 640, h: 500 };
  for (const count of [1, 2, 3, 4]) {
    const slots = collageSlots(count);
    assert.equal(slots.length, count);
    for (const slot of slots) {
      assert.ok(slot.x >= 0 && slot.y >= 0 && slot.x + slot.w <= box.w && slot.y + slot.h <= box.h, JSON.stringify(slot));
    }
    for (let i = 0; i < slots.length; i += 1) {
      for (let j = i + 1; j < slots.length; j += 1) {
        const [p, q] = [slots[i], slots[j]];
        const overlap = p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
        assert.equal(overlap, false, `${count}: ${i}/${j}`);
      }
    }
  }
  assert.deepEqual(collageSlots(1), [{ x: 0, y: 0, w: 640, h: 500 }]);
  assert.equal(collageSlots(3)[0].h, 500, "3 = one large + two stacked");
  assert.equal(collageSlots(3)[1].x, collageSlots(3)[2].x);
  assert.equal(new Set(collageSlots(4).map((slot) => slot.w)).size, 1, "4 = 2x2");
  assert.deepEqual(reviewSlots(3).length, 3);
  // The collage (top 40 + 500) ends above X's bottom-left title band.
  assert.ok(40 + 500 <= CARD_H - SAFE_BOTTOM);
});

test("r3: the chip says what is behind the tap", () => {
  assert.equal(chipText(validLarge(R3_MOMENT)), "タップして見る｜動画 1・写真 3・全文");
  assert.equal(chipText(validLarge({ ...R3_MOMENT, counts: { photos: 2, videos: 0, text: false } })), "タップして見る｜写真 2");
  assert.equal(chipText(validLarge({ ...R3_MOMENT, media: [], counts: { photos: 0, videos: 0, text: false } })), "タップして見る");
  assert.equal(chipText(validLarge({ ...R3_MOMENT, spoiler: true })), "タップして見る｜ネタバレを含むモーメント");
  assert.equal(chipText(validLarge(R3_REVIEW)), "タップして見る｜満足度・感想の全文・写真 3");
  assert.equal(chipText(validLarge({ ...R3_REVIEW, media: [], counts: { photos: 0, videos: 0, text: true } })), "タップして見る｜満足度・感想の全文");
  assert.equal(chipText(validLarge({ ...R3_REVIEW, spoiler: true })), "タップして見る｜満足度・ネタバレを含む感想・写真 3");
  for (const character of "タップして見る｜動画写真全文・›:") assert.ok(cardText(validLarge(R3_MOMENT)).includes(character), character);
  assert.equal(formatDuration(83_000), "1:23");
  assert.equal(formatDuration(5_000), "0:05");
  assert.equal(formatDuration(null), null);
});

test("r3: only cards that draw the poster's photos are JPEG", () => {
  assert.equal(drawsUserPhotos(validLarge(R3_MOMENT)), true);
  assert.equal(drawsUserPhotos(validLarge({ ...R3_MOMENT, spoiler: true })), false);
  assert.equal(drawsUserPhotos(validLarge({ ...R3_MOMENT, media: [], photo_url: null })), false);
  assert.equal(drawsUserPhotos(validLarge(R3_REVIEW)), true);
  assert.equal(drawsUserPhotos(validLarge({ ...R3_REVIEW, media: [] })), false);
  for (const large of [GAME, PROFILE, GRID, DIAGNOSIS]) assert.equal(drawsUserPhotos(validLarge(large)), false);
});

// Random noise is the worst case for JPEG size.
const NOISE = await sharp(Buffer.from(Array.from({ length: 1600 * 1200 * 3 }, () => Math.floor(Math.random() * 256))),
  { raw: { width: 1600, height: 1200, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();

function r3Upstream(large) {
  const seen = [];
  const fetchImpl = async (url) => {
    const href = String(url);
    seen.push(href);
    if (href.includes("/functions/v1/share-preview-meta")) {
      return Response.json({ status: "ok", card: { title: "t", description: "d", image_url: COVER, large } });
    }
    return new Response(href.includes("/object/sign/") ? NOISE : IMAGE);
  };
  return { fetchImpl, seen };
}

for (const [name, large, type] of [
  ["moment collage (video + 3 photos)", R3_MOMENT, "image/jpeg"],
  ["moment with one photo", { ...R3_MOMENT, media: [image("a.jpg")] }, "image/jpeg"],
  ["review with 3 photos", R3_REVIEW, "image/jpeg"],
  ["spoiler moment", { ...R3_MOMENT, spoiler: true }, "image/png"],
  ["review without photos", { ...R3_REVIEW, media: [], counts: { photos: 0, videos: 0, text: true } }, "image/png"],
  ["text-only moment", { ...R3_MOMENT, photo_url: null, media: [], counts: { photos: 0, videos: 0, text: true } }, "image/png"],
]) {
  test(`r3: a ${name} card renders a 1200x630 ${type} within the size bound`, async () => {
    const { fetchImpl, seen } = r3Upstream(large);
    await withServer(createOgHandler({ fetchImpl, fontLoader }), async (origin) => {
      const response = await fetch(`${origin}/api/og?code=${CODE}&v=abc`, { redirect: "manual" });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), type);
      const body = Buffer.from(await response.arrayBuffer());
      if (type === "image/jpeg") {
        assert.deepEqual(await jpegSize(body), [1200, 630]);
        assert.ok(body.length <= JPEG_MAX_BYTES, `${body.length} bytes`);
      } else {
        assert.deepEqual(pngSize(body), [1200, 630]);
      }
    });
    const normalized = validLarge(large);
    for (const item of normalized.media ?? []) assert.ok(seen.includes(item.url), `fetched ${item.url}`);
    if (large.spoiler) assert.ok(!seen.some((url) => url.includes("/object/sign/")), "a spoiler card fetches no photo");
  });
}

test("r3: the JPEG encoder steps quality down to the byte limit and refuses beyond it", async () => {
  const png = await sharp(NOISE).resize(1200, 630).png().toBuffer();
  const loose = await toJpeg(png);
  assert.ok(loose.length <= JPEG_MAX_BYTES);
  const tight = await toJpeg(png, Math.round(loose.length * 0.6));
  assert.ok(tight.length <= Math.round(loose.length * 0.6) && tight.length < loose.length);
  await assert.rejects(toJpeg(png, 1000), /exceeds/);
});

test("r3: the share page advertises the large image with a version that survives re-signing", async () => {
  const first = await sharePage({ headers: { host: "playnavi.app" }, query: { code: CODE } }, R3_MOMENT);
  const second = await sharePage({ headers: { host: "playnavi.app" }, query: { code: CODE } },
    { ...R3_MOMENT, media: R3_MOMENT.media.map((item) => ({ ...item, url: item.url.replace("token=t", "token=new") })) });
  assert.equal(tag(first.body, "twitter:card"), "summary_large_image");
  assert.equal(tag(first.body, "og:image"), tag(second.body, "og:image"));
  assert.equal(first.body.includes("/object/sign/"), false);
});
