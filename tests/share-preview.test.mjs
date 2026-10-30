import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  GENERIC_CARD,
  escapeHtmlAttribute,
  jsonForScript,
  PREVIEW_META_URL,
  previewTarget,
  renderPreviewHtml,
  RECORD_FONT_CSS,
  RECORD_PAGE_CLASS,
  SHARE_VIEW_URL,
} from "../api/_lib/share-preview.mjs";
import { createSharePreviewHandler, UPSTREAM_TIMEOUT_MS } from "../api/share-preview.mjs";

const CODE = "AbC_dEf-12345678";
const USER = "12345678-1234-1234-1234-123456789abc";
const RANKING = "abcdefab-cdef-cdef-cdef-abcdefabcdef";
const template = await readFile(new URL("../link.html", import.meta.url), "utf8");

function responseRecorder() {
  const headers = new Map();
  return {
    headers,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    status(status) { this.statusCode = status; return this; },
    send(body) { this.body = body; return this; },
  };
}

async function invoke(request, options = {}) {
  const response = responseRecorder();
  await createSharePreviewHandler({ readTemplate: () => template, viewUrl: "http://127.0.0.1:9/share-view", ...options })(
    { method: "GET", headers: { host: "playnavi.app" }, ...request },
    response,
  );
  return response;
}

function tag(html, name) {
  return html.match(new RegExp(`<meta (?:property|name)="${name}" content="([^"]*)">`))?.[1];
}

