import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  GENERIC_CARD,
  escapeHtmlAttribute,
  previewTarget,
  renderPreviewHtml,
} from "../api/_lib/share-preview.mjs";
import { createSharePreviewHandler } from "../api/share-preview.mjs";

const CODE = "AbC_dEf-12345678";
const USER = "12345678-1234-1234-1234-123456789abc";
const RANKING = "abcdefab-cdef-cdef-cdef-abcdefabcdef";
const template = await readFile(new URL("../index.html", import.meta.url), "utf8");

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
  await createSharePreviewHandler({ readTemplate: () => template, ...options })(
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
  assert.equal(fetched.length, 1);
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
    [{ kind: "user", id: USER }, `/users/${USER}`],
    [{ kind: "ranking", ownerId: USER, rankingId: RANKING }, `/users/${USER}/custom-rankings/${RANKING}`],
    [{ kind: "catalog", id: USER }, `/catalogs/${USER}`],
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

test("a game log sends its query inside the single H-1 path parameter", async () => {
  let upstreamUrl;
  const response = await invoke({
    headers: { host: "links.playnavilab.com" },
    query: { kind: "game", id: "42", logId: USER },
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
    { headers: { host: "links.playnavilab.com" }, query: { kind: "user", id: USER, extra: "x" } },
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

test("an actual slow HTTP upstream is cut off at about 1.5 seconds", async () => {
  const server = createServer((_request, response) => {
    setTimeout(() => response.end(JSON.stringify({ status: "ok", card: GENERIC_CARD })), 2000);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    const start = performance.now();
    const response = await invoke({ query: { code: CODE } }, {
      metaUrl: `http://127.0.0.1:${address.port}/preview`,
    });
    const elapsedMs = performance.now() - start;
    assert.equal(tag(response.body, "og:title"), GENERIC_CARD.title);
    assert.ok(elapsedMs >= 1400 && elapsedMs < 1900, `elapsed ${elapsedMs}ms`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
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

test("the actual handler reads the root index.html file", async () => {
  const response = responseRecorder();
  await createSharePreviewHandler({
    fetchImpl: async () => ({ status: 404 }),
  })({ method: "GET", headers: { host: "playnavi.app" }, query: { code: CODE } }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.slice(response.body.indexOf("<body>")), template.slice(template.indexOf("<body>")));
});

test("renderer fails clearly if index.html has no closing head", () => {
  assert.throws(() => renderPreviewHtml("<html><body></body></html>", GENERIC_CARD, "https://playnavi.app/"));
});
