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
const template = await readFile(new URL("../link.html", import.meta.url), "utf8");
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

const { authorName, drawsUserPhotos, servesJpeg, formatDuration, isR3, toJpeg, JPEG_MAX_BYTES, W: CARD_W, H: CARD_H } =
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
      image("b.jpg"), image("c.jpg"), image("d.jpg"), image("e.jpg"), image("f.jpg"), image("g.jpg"), image("h.jpg"),
    ],
  });
  // TASK-20261021-002 (10/29): モーメントのカードも 8 まで (写真 10 + 動画 1 を一緒に付けられる)
  assert.deepEqual(noisy.media, [
    image("a.jpg"),
    { kind: "video", url: signed("v.jpg"), duration_ms: null },
    { kind: "video", url: signed("w.jpg"), duration_ms: 1234 },
    image("b.jpg"), image("c.jpg"), image("d.jpg"), image("e.jpg"), image("f.jpg"),
  ], "at most 8, record order kept");
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

test("r3/r11: review media are images only (r11: at most 8 of the 10 a review can carry) and a spoiler review carries none", () => {
  const ten = Array.from({ length: 10 }, (_, i) => image(`r${i + 1}.jpg`));
  const review = validLarge({ ...R3_REVIEW, media: [video("v.jpg"), ...ten] });
  assert.deepEqual(review.media, ten.slice(0, 8));
  assert.deepEqual(validLarge(R3_REVIEW).media, R3_REVIEW.media);
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

test("TASK-20261021-002 10/29: a video still converting gives the same card version as after conversion", () => {
  // 変換中: 表紙 (同じ保存先) + アプリが測った長さ。変換の後: 表紙は同じ・署名と長さ (ms) だけ違う
  const converting = { ...R3_MOMENT, media: [{ kind: "video", url: signed("v.jpg"), duration_ms: 12_340 }, ...R3_MOMENT.media.slice(1)] };
  const converted = { ...R3_MOMENT, media: [{ kind: "video", url: signed("v.jpg", "zz"), duration_ms: 12_017 }, ...R3_MOMENT.media.slice(1)] };
  assert.equal(largeVersion(validLarge(converted)), largeVersion(validLarge(converting)));
  // 描く長さ (秒) が変われば版も変わる
  const longer = { ...R3_MOMENT, media: [{ kind: "video", url: signed("v.jpg"), duration_ms: 13_000 }, ...R3_MOMENT.media.slice(1)] };
  assert.notEqual(largeVersion(validLarge(longer)), largeVersion(validLarge(converting)));
});

test("r7 P3/P4: the poster is the hero — author name / icon are validated, the old heading still gives the name", () => {
  const avatar = `https://${STORAGE}/storage/v1/object/public/avatars/hinata.png`;
  const moment = validLarge({ ...R3_MOMENT, author_name: " Hinata ", author_avatar_url: avatar });
  assert.equal(moment.author_name, "Hinata");
  assert.equal(moment.author_avatar_url, avatar);
  assert.equal(authorName(moment), "Hinata");
  const review = validLarge({ ...R3_REVIEW, author_name: "Ao", author_avatar_url: "https://evil.example/a.png" });
  assert.equal(review.author_avatar_url, null, "a disallowed icon host is dropped, not fatal");
  // Without author_name (older edge function) the keys stay out (same version hash) and the name comes from the heading.
  assert.equal("author_name" in validLarge(R3_MOMENT), false);
  assert.equal(largeVersion(validLarge({ ...R3_MOMENT, author_name: 7 })), largeVersion(validLarge(R3_MOMENT)));
  assert.equal(authorName(validLarge({ ...R3_MOMENT, heading: "ひなたさんのモーメント" })), "ひなた");
  assert.equal(authorName(validLarge({ ...R3_REVIEW, heading: "あおさんのプレイ記録" })), "あお");
  assert.equal(authorName(validLarge({ ...R3_REVIEW, heading: null })), "ユーザー");
  for (const ch of "Hinata満足度/10›") assert.ok(cardText(moment).includes(ch), ch);
});

test("r3: the video duration is drawn as m:ss", () => {
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
  // r9: a spoiler review draws no photo either
  assert.equal(drawsUserPhotos(validLarge({ ...R3_REVIEW, spoiler: true })), false);
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
  ["spoiler moment", { ...R3_MOMENT, spoiler: true }, "image/jpeg"],
  ["review without photos", { ...R3_REVIEW, media: [], counts: { photos: 0, videos: 0, text: true } }, "image/jpeg"],
  ["text-only moment", { ...R3_MOMENT, photo_url: null, media: [], counts: { photos: 0, videos: 0, text: true } }, "image/jpeg"],
  ["r7 moment with the poster's icon", { ...R3_MOMENT, author_name: "Ao", author_avatar_url: AVATAR }, "image/jpeg"],
  ["r7 text-only review with the poster's icon", { ...R3_REVIEW, media: [], counts: { photos: 0, videos: 0, text: true }, author_name: "Ao", author_avatar_url: AVATAR }, "image/jpeg"],
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

test("card titles break at spaces when every chunk fits a line (TASK-20261017-002: no 「そ / して」 mid-word breaks)", async () => {
  const { titleWordBreak } = await import("../api/_lib/og-card.mjs");
  assert.deepEqual(titleWordBreak("『ドラゴンクエストIII そして伝説へ… (HD-2D版)』", 38, 460), { wordBreak: "keep-all" });
  assert.deepEqual(titleWordBreak("ファイアーエムブレム聖戦の系譜", 38, 460), {});
  assert.deepEqual(titleWordBreak("とてもとてもとてもとても長い題名の塊 です", 46, 300), {});
});

test("hyphens between letters/digits in card titles do not break (HD-2D)", async () => {
  const { titleText } = await import("../api/_lib/og-card.mjs");
  assert.equal(titleText("(HD-2D版)"), "(HD‑2D版)");
  assert.equal(titleText("ー - ー"), "ー - ー");
});

// ---------------------------------------------------------------- TASK-20261017-002 r8 (§12.2) の play_media
// r12 (Emiya 10/21「シェアは投稿単位」): 古い形の payload の play_media は受け取るが、カードには一切描かない

const { CARD_TILES_MAX, cardItems } = await import("../api/_lib/og-card.mjs");
const playSigned = (name) => `https://${STORAGE}/storage/v1/object/sign/game-log-media-private/u/memories/p/${name}?token=t`;
const PLAY_MEDIA = [
  { kind: "image", url: playSigned("1.jpg") }, { kind: "image", url: playSigned("2.jpg") }, { kind: "image", url: playSigned("3.jpg") },
  { kind: "video", url: playSigned("p.jpg"), duration_ms: 9_000 }, { kind: "image", url: playSigned("4.jpg") },
];
const TEXT_ONLY = { ...R3_MOMENT, photo_url: null, media: [], counts: { photos: 0, videos: 0, text: true }, author_name: "ひなた", author_avatar_url: AVATAR,
  play_media: PLAY_MEDIA, play_media_total: 7, play_media_counts: { photos: 6, videos: 1 } };
const NO_PHOTO_REVIEW = { ...R3_REVIEW, media: [], counts: { photos: 0, videos: 0, text: true }, author_name: "ひなた", author_avatar_url: AVATAR,
  play_media: PLAY_MEDIA.slice(0, 3), play_media_total: 3, play_media_counts: { photos: 3, videos: 0 } };

test("r8/r11: play_media is validated like media (signed private photos, r11: at most 8), the total never below the drawn count; absent keys keep the old shape", () => {
  const large = validLarge({ ...TEXT_ONLY, play_media: [...PLAY_MEDIA, { kind: "image", url: COVER }, { kind: "image", url: playSigned("5.jpg") }] });
  assert.deepEqual(large.play_media, [...PLAY_MEDIA, { kind: "image", url: playSigned("5.jpg") }]);
  const ten = Array.from({ length: 10 }, (_, i) => ({ kind: "image", url: playSigned(`t${i}.jpg`) }));
  assert.deepEqual(validLarge({ ...TEXT_ONLY, play_media: ten }).play_media, ten.slice(0, 8));
  // r11: その記録の写真があっても、埋める分の play_media を受け取る (モーメントもレビューも)
  assert.deepEqual(validLarge({ ...R3_MOMENT, play_media: ten.slice(0, 4), play_media_total: 12 }).play_media, ten.slice(0, 4));
  assert.deepEqual(validLarge({ ...R3_REVIEW, play_media: ten.slice(0, 5), play_media_total: 12 }).play_media, ten.slice(0, 5));
  assert.equal(large.play_media_total, 7);
  assert.deepEqual(large.play_media_counts, { photos: 6, videos: 1 });
  assert.equal(validLarge({ ...TEXT_ONLY, play_media_total: 2 }).play_media_total, 5);
  assert.deepEqual(validLarge({ ...TEXT_ONLY, play_media_counts: "x" }).play_media_counts, { photos: 4, videos: 1 });
  assert.equal(validLarge({ ...TEXT_ONLY, play_media_total: -1 }).play_media, undefined);
  // ネタバレのモーメントは持たない
  assert.deepEqual(validLarge({ ...TEXT_ONLY, spoiler: true }).play_media, []);
  // 鍵が無い古い形はそのまま (版の hash も変わらない)
  assert.equal("play_media" in validLarge(R3_MOMENT), false);
  assert.equal("play_media" in validLarge(R3_REVIEW), false);
  assert.ok(validLarge(NO_PHOTO_REVIEW).play_media.length === 3);
});

test("r12: the play's photos never count as drawn photos; the record card stays a JPEG (cover card)", () => {
  assert.equal(drawsUserPhotos(validLarge(TEXT_ONLY)), false);
  assert.equal(drawsUserPhotos(validLarge(NO_PHOTO_REVIEW)), false);
  assert.equal(drawsUserPhotos(validLarge({ ...TEXT_ONLY, spoiler: true })), false);
  assert.equal(drawsUserPhotos(validLarge({ ...R3_MOMENT, ...TEXT_ONLY, media: [image("a.jpg")] })), true);
  assert.equal(servesJpeg(validLarge(TEXT_ONLY)), true);
  assert.equal(servesJpeg(validLarge(NO_PHOTO_REVIEW)), true);
});

for (const [name, large] of [["text-only moment with the play's photos", TEXT_ONLY], ["review without photos with the play's photos", NO_PHOTO_REVIEW]]) {
  test(`r12: a ${name} renders a 1200x630 JPEG and never fetches the play's photos`, async () => {
    const { fetchImpl, seen } = r3Upstream(large);
    await withServer(createOgHandler({ fetchImpl, fontLoader }), async (origin) => {
      const response = await fetch(`${origin}/api/og?code=${CODE}&v=abc`, { redirect: "manual" });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "image/jpeg");
      const body = Buffer.from(await response.arrayBuffer());
      assert.deepEqual(await jpegSize(body), [1200, 630]);
      assert.ok(body.length <= JPEG_MAX_BYTES, `${body.length} bytes`);
    });
    for (const item of validLarge(large).play_media) assert.ok(!seen.includes(item.url), `not fetched ${item.url}`);
  });
}

test("r8: the version hash survives re-signing the play's photos", async () => {
  const first = await sharePage({ headers: { host: "playnavi.app" }, query: { code: CODE } }, TEXT_ONLY);
  const second = await sharePage({ headers: { host: "playnavi.app" }, query: { code: CODE } },
    { ...TEXT_ONLY, play_media: TEXT_ONLY.play_media.map((item) => ({ ...item, url: item.url.replace("token=t", "token=new") })) });
  assert.equal(tag(first.body, "og:image"), tag(second.body, "og:image"));
  const old = await sharePage({ headers: { host: "playnavi.app" }, query: { code: CODE } }, { ...TEXT_ONLY, play_media: undefined, play_media_total: undefined, play_media_counts: undefined });
  assert.notEqual(tag(first.body, "og:image"), tag(old.body, "og:image"));
});

// ---------------------------------------------------------------- TASK-20261017-002 r9: 写真・動画が主役・印なし・右下の遷移文言

const { CTA_LABELS, SPOILER_LABEL, cardElement, ctaText, headerWidths, loadCardImages, loadStaticAssets, recordMode, renderCardImage, titleText } =
  await import("../api/_lib/og-card.mjs");
const { layoutCard, BOX } = await import("../api/_lib/card-layout.mjs");
const { chromePlacement, ctaOverTile, ctaWidth, CTA_SAFE_LEFT } = await import("../api/_lib/og-card.mjs");
const LANDSCAPE = await sharp({ create: { width: 320, height: 180, channels: 3, background: "#cc6633" } }).jpeg().toBuffer();
const PORTRAIT = await sharp({ create: { width: 300, height: 400, channels: 3, background: "#3366cc" } }).jpeg().toBuffer();
const imageFetch = (buffer) => async () => new Response(buffer);
// 描く要素の木をたどって、字と画像の src を集める
function collect(node, out = { texts: [], srcs: [] }) {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (Array.isArray(node)) { for (const child of node) collect(child, out); return out; }
  if (typeof node === "string" || typeof node === "number") { out.texts.push(String(node)); return out; }
  if (node.type === "img") out.srcs.push(node.props.src);
  collect(node.props?.children, out);
  return out;
}
const R9_ASSETS = { logo: "data:image/png;base64,TE9HTw==", logoHeight: 40, badges: [] };
const R9_PLAY = { play_media: PLAY_MEDIA, play_media_total: 7, play_media_counts: { photos: 6, videos: 1 } };
const R9_CASES = [
  ["moment with 3 photos", { ...R3_MOMENT, media: [image("a.jpg"), image("b.jpg"), image("c.jpg")], author_name: "ひなた" }, "own"],
  ["moment with 1 video", { ...R3_MOMENT, media: [video("v.jpg", 9_000)], author_name: "ひなた" }, "own"],
  ["review with photos", { ...R3_REVIEW, author_name: "ひなた" }, "own"],
  // r12: 同じプレイに写真があっても、その記録に無ければ表紙のカード
  ["text-only moment, the play has photos", { ...TEXT_ONLY }, "plain"],
  ["review without photos, the play has photos", { ...NO_PHOTO_REVIEW }, "plain"],
  ["moment with 1 photo, the play has photos", { ...TEXT_ONLY, media: [image("a.jpg")] }, "own"],
  ["text-only moment, nothing in the play", { ...R3_MOMENT, photo_url: null, media: [], author_name: "ひなた" }, "plain"],
  ["review without photos, nothing in the play", { ...R3_REVIEW, media: [], author_name: "ひなた" }, "plain"],
  ["spoiler moment", { ...R3_MOMENT, spoiler: true, author_name: "ひなた", ...R9_PLAY }, "spoiler"],
  ["spoiler review", { ...R3_REVIEW, spoiler: true, author_name: "ひなた", ...R9_PLAY }, "spoiler"],
];
const R9_CTA = {
  own: "写真・動画をすべて見る ›", spoiler: "タップして見る ›",
};

test("r9: the CTA says where the tap goes, never counts, never the bare word 画像", async () => {
  for (const [name, raw, mode] of R9_CASES) {
    const large = validLarge(raw);
    const images = await loadCardImages(large, imageFetch(LANDSCAPE));
    assert.equal(recordMode(large, images), mode, name);
    const expected = R9_CTA[mode] ?? (large.layout === "moment" ? "モーメントを見る ›" : "レビューを見る ›");
    assert.equal(ctaText(large, mode), expected, name);
    const { texts } = collect(cardElement(large, images, R9_ASSETS));
    assert.ok(texts.includes(expected.replace(/ ›$/, "")), `${name}: CTA drawn`);
    for (const text of texts) {
      assert.doesNotMatch(text, /\d+\s*(枚|件|本)|写真 \d|動画 \d/, `${name}: no counts (${text})`);
      assert.doesNotMatch(text.replace(/写真・動画/g, ""), /画像/, `${name}: no 画像`);
    }
    assert.ok(!texts.includes("このプレイの写真・動画を見る"), `${name}: r12 no play CTA`);
    if (mode === "spoiler") assert.ok(texts.includes(SPOILER_LABEL), `${name}: spoiler label`);
    else assert.ok(!texts.includes(SPOILER_LABEL), `${name}: no spoiler label`);
  }
  for (const label of Object.values(CTA_LABELS)) for (const ch of label) assert.ok(cardText(validLarge(R3_MOMENT)).includes(ch), ch);
  assert.deepEqual(Object.keys(CTA_LABELS).sort(), ["moment", "own", "review", "spoiler"], "r12: no play CTA");
});

test("r9: no PlayNavi logo or mark on the record cards (the static assets no longer carry the mark)", async () => {
  for (const [name, raw] of R9_CASES) {
    const large = validLarge(raw);
    const { srcs } = collect(cardElement(large, await loadCardImages(large, imageFetch(LANDSCAPE)), R9_ASSETS));
    assert.ok(!srcs.includes(R9_ASSETS.logo), `${name}: no logo`);
  }
  assert.equal("mark" in (await loadStaticAssets()), false);
});

test("r9: the small header carries the poster's name (left) and the game title (right); the two never overlap", async () => {
  for (const [name, raw] of R9_CASES) {
    const large = validLarge(raw);
    const { texts } = collect(cardElement(large, await loadCardImages(large, imageFetch(LANDSCAPE)), R9_ASSETS));
    assert.ok(texts.includes(authorName(large)), `${name}: author`);
    assert.ok(texts.includes(titleText(large.title)), `${name}: title`);
    if (large.layout === "game" && mode(raw) !== "spoiler") assert.ok(texts.includes("満足度") && texts.includes("8.5"), `${name}: score`);
  }
  const longName = "とても長い名前のゲーマー・ひなたのサブアカウント2号".repeat(2);
  const longTitle = "ゼルダの伝説 ティアーズ オブ ザ キングダム Nintendo Switch 2 Edition + ゼルダノート 完全版";
  for (const options of [{}, { thumb: true }, { thumb: true, score: 9.5 }]) {
    const widths = headerWidths(longName, longTitle, options);
    assert.ok(widths.name + widths.title <= widths.room, JSON.stringify(widths));
    assert.ok(widths.name >= 200 && widths.title >= 200, JSON.stringify(widths));
  }
  const short = headerWidths("ひなた", "Elden Ring", { thumb: true });
  assert.ok(short.name >= 3 * 24 && short.title >= 10 * 22 * 0.6, "short texts are not cut");
});
function mode(raw) { return raw.spoiler === true ? "spoiler" : "other"; }

test("r10: the poster's photos are drawn uncropped in the shared layout, a portrait one too", async () => {
  const one = validLarge({ ...R3_MOMENT, media: [image("a.jpg")] });
  const portrait = await loadCardImages(one, imageFetch(PORTRAIT));
  assert.equal(portrait.tiles.length, 1);
  assert.deepEqual(portrait.tiles[0].slot, layoutCard([300 / 400]).slots[0]);
  assert.equal(portrait.tiles[0].slot.h, BOX.h, "a portrait photo is as tall as the box");
  assert.match(portrait.tiles[0].image ?? "", /^data:image\//);
  assert.match(portrait.tilesBackground ?? "", /^data:image\//, "the first photo blurred behind");
  assert.equal(recordMode(one, portrait), "own");
  // 写真の大きさに縮めるだけ (切らない): 描く絵の縦横 = 枠の縦横
  const drawn = await sharp(Buffer.from(portrait.tiles[0].image.split(",")[1], "base64")).metadata();
  assert.ok(Math.abs(drawn.width / drawn.height - 0.75) < 0.01, `${drawn.width}x${drawn.height}`);
  // 縦長 + 横長: どちらも切らない
  const mixed = await loadCardImages(validLarge({ ...R3_MOMENT, media: [image("p.jpg"), image("l.jpg")] }),
    async (url) => new Response(String(url).includes("/p.jpg") ? PORTRAIT : LANDSCAPE));
  assert.deepEqual(mixed.tiles.map((tile) => tile.slot), layoutCard([0.75, 16 / 9]).slots);
  // 読めない写真は外して、読めた物だけで並べる
  const broken = await loadCardImages(validLarge({ ...R3_MOMENT, media: [image("x.jpg"), image("a.jpg")] }),
    async (url) => new Response(String(url).includes("/x.jpg") ? "not an image" : LANDSCAPE));
  assert.equal(broken.tiles.length, 1);
  assert.equal(broken.tiles[0].item.url, signed("a.jpg"));
});

test("r10/r12: over the photos, the CTA sits inside the right-most bottom tile it fits in (never hides a small tile), right of the card's middle, else in the card corner", async () => {
  const label = CTA_LABELS.own;
  const fixture = JSON.parse(await readFile(new URL("./fixtures/card-layout-cases.json", import.meta.url), "utf8"));
  let placed = 0;
  for (const c of fixture.cases) {
    const r = layoutCard(c.aspects, { heroFirst: c.heroFirst === true });
    const tiles = r.slots.filter(Boolean).map((slot) => ({ slot }));
    const place = ctaOverTile(tiles, r.group, label);
    if (!place) continue;
    placed += 1;
    const left = CARD_W - place.right - ctaWidth(label);
    // 札は丸ごと 1 つの枠の中 (下の縁に接する枠)
    assert.ok(tiles.some(({ slot }) => left >= slot.x + 16 - 0.5 && CARD_W - place.right <= slot.x + slot.w - 16 + 0.5), `${c.key}: inside a tile`);
    assert.ok(left >= CTA_SAFE_LEFT, `${c.key}: clear of X's address label (bottom-left)`);
    assert.ok(CARD_H - place.bottom <= CARD_H - 15, `${c.key}: inside X's 2:1 crop`);
  }
  assert.ok(placed > 0, "some layouts place the CTA over a tile");
  // スマホの画面 1 枚 (幅が足りない): カードの角
  const t = layoutCard([9 / 19.5]);
  assert.equal(ctaOverTile(t.slots.map((slot) => ({ slot })), t.group, label), null);
});

test("r10: the header and the CTA sit in the room above / below the photos when there is room, else over them (inside X's 2:1 crop)", () => {
  assert.deepEqual(chromePlacement(layoutCard([0.75]).group), { room: 24, headerTop: null, ctaBottom: null, compact: false, overlayTop: 32, inset: 32, ctaRight: 28 });
  for (const [aspects, wantRoom] of [[[16 / 9, 16 / 9], true], [[16 / 9, 0.75], true], [[16 / 9, 16 / 9, 16 / 9], true], [[1, 1, 1, 1], false]]) {
    const { group } = layoutCard(aspects);
    const place = chromePlacement(group);
    assert.equal(place.headerTop !== null, wantRoom, JSON.stringify(aspects));
    if (place.headerTop === null) continue;
    // 帯は写真より上、札は写真より下。どちらも X に切られうる上下 15px の内側
    assert.ok(place.headerTop + 56 <= group.y && place.headerTop + 1.5 >= 15, JSON.stringify(place));
    const ctaH = place.compact ? 52 : 62;
    assert.ok(CARD_H - place.ctaBottom - ctaH >= group.y + group.h && place.ctaBottom >= 15, JSON.stringify(place));
  }
});

test("r12: no own photo + the play's photos -> the cover card (the game cover large, モーメントを見る / レビューを見る), the play's photos are not drawn", async () => {
  assert.equal(CARD_TILES_MAX, 8);
  for (const [raw, cta] of [[TEXT_ONLY, "モーメントを見る"], [NO_PHOTO_REVIEW, "レビューを見る"]]) {
    const large = validLarge(raw);
    assert.ok(large.play_media.length > 0, "the old key is still accepted");
    const seen = [];
    const images = await loadCardImages(large, async (url) => { seen.push(String(url)); return new Response(LANDSCAPE); });
    assert.deepEqual(images.tiles, [], cta);
    assert.match(images.hero ?? "", /^data:image\//, `${cta}: the cover is drawn large`);
    assert.equal(recordMode(large, images), "plain");
    for (const item of large.play_media) assert.ok(!seen.includes(item.url), `${cta}: not fetched`);
    const { texts, srcs } = collect(cardElement(large, images, R9_ASSETS));
    assert.ok(texts.includes(cta), cta);
    assert.ok(!texts.includes(CTA_LABELS.own), cta);
    assert.ok(srcs.includes(images.hero), cta);
  }
});

const R9_PATTERNS = [
  ...[1, 2, 3, 4].map((n) => [`moment ${n} photo(s)`, { ...R3_MOMENT, media: ["a", "b", "c", "d"].slice(0, n).map((x) => image(`${x}.jpg`)) }]),
  ["moment portrait photo", { ...R3_MOMENT, media: [image("a.jpg")] }, PORTRAIT],
  ["moment video", { ...R3_MOMENT, media: [video("v.jpg", 9_000)] }],
  ...[1, 2, 3].map((n) => [`review ${n} photo(s)`, { ...R3_REVIEW, media: R3_REVIEW.media.slice(0, n) }]),
  ...R9_CASES.slice(3).map(([name, raw]) => [name, raw]),
  ["long name and title", { ...R3_MOMENT, author_name: "とても長い名前のゲーマー".repeat(4), title: "とても長いゲームの題名 ".repeat(8).trim() }],
];
for (const [name, raw, photo] of R9_PATTERNS) {
  test(`r9: the ${name} card renders 1200x630 within the size bound`, async () => {
    const fetchImpl = async (url) => new Response(String(url).includes("/object/sign/") ? (photo ?? NOISE) : IMAGE);
    const { body, contentType } = await renderCardImage(raw, { fetchImpl, fontLoader });
    if (contentType === "image/jpeg") {
      assert.deepEqual(await jpegSize(body), [1200, 630]);
      assert.ok(body.length <= JPEG_MAX_BYTES, `${body.length} bytes`);
    } else {
      assert.equal(contentType, "image/png");
      assert.deepEqual(pngSize(body), [1200, 630]);
    }
    assert.equal(contentType === "image/jpeg", servesJpeg(validLarge(raw)));
  });
}

// ---------------------------------------------------------------- TASK-20261017-002 r10: どの写真も切らずに並べる (全パターン)

// 形ごとの雑音の写真 (JPEG の大きさのいちばん悪い場合)。名前の頭の字で形を選ぶ
const { randomBytes } = await import("node:crypto");
const SHAPES = { L: [1600, 900], S: [1100, 1100], P: [900, 1200], T: [600, 1300], W: [1680, 720] };
const NOISY = Object.fromEntries(await Promise.all(Object.entries(SHAPES).map(async ([key, [width, height]]) =>
  [key, await sharp(randomBytes(width * height * 3), { raw: { width, height, channels: 3 } }).jpeg({ quality: 92 }).toBuffer()])));
const shapeFetch = async (url) => {
  const href = String(url);
  if (!href.includes("/object/sign/")) return new Response(IMAGE);
  const key = href.split("/").pop().split("?")[0][0];
  return new Response(NOISY[key] ?? NOISY.L);
};
const shaped = (keys, prefix = "") => [...keys].map((key, i) => image(`${key}${prefix}${i}.jpg`));
const multisets = [];
const walk = (acc, from) => {
  if (acc.length) multisets.push(acc);
  if (acc.length < 4) for (let i = from; i < 3; i += 1) walk(acc + "LSP"[i], i);
};
walk("", 0);
const R10_PATTERNS = [
  ...multisets.map((keys) => [`moment ${keys}`, { ...R3_MOMENT, media: shaped(keys) }]),
  ...["T", "TT", "TL", "W", "WW"].map((keys) => [`moment ${keys}`, { ...R3_MOMENT, media: shaped(keys) }]),
  ["moment video L", { ...R3_MOMENT, media: [video("L-v.jpg", 9_000)] }],
  ["moment video P", { ...R3_MOMENT, media: [video("P-v.jpg", 83_000)] }],
  ["text-only moment, the play has L P S + video (r12: not drawn)", { ...TEXT_ONLY, play_media: [...shaped("LPS", "-play"), video("L-play-v.jpg", 9_000)] }],
  ["text-only moment, nothing in the play", { ...R3_MOMENT, photo_url: null, media: [], author_name: "ひなた" }],
  ["spoiler moment", { ...R3_MOMENT, spoiler: true, author_name: "ひなた" }],
  ...["L", "LS", "LLP"].map((keys) => [`review ${keys}`, { ...R3_REVIEW, author_name: "ひなた", media: shaped(keys, "-r") }]),
];

test("r10: the pattern list covers every multiset of L/S/P up to 4 photos (34)", () => {
  assert.equal(multisets.length, 34);
});

for (const [name, raw] of R10_PATTERNS) {
  test(`r10: the ${name} card renders 1200x630 without throwing, JPEG within the size bound`, async () => {
    const { body, contentType } = await renderCardImage(raw, { fetchImpl: shapeFetch, fontLoader });
    if (contentType === "image/jpeg") {
      assert.deepEqual(await jpegSize(body), [1200, 630]);
      assert.ok(body.length <= JPEG_MAX_BYTES, `${body.length} bytes`);
    } else {
      assert.equal(contentType, "image/png");
      assert.deepEqual(pngSize(body), [1200, 630]);
    }
    assert.equal(contentType === "image/jpeg", servesJpeg(validLarge(raw)));
  });
}

test("r10: record cards are always JPEG (the cover card stays under Bluesky's 1MB thumb limit); old layouts stay PNG", () => {
  assert.equal(servesJpeg(validLarge({ ...R3_MOMENT, spoiler: true })), true);
  assert.equal(servesJpeg(validLarge({ ...R3_REVIEW, media: [] })), true);
  for (const large of [GAME, PROFILE, GRID, DIAGNOSIS]) assert.equal(servesJpeg(validLarge(large)), false);
});

// ---------------------------------------------------------------- TASK-20261017-002 r11: 5 枚以上・同じプレイの写真で埋める

const ASPECT = Object.fromEntries(Object.entries(SHAPES).map(([key, [width, height]]) => [key, width / height]));
// 同じプレイの物 (名前の頭の字で形を選ぶ。shapeFetch が雑音の写真を返す)
const playShaped = (keys) => [...keys].map((key, i) => ({ kind: "image", url: playSigned(`${key}-fill${i}.jpg`) }));
const fill = (keys) => ({ play_media: playShaped(keys), play_media_total: 30, play_media_counts: { photos: 29, videos: 1 } });
const aspectsOf = (tiles) => tiles.map(({ slot }) => slot.w / slot.h);

test("r12: the card draws only the record's own items (moment <= 8 since 10/29, review <= 8), never the play's; a spoiler draws none", () => {
  const large = validLarge({ ...R3_MOMENT, media: shaped("LP"), ...fill("SSSSSSSS") });
  assert.deepEqual(cardItems(large), large.media);
  assert.equal(cardItems(validLarge({ ...R3_MOMENT, media: shaped("LPSLPSLPSL") })).length, 8);
  assert.equal(cardItems(validLarge({ ...R3_REVIEW, media: shaped("LPSLPSLPSL", "-r"), ...fill("SS") })).length, 8);
  assert.deepEqual(cardItems(validLarge({ ...R3_MOMENT, spoiler: true, ...fill("SSS") })), []);
  assert.deepEqual(cardItems(validLarge({ ...R3_REVIEW, spoiler: true, ...fill("SSS") })), []);
});

test("r12: play_media present + own media -> only the own items are fetched and drawn", async () => {
  // photo_url (古い形の 1 枚目) はその記録の 1 枚目と同じ物
  const large = validLarge({ ...R3_MOMENT, author_name: "ひなた", photo_url: shaped("LLLL")[0].url, media: shaped("LLLL"), ...fill("PPPPPPPP") });
  assert.equal(large.play_media.length, 8, "the old key is still accepted");
  const seen = [];
  await loadCardImages(large, async (url) => { seen.push(String(url)); return shapeFetch(url); });
  const signedSeen = seen.filter((url) => url.includes("/object/sign/"));
  assert.deepEqual(new Set(signedSeen), new Set(large.media.map((item) => item.url)));
  for (const item of large.play_media) assert.ok(!signedSeen.includes(item.url), `not fetched ${item.url}`);
});

test("r12: own 1 + the play's 7 -> the card shows that one photo only (the r10 layout, no heroFirst), the CTA says 写真・動画をすべて見る", async () => {
  for (const own of ["L", "P", "S"]) {
    const large = validLarge({ ...R3_MOMENT, author_name: "ひなた", media: shaped(own), ...fill("LPSLPSL") });
    const images = await loadCardImages(large, shapeFetch);
    assert.equal(images.tiles.length, 1, own);
    assert.deepEqual(images.tiles.map((tile) => tile.item), large.media, own);
    assert.deepEqual(images.tiles.map((tile) => tile.slot), layoutCard([ASPECT[own]]).slots, own);
    assert.equal(recordMode(large, images), "own");
    const { texts, srcs } = collect(cardElement(large, images, R9_ASSETS));
    assert.ok(texts.includes(CTA_LABELS.own), own);
    assert.ok(!texts.includes("このプレイの写真・動画を見る"), own);
    assert.equal(srcs.filter((src) => images.tiles.some((tile) => tile.image === src)).length, 1, own);
  }
  // own 2 + play: 2 枚だけ、r10 と同じ並べ方
  const two = validLarge({ ...R3_REVIEW, author_name: "ひなた", media: shaped("LP", "-r"), ...fill("SSSSSS") });
  const twoImages = await loadCardImages(two, shapeFetch);
  assert.deepEqual(twoImages.tiles.map((tile) => tile.item), two.media);
  assert.deepEqual(twoImages.tiles.map((tile) => tile.slot), layoutCard([ASPECT.L, ASPECT.P]).slots);
});

test("r11: a review with 10 photos draws up to 8 (the r10 layout)", async () => {
  const review = validLarge({ ...R3_REVIEW, author_name: "ひなた", media: shaped("LLLLLLLLLL", "-r") });
  assert.equal(review.media.length, 8);
  const reviewImages = await loadCardImages(review, shapeFetch);
  const want = layoutCard(Array(8).fill(ASPECT.L));
  assert.equal(reviewImages.tiles.length, want.shown);
  assert.ok(want.shown >= 5 && want.shown <= 8, `${want.shown}`);
  assert.deepEqual(reviewImages.tiles.map((tile) => tile.slot), want.slots.filter(Boolean));
  assert.equal(recordMode(review, reviewImages), "own");
  assert.deepEqual(aspectsOf(reviewImages.tiles).map((a) => Math.round(a * 100)), Array(reviewImages.tiles.length).fill(Math.round(ASPECT.L * 100)));
});

test("r12: when the record's own photo cannot be read, the cover card is drawn (the play's photos are not used)", async () => {
  const large = validLarge({ ...R3_MOMENT, author_name: "ひなた", media: [image("x-broken.jpg")], ...fill("LLL") });
  const images = await loadCardImages(large, async (url) => (String(url).includes("x-broken") ? new Response("nope") : shapeFetch(url)));
  assert.deepEqual(images.tiles, []);
  assert.equal(recordMode(large, images), "plain");
  const { texts } = collect(cardElement(large, images, R9_ASSETS));
  assert.ok(texts.includes("モーメントを見る"));
});

const R11_PATTERNS = [
  ...["LLLLLLLL", "SSSSSSSS", "PPPPPPPP", "LPSLPSLP", "LLLLL", "PPPPPP", "LPSLPSL"].map((keys) => [`review ${keys}`, { ...R3_REVIEW, author_name: "ひなた", media: shaped(keys, "-r") }]),
  ["review with 10 photos", { ...R3_REVIEW, author_name: "ひなた", media: shaped("LPSLPSLPSL", "-r") }],
  ["moment own L + 7 of the play", { ...R3_MOMENT, author_name: "ひなた", media: shaped("L"), ...fill("LPSLPSL") }],
  ["moment own P + 7 of the play", { ...R3_MOMENT, author_name: "ひなた", media: shaped("P"), ...fill("LPSLPSL") }],
  ["moment own 2 + 6 of the play", { ...R3_MOMENT, author_name: "ひなた", media: shaped("LP"), ...fill("SLPSLP") }],
  ["moment own 4 + 4 of the play", { ...R3_MOMENT, author_name: "ひなた", media: shaped("LLPS"), ...fill("PLSL") }],
  ["review own 3 + 5 of the play", { ...R3_REVIEW, author_name: "ひなた", media: shaped("LLL", "-r"), ...fill("PPPPP") }],
  ["text-only moment + 8 of the play (r12: cover card)", { ...TEXT_ONLY, ...fill("LPSLPSLP") }],
];
for (const [name, raw] of R11_PATTERNS) {
  test(`r11/r12: the ${name} card renders 1200x630 JPEG within the size bound`, async () => {
    const { body, contentType } = await renderCardImage(raw, { fetchImpl: shapeFetch, fontLoader });
    assert.equal(contentType, "image/jpeg");
    assert.deepEqual(await jpegSize(body), [1200, 630]);
    assert.ok(body.length <= JPEG_MAX_BYTES, `${body.length} bytes`);
  });
}