test("short share page inserts exactly seven tags without changing its body or script", async () => {
  const title = '\"><script>alert(1)</script>&\'';
  const fetched = [];
  const response = await invoke({ query: { code: CODE } }, {
    fetchImpl: async (url, options) => {
      fetched.push({ url, options });
      return {
        status: 200,
        json: async () => ({
          status: "ok",
          card: { title, description: "A & B", image_url: "https://images.example/image?a=1&b=2" },
        }),
      };
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  // r5: 短縮リンクは記録の中身 (share-view) も同時に聞く。カードの答えは share-view の形ではないので埋め込まない
  assert.equal(fetched.length, 2);
  assert.equal(String(fetched[1].url).startsWith("http://127.0.0.1:9/share-view?"), true);
  assert.equal(fetched[0].url.searchParams.get("code"), CODE);
  assert.equal(fetched[0].url.searchParams.size, 1);
  assert.equal(fetched[0].options.method, "GET");
  assert.equal(fetched[0].options.cache, "no-store");
  assert.equal(tag(response.body, "og:site_name"), "PlayNavi");
  assert.equal(tag(response.body, "og:type"), "website");
  assert.equal(tag(response.body, "og:title"), escapeHtmlAttribute(title));
  assert.equal(tag(response.body, "og:description"), "A &amp; B");
  assert.equal(tag(response.body, "og:image"), "https://images.example/image?a=1&amp;b=2");
  assert.equal(tag(response.body, "og:url"), `https://playnavi.app/s/${CODE}`);
  assert.equal(tag(response.body, "twitter:card"), "summary");
  assert.equal((response.body.match(/<meta (?:property="og:|name="twitter:)/g) ?? []).length, 7);
  assert.equal(response.body.slice(response.body.indexOf("<body>")), template.slice(template.indexOf("<body>")));
  assert.equal(response.body.includes("<script>alert(1)</script>"), false);
  assert.equal(response.body.match(/<script\b[^>]*>/g)?.join("\n"), template.match(/<script\b[^>]*>/g)?.join("\n"));
});

test("canonical routes retain their own URL and send exactly one path parameter upstream", () => {
  const cases = [
    [{ kind: "game", id: "42" }, "/game/42"],
    [{ kind: "game", id: "42", logId: USER }, `/game/42?logId=${USER}`],
    [{ kind: "game", id: "42", logId: USER, moment: RANKING }, `/game/42?logId=${USER}&moment=${RANKING}`],
    [{ kind: "user", id: USER }, `/users/${USER}`],
    [{ kind: "ranking", ownerId: USER, rankingId: RANKING }, `/users/${USER}/custom-rankings/${RANKING}`],
    [{ kind: "tier_list", ownerId: USER, listId: RANKING }, `/users/${USER}/tier-lists/${RANKING}`],
    [{ kind: "catalog", id: USER }, `/catalogs/${USER}`],
    [{ kind: "best_games", id: USER }, `/users/${USER}/best-games`],
    [{ kind: "diagnosis", id: USER }, `/users/${USER}/diagnosis`],
  ];
  for (const [query, path] of cases) {
    const target = previewTarget({ headers: { host: "links.playnavilab.com" }, query });
    assert.deepEqual(target, {
      url: `https://links.playnavilab.com${path}`,
      upstreamParam: "path",
      upstreamValue: path,
    });
  }
  assert.equal(previewTarget({ headers: { host: "playnavi.app" }, query: { kind: "game", id: "42" } }), null);
});

test("Vercel's matched host query stays out of all nine canonical cards", () => {
  const host = "links.playnavilab.com";
  const cases = [
    [{ kind: "game", id: "42" }, "/game/42"],
    [{ kind: "game", id: "42", logId: USER }, `/game/42?logId=${USER}`],
    [{ kind: "game", id: "42", logId: USER, moment: RANKING }, `/game/42?logId=${USER}&moment=${RANKING}`],
    [{ kind: "user", id: USER }, `/users/${USER}`],
    [{ kind: "ranking", ownerId: USER, rankingId: RANKING }, `/users/${USER}/custom-rankings/${RANKING}`],
    [{ kind: "tier_list", ownerId: USER, listId: RANKING }, `/users/${USER}/tier-lists/${RANKING}`],
    [{ kind: "catalog", id: USER }, `/catalogs/${USER}`],
    [{ kind: "best_games", id: USER }, `/users/${USER}/best-games`],
    [{ kind: "diagnosis", id: USER }, `/users/${USER}/diagnosis`],
  ];
  for (const [query, path] of cases) {
    assert.deepEqual(previewTarget({ headers: { host }, query: { ...query, host } }), {
      url: `https://${host}${path}`,
      upstreamParam: "path",
      upstreamValue: path,
    });
  }
});

test("a game log sends its query inside the single H-1 path parameter", async () => {
  let upstreamUrl;
  const response = await invoke({
    headers: { host: "links.playnavilab.com" },
    query: { kind: "game", id: "42", logId: USER, host: "links.playnavilab.com" },
  }, {
    fetchImpl: async (url) => {
      upstreamUrl = url;
      return { status: 404 };
    },
  });
  assert.deepEqual([...upstreamUrl.searchParams.keys()], ["path"]);
  assert.equal(upstreamUrl.searchParams.get("path"), `/game/42?logId=${USER}`);
  assert.equal(tag(response.body, "og:url"), `https://links.playnavilab.com/game/42?logId=${USER}`);
});

test("a diagnosis path the server refuses (404) keeps its URL and shows the generic card", async () => {
  let upstreamUrl;
  const response = await invoke({
    headers: { host: "links.playnavilab.com" },
    query: { kind: "diagnosis", id: USER, host: "links.playnavilab.com" },
  }, {
    fetchImpl: async (url) => {
      upstreamUrl = url;
      return { status: 404 };
    },
  });
  assert.equal(upstreamUrl.searchParams.get("path"), `/users/${USER}/diagnosis`);
  assert.equal(tag(response.body, "og:title"), GENERIC_CARD.title);
  assert.equal(tag(response.body, "og:image"), GENERIC_CARD.image_url);
  assert.equal(tag(response.body, "twitter:card"), "summary");
  assert.equal(tag(response.body, "og:url"), `https://links.playnavilab.com/users/${USER}/diagnosis`);
});

test("short links retain safe tracking queries without sending them upstream", async () => {
  let upstreamUrl;
  const response = await invoke({ query: { code: CODE, utm_source: "x&y" } }, {
    fetchImpl: async (url) => {
      upstreamUrl = url;
      return { status: 404 };
    },
  });
  assert.equal(tag(response.body, "og:url"), `https://playnavi.app/s/${CODE}?utm_source=x%26y`);
  assert.deepEqual([...upstreamUrl.searchParams.keys()], ["code"]);
  assert.equal(upstreamUrl.searchParams.get("code"), CODE);
});

test("invalid host, code, path, or extra query never calls the upstream", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error("unexpected fetch"); };
  const invalid = [
    { headers: { host: "evil.example" }, query: { code: CODE } },
    { query: { code: "bad" } },
    { query: { code: [CODE, "other"] } },
    { headers: { host: "links.playnavilab.com" }, query: { kind: "game", id: "0" } },
    { headers: { host: "links.playnavilab.com" }, query: { kind: "game", id: "42", logId: "bad" } },
    { headers: { host: "links.playnavilab.com" }, query: { kind: "game", id: "42", host: "evil.example" } },
    { headers: { host: "links.playnavilab.com" }, query: { kind: "game", id: "42", host: ["links.playnavilab.com", "evil.example"] } },
    { headers: { host: "links.playnavilab.com" }, query: { kind: "user", id: USER, host: "links.playnavilab.com", extra: "x" } },
    { headers: { host: "links.playnavilab.com" }, query: { kind: "best_games", id: "bad" } },
    { headers: { host: "links.playnavilab.com" }, query: { kind: "diagnosis", id: "bad" } },
    { headers: { host: "playnavi.app" }, query: { kind: "diagnosis", id: USER } },
  ];
  for (const request of invalid) {
    const response = await invoke(request, { fetchImpl });
    assert.equal(tag(response.body, "og:title"), GENERIC_CARD.title);
    if (request.query?.extra) {
      assert.equal(tag(response.body, "og:url"), `https://links.playnavilab.com/users/${USER}?extra=x`);
    } else {
      assert.equal(tag(response.body, "og:url"), "https://playnavi.app/");
    }
  }
  assert.equal(calls, 0);
});

test("404, 500, malformed JSON, and unsafe image use the generic card", async () => {
  const responses = [
    { status: 404 },
    { status: 500 },
    { status: 200, json: async () => { throw new Error("bad JSON"); } },
    { status: 200, json: async () => ({ status: "ok", card: { title: "Unsafe", description: "x", image_url: "javascript:alert(1)" } }) },
  ];
  for (const upstream of responses) {
    const response = await invoke({ query: { code: CODE } }, { fetchImpl: async () => upstream });
    assert.equal(tag(response.body, "og:title"), GENERIC_CARD.title);
    assert.equal(tag(response.body, "og:image"), GENERIC_CARD.image_url);
    assert.equal(tag(response.body, "og:url"), `https://playnavi.app/s/${CODE}`);
  }
});

async function withSlowUpstream(delayMs, run) {
  const server = createServer((_request, response) => {
    setTimeout(() => response.end(JSON.stringify({
      status: "ok",
      card: { title: "Slow", description: "x", image_url: "https://example.com/slow.jpg" },
    })), delayMs);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await run(`http://127.0.0.1:${server.address().port}/preview`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("an upstream answering in 2 seconds still produces the specific card", async () => {
  // Production cold starts took about 1.5-2s and fell back to the generic card.
  await withSlowUpstream(2000, async (metaUrl) => {
    const response = await invoke({ query: { code: CODE } }, { metaUrl, viewUrl: metaUrl });
    assert.equal(tag(response.body, "og:title"), "Slow");
  });
});

test("an actual slow HTTP upstream is cut off at about 3 seconds", async () => {
  assert.equal(UPSTREAM_TIMEOUT_MS, 3000);
  await withSlowUpstream(4000, async (metaUrl) => {
    const start = performance.now();
    // share-view も同じ遅い相手。2 つは同時に聞くので合計でも約 3 秒
    const response = await invoke({ query: { code: CODE } }, { metaUrl, viewUrl: metaUrl });
    const elapsedMs = performance.now() - start;
    assert.equal(tag(response.body, "og:title"), GENERIC_CARD.title);
    assert.ok(elapsedMs >= 2900 && elapsedMs < 3400, `elapsed ${elapsedMs}ms`);
  });
});

test("non-GET requests and a missing template do not fetch upstream", async () => {
  const fetchImpl = () => { throw new Error("unexpected fetch"); };
  const method = await invoke({ method: "POST", query: { code: CODE } }, { fetchImpl });
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers.get("allow"), "GET");
  const missing = await invoke({ query: { code: CODE } }, {
    fetchImpl,
    readTemplate: async () => { throw new Error("missing file"); },
  });
  assert.equal(missing.statusCode, 503);
});

test("the actual handler reads the root link.html file", async () => {
  const response = responseRecorder();
  await createSharePreviewHandler({
    fetchImpl: async () => ({ status: 404 }),
  })({ method: "GET", headers: { host: "playnavi.app" }, query: { code: CODE } }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.slice(response.body.indexOf("<body>")), template.slice(template.indexOf("<body>")));
});

test("renderer fails clearly if link.html has no closing head", () => {
  assert.throws(() => renderPreviewHtml("<html><body></body></html>", GENERIC_CARD, "https://playnavi.app/"));
});

test("a moment without its log id keeps the URL but shows the generic card (TASK-20261017-002)", () => {
  const target = previewTarget({ headers: { host: "links.playnavilab.com" }, query: { kind: "game", id: "42", moment: RANKING } });
  assert.deepEqual(target, {
    url: `https://links.playnavilab.com/game/42?moment=${RANKING}`,
    upstreamParam: null,
    upstreamValue: null,
  });
  assert.equal(
    previewTarget({ headers: { host: "links.playnavilab.com" }, query: { kind: "game", id: "42", logId: USER, moment: "bad" } }),
    null,
  );
});

// ---- TASK-20261017-002 r5: 記録のページの中身を HTML に埋め込む (EF share-view) ----

const LOG = "11111111-2222-4333-8444-555555555555";
const MEMORY = "66666666-7777-4888-9999-aaaaaaaaaaaa";
const MOMENT_PATH = `/game/42?logId=${LOG}&moment=${MEMORY}`;
const LOG_PATH = `/game/42?logId=${LOG}`;
const META = "https://meta.fixture/functions/v1/share-preview-meta";
const VIEW = "https://meta.fixture/functions/v1/share-view";
const CARD = { status: "ok", card: { title: "あかりさんのモーメント", description: "d", image_url: "https://images.example/c.jpg" } };
const momentView = (overrides = {}) => ({
  kind: "moment",
  canonical_path: MOMENT_PATH,
  app_url: `https://links.playnavilab.com${MOMENT_PATH}`,
  game: { id: "42", title: "ゼルダの伝説", cover_url: "https://images.example/cover.jpg" },
  author: { display_name: "あかり", avatar_url: null },
  date: "2026-10-20T06:00:00.000Z",
  spoiler: false,
  title: "ついに",
  body: "倒した",
  media: [{ kind: "image", url: "https://storage.example/sign/p.jpg?token=a&b=1", width: 1440, height: 1080 }],
  ...overrides,
});
const reviewView = () => ({
  kind: "review",
  canonical_path: LOG_PATH,
  app_url: `https://links.playnavilab.com${LOG_PATH}`,
  game: { id: "42", title: "ゼルダの伝説", cover_url: null },
  author: { display_name: "あかり", avatar_url: null },
  date: null,
  spoiler: false,
  status: "completed",
  score: 9,
  comment: "最高",
  moments_count: 2,
  media: [],
});

function upstreamFixture({ view = null, viewStatus = 200, viewDelayMs = 0 } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: new URL(url), options });
    if (String(url).startsWith(META)) return { status: 200, json: async () => CARD };
    if (viewDelayMs) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, viewDelayMs);
        options.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(options.signal.reason); });
      });
    }
    return { status: viewStatus, json: async () => (view ? { status: "ok", view } : { status: "not_found" }) };
  };
  return { calls, fetchImpl, viewCalls: () => calls.filter(({ url }) => url.href.startsWith(VIEW)) };
}

function embedded(html) {
  const match = html.match(/<script id="pn-share-view" type="application\/json">([^<]*)<\/script>/);
  return match ? JSON.parse(match[1]) : null;
}

const momentRequest = { headers: { host: "links.playnavilab.com" }, query: { kind: "game", id: "42", logId: LOG, moment: MEMORY, host: "links.playnavilab.com" } };
const logRequest = { headers: { host: "links.playnavilab.com" }, query: { kind: "game", id: "42", logId: LOG } };

test("r5: the share-view URL is the same project as the card function", () => {
  assert.equal(new URL(SHARE_VIEW_URL).host, new URL(PREVIEW_META_URL).host);
  assert.equal(new URL(SHARE_VIEW_URL).pathname, "/functions/v1/share-view");
});

test("r5: a canonical moment / review page embeds the record (r7: no iOS app banner); the card stays the same", async () => {
  for (const [request, view, path] of [[momentRequest, momentView(), MOMENT_PATH], [logRequest, reviewView(), LOG_PATH]]) {
    const up = upstreamFixture({ view });
    const response = await invoke(request, { fetchImpl: up.fetchImpl, metaUrl: META, viewUrl: VIEW });
    const viewCalls = up.viewCalls();
    assert.equal(viewCalls.length, 1);
    assert.deepEqual([...viewCalls[0].url.searchParams], [["path", path]]);
    assert.equal(viewCalls[0].options.cache, "no-store");
    assert.ok(viewCalls[0].options.signal, "the same 3-second cut-off");
    assert.deepEqual(embedded(response.body), { status: "ok", view });
    // r7 P3: no Safari app banner (the poster's record is the hero; app owners still open the app via app.mjs)
    assert.equal(tag(response.body, "apple-itunes-app"), undefined);
    assert.equal(response.body.includes("apple-itunes-app"), false);
    assert.ok(response.body.includes('<link rel="modulepreload" href="/assets/share-view.mjs">'));
    // The card and the response headers are what they are without the embed.
    const without = await invoke(request, { fetchImpl: upstreamFixture().fetchImpl, metaUrl: META, viewUrl: VIEW });
    assert.equal(response.statusCode, without.statusCode);
    assert.deepEqual([...response.headers], [...without.headers]);
    for (const name of ["og:title", "og:description", "og:image", "og:url", "twitter:card"]) {
      assert.equal(tag(response.body, name), tag(without.body, name), name);
    }
    // Everything after <head> ends is the template body, untouched.
    assert.equal(response.body.slice(response.body.indexOf("<body>")), template.slice(template.indexOf("<body>")));
  }
});

test("r5: a short link asks share-view by code and embeds a moment / review", async () => {
  const up = upstreamFixture({ view: momentView() });
  const response = await invoke({ query: { code: CODE, utm_source: "x" } }, { fetchImpl: up.fetchImpl, metaUrl: META, viewUrl: VIEW });
  assert.deepEqual([...up.viewCalls()[0].url.searchParams], [["code", CODE]]);
  assert.equal(embedded(response.body).view.canonical_path, MOMENT_PATH);
  assert.equal(tag(response.body, "og:url"), `https://playnavi.app/s/${CODE}?utm_source=x`);
  assert.equal(tag(response.body, "apple-itunes-app"), undefined);
});

test("r5: other link kinds never ask share-view and get no embed or banner", async () => {
  for (const query of [
    { kind: "game", id: "42" },
    { kind: "user", id: USER },
    { kind: "ranking", ownerId: USER, rankingId: RANKING },
    { kind: "catalog", id: USER },
    { kind: "game", id: "42", logId: LOG, extra: "x" },
  ]) {
    const up = upstreamFixture({ view: momentView() });
    const response = await invoke({ headers: { host: "links.playnavilab.com" }, query }, { fetchImpl: up.fetchImpl, metaUrl: META, viewUrl: VIEW });
    assert.equal(up.viewCalls().length, 0, JSON.stringify(query));
    assert.equal(embedded(response.body), null);
    assert.equal(tag(response.body, "apple-itunes-app"), undefined);
  }
});

test("r6: a record page marks <html> and loads Noto Sans JP; other pages do not", async () => {
  const up = upstreamFixture({ view: momentView() });
  const response = await invoke(momentRequest, { fetchImpl: up.fetchImpl, metaUrl: META, viewUrl: VIEW });
  assert.equal(RECORD_PAGE_CLASS, "pn-rec-page");
  assert.ok(response.body.includes(`<html lang="ja" class="${RECORD_PAGE_CLASS}">`));
  assert.equal(RECORD_FONT_CSS, "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap");
  assert.ok(response.body.includes(`<link rel="stylesheet" href="${escapeHtmlAttribute(RECORD_FONT_CSS)}">`));
  assert.ok(response.body.includes('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'));
  // The font and the mark are inside <head>; the body is still the template body.
  assert.ok(response.body.indexOf("fonts.googleapis.com") < response.body.indexOf("</head>"));
  assert.equal(response.body.slice(response.body.indexOf("<body>")), template.slice(template.indexOf("<body>")));
  const without = await invoke(momentRequest, { fetchImpl: upstreamFixture({ viewStatus: 404 }).fetchImpl, metaUrl: META, viewUrl: VIEW });
  assert.ok(without.body.includes('<html lang="ja">'));
  assert.equal(without.body.includes(RECORD_PAGE_CLASS), false);
  assert.equal(without.body.includes("fonts.googleapis.com"), false);
  const game = await invoke({ headers: { host: "links.playnavilab.com" }, query: { kind: "game", id: "42" } }, { fetchImpl: up.fetchImpl, metaUrl: META, viewUrl: VIEW });
  assert.equal(game.body.includes(RECORD_PAGE_CLASS), false);
});

test("r5: share-view 404 / 5xx / time-out / wrong shape leave today's HTML byte for byte", async () => {
  const baseline = await invoke(momentRequest, { fetchImpl: upstreamFixture({ viewStatus: 404 }).fetchImpl, metaUrl: META, viewUrl: VIEW });
  assert.equal(embedded(baseline.body), null);
  assert.equal(tag(baseline.body, "apple-itunes-app"), undefined);
  assert.equal(baseline.body.includes("modulepreload"), false);
  assert.equal((baseline.body.match(/<script\b/g) ?? []).length, (template.match(/<script\b/g) ?? []).length);
  const cases = [
    { view: momentView(), viewStatus: 500 },
    { view: momentView(), viewStatus: 503 },
    { view: momentView({ kind: "game" }) },
    { view: momentView({ app_url: "https://evil.example/game/42" }) },
    // 正規の住所で聞いて別の記録が返ってきた時も埋め込まない
    { view: momentView({ canonical_path: LOG_PATH, app_url: `https://links.playnavilab.com${LOG_PATH}`, kind: "review" }) },
    { view: momentView({ canonical_path: "/game/42" }) },
  ];
  for (const fixture of cases) {
    const response = await invoke(momentRequest, { fetchImpl: upstreamFixture(fixture).fetchImpl, metaUrl: META, viewUrl: VIEW });
    assert.equal(response.body, baseline.body, JSON.stringify(fixture).slice(0, 120));
    assert.deepEqual([...response.headers], [...baseline.headers]);
  }
  const broken = await invoke(momentRequest, {
    fetchImpl: async (url) => String(url).startsWith(META)
      ? { status: 200, json: async () => CARD }
      : { status: 200, json: async () => { throw new Error("bad JSON"); } },
    metaUrl: META,
    viewUrl: VIEW,
  });
  assert.equal(broken.body, baseline.body);
  const thrown = await invoke(momentRequest, {
    fetchImpl: async (url) => {
      if (String(url).startsWith(META)) return { status: 200, json: async () => CARD };
      throw new Error("network down");
    },
    metaUrl: META,
    viewUrl: VIEW,
  });
  assert.equal(thrown.body, baseline.body);
});

test("r5: a share-view slower than 3 seconds is cut off and the card still arrives", async () => {
  const start = performance.now();
  const response = await invoke(momentRequest, { fetchImpl: upstreamFixture({ view: momentView(), viewDelayMs: 4000 }).fetchImpl, metaUrl: META, viewUrl: VIEW });
  const elapsed = performance.now() - start;
  assert.ok(elapsed >= 2900 && elapsed < 3400, `elapsed ${elapsed}ms`);
  assert.equal(embedded(response.body), null);
  assert.equal(tag(response.body, "og:title"), CARD.card.title);
});

test("r5: user text cannot close the script; < > & U+2028 U+2029 are escaped and read back exactly", async () => {
  const body = "</script><script>alert(1)</script>\u2028行\u2029&<!--";
  const view = momentView({ body, title: "</SCRIPT >" });
  const response = await invoke(momentRequest, { fetchImpl: upstreamFixture({ view }).fetchImpl, metaUrl: META, viewUrl: VIEW });
  const head = response.body.slice(0, response.body.indexOf("</head>"));
  const json = head.slice(head.indexOf('<script id="pn-share-view"'));
  const inner = json.slice(json.indexOf(">") + 1, json.indexOf("</script>"));
  for (const raw of ["<", ">", "&", "\u2028", "\u2029"]) assert.equal(inner.includes(raw), false, JSON.stringify(raw));
  assert.equal(response.body.includes("<script>alert(1)</script>"), false);
  assert.equal((response.body.match(/<script\b/gi) ?? []).length, (template.match(/<script\b/gi) ?? []).length + 1);
  assert.equal(JSON.parse(inner).view.body, body);
  assert.equal(JSON.parse(inner).view.title, "</SCRIPT >");
  assert.equal(jsonForScript({ a: "<>&\u2028\u2029" }), '{"a":"\\u003c\\u003e\\u0026\\u2028\\u2029"}');
  // r7: no app banner meta at all
  assert.equal(response.body.includes("apple-itunes-app"), false);
});

test("r5: renderPreviewHtml without a share view is unchanged", () => {
  const url = "https://playnavi.app/s/x";
  assert.equal(renderPreviewHtml(template, GENERIC_CARD, url), renderPreviewHtml(template, GENERIC_CARD, url, null, null));
});
