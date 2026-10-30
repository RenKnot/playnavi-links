import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { webTargetFromPath } from "../assets/link-routing.mjs";

// TASK-20260923-002 一般公開: playnavi.app は予約の住所以外を新しい Web (Vercel の playnavi-web) へ中継する。
// 10/2 の候補の生成 (scripts/prepare-web-gateway.mjs) と同じ形を、実際の vercel.json / link.html に入れた。
// links の配備ごとの住所 (Vercel のログインか共有リンクが要る) だけは、同じ形で STG の新しい Web へ中継し、公開の前と後の確かめに使う。
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const config = JSON.parse(await read("vercel.json"));
const UUID = "00000000-0000-0000-0000-000000000001";
const PRODUCTION_WEB = "https://playnavi-web.vercel.app";
const STAGING_WEB = "https://playnavi-web-v2-stg.vercel.app";
const PREVIEW_HOST = { re: "^playnavi-links-(?:[a-z0-9]+|git-bridge-[a-z0-9-]+)-masanobu-iwasakis-projects\\.vercel\\.app$" };
const relays = config.rewrites.filter(({ destination }) => /^https:\/\/playnavi-web(-v2-stg)?\.vercel\.app\//.test(destination));
const relayFor = (host) => config.rewrites.find(({ source, has }) => source.startsWith("/:path((?!") && JSON.stringify(has) === JSON.stringify([{ type: "host", value: host }]));
const GATEWAY_SOURCE = relayFor("playnavi.app").source;
const matcher = new RegExp(`^/${GATEWAY_SOURCE.slice("/:path(".length, -1)}$`);
const index = (pred) => config.rewrites.findIndex(pred);

test("Web landing reuses strict canonical paths and only fixed Web origins", () => {
  // 2026-10-07: the diagnosis is public like a ranking, so its canonical path is a Web destination too.
  for (const path of ["/game/42", `/game/42?logId=${UUID}`, `/users/${UUID}`, `/users/${UUID}/best-games`, `/users/${UUID}/custom-rankings/${UUID}`, `/users/${UUID}/tier-lists/${UUID}`, `/users/${UUID}/diagnosis`, `/catalogs/${UUID}`]) {
    assert.equal(webTargetFromPath(path, "https://playnavi.app"), `https://playnavi.app${path}`);
  }
  for (const path of ["/a", "/s/AbCdEf012345_-xy", "//evil.example/game/42", "https://evil.example/game/42", "/game/42?next=https://evil.example", "/game/42#x", "/game/9223372036854775808"]) assert.equal(webTargetFromPath(path, "https://playnavi.app"), null);
  for (const origin of ["", "http://playnavi.app", "https://playnavi.app/", "https://links.playnavilab.com", "https://playnavi-links.vercel.app", "https://evil.example", "https://playnavi.app@evil.example"]) assert.equal(webTargetFromPath("/game/42", origin), null);
});

test("the entry page is link.html so that / reaches the Web (static files win over rewrites on Vercel)", async () => {
  await assert.rejects(read("index.html"), { code: "ENOENT" });
  const html = await read("link.html");
  assert.match(html, /<meta name="pn-web-origin" content="https:\/\/playnavi\.app">/);
  assert.match(html, /<a id="web-btn" class="button secondary hidden" href="#">Webで見る<\/a>/);
  assert.equal(config.functions["api/share-preview.mjs"].includeFiles, "link.html");
  assert.match(await read("api/share-preview.mjs"), /join\(process\.cwd\(\), "link\.html"\)/);
  assert.equal(config.rewrites.some(({ destination }) => destination === "/index.html"), false);
  assert.deepEqual(config.rewrites.at(-1), { source: "/(.*)", destination: "/link.html" });
});

test("only playnavi.app relays to the production Web, only links deployment URLs relay to the STG Web", () => {
  assert.equal(relays.length, 4, JSON.stringify(relays));
  assert.equal(relayFor("playnavi.app").destination, `${PRODUCTION_WEB}/:path*`);
  assert.equal(relayFor(PREVIEW_HOST).destination, `${STAGING_WEB}/:path*`);
  assert.equal(relayFor(PREVIEW_HOST).source, GATEWAY_SOURCE);
  const home = (host) => config.rewrites.find(({ source, has }) => source === "/index.html" && JSON.stringify(has) === JSON.stringify([{ type: "host", value: host }]));
  assert.equal(home("playnavi.app").destination, `${PRODUCTION_WEB}/`);
  assert.equal(home(PREVIEW_HOST).destination, `${STAGING_WEB}/`);
  for (const relay of relays) assert.equal(relay.has?.length, 1, "every relay is host-bound");
  // 確認用の決まりは、公開の住所 (playnavi.app・旧共有・links の固定の住所) と枝の別名には当たらない
  const preview = new RegExp(PREVIEW_HOST.re);
  // 配備ごとの住所と、bridge/ の枝の住所 (Vercel の共有リンクはこちらに付く。10/30 Emiya の共有リンク)
  for (const host of ["playnavi-links-iemuwz581-masanobu-iwasakis-projects.vercel.app", "playnavi-links-6xvd1u1fp-masanobu-iwasakis-projects.vercel.app", "playnavi-links-git-bridge-tas-178c9e-masanobu-iwasakis-projects.vercel.app"]) assert.ok(preview.test(host), host);
  for (const host of ["playnavi.app", "links.playnavilab.com", "playnavi-links.vercel.app", "playnavi-links-git-main-masanobu-iwasakis-projects.vercel.app", "evil.example", "playnavi-links-x-masanobu-iwasakis-projects.vercel.app.evil.example"]) assert.ok(!preview.test(host), host);
});

test("reserved paths stay on links; Web pages go through the relay", () => {
  for (const path of ["/", "/game/42", "/login", "/auth/callback", "/oauth/consent", "/ai/return", "/app", "/search", "/share-image/log/1/2", "/csp-report", "/_next/static/chunk.js", "/users/uuid", "/users/uuid/best-games", "/users/uuid/diagnosis", "/catalogs/uuid", "/settings/ai-connections", "/library-import/steam"]) assert.equal(matcher.test(path), true, path);
  for (const path of ["/api", "/api/auth/start", "/api/auth/callback", "/api/survey/session/guest", "/api/unknown", "/assets/site.css", "/.well-known/apple-app-site-association", "/a", "/a/extra", "/s/code", "/surveys/slug", "/survey-login-error", "/auth/steam/callback", "/logo.png", "/og-fallback.png", "/robots.txt", "/link.html"]) assert.equal(matcher.test(path), false, path);
  // 先に決まる予約の住所: AI 連携・アプリの戻り・短縮リンク・アンケート・プライバシーポリシー・Claude の手順
  const relay = index(({ source, has }) => source === GATEWAY_SOURCE && has[0].value === "playnavi.app");
  for (const [source, host] of [["/mcp", "playnavi.app"], ["/mcp/:path*", "playnavi.app"], ["/ai-auth", "playnavi.app"], ["/ai-auth/:path*", "playnavi.app"], ["/api/share-links/:code", "playnavi.app"], ["/oauth-client-metadata.json", "playnavi.app"], ["/bluesky-auth/jwks.json", "playnavi.app"], ["/bluesky-auth/callback", "playnavi.app"], ["/a"], ["/s/:code"], ["/surveys/:surveySlug"], ["/privacy"], ["/help/claude"], ["/auth/steam/callback"]]) {
    const at = index((entry) => entry.source === source && (host ? entry.has?.[0]?.value === host : true));
    assert.ok(at >= 0 && at < relay, `${source} is decided before the relay`);
  }
});

test("relayed responses are never cached by links (the Web has per-user pages)", () => {
  for (const host of ["playnavi.app", PREVIEW_HOST]) {
    const entry = config.headers.find(({ source, has }) => source === GATEWAY_SOURCE && JSON.stringify(has) === JSON.stringify([{ type: "host", value: host }]));
    const headers = Object.fromEntries(entry.headers.map(({ key, value }) => [key, value]));
    assert.deepEqual(headers, { "x-vercel-enable-rewrite-caching": "0", "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store" });
  }
});

test("AI connection (MCP) on playnavi.app goes to the mcp function before the Web relay and the fallback (V5 group 6)", () => {
  const rewrites = config.rewrites;
  const mcp = index(({ source: s, has }) => s === "/mcp" && has?.[0]?.value === "playnavi.app");
  const mcpSub = index(({ source: s, has }) => s === "/mcp/:path*" && has?.[0]?.value === "playnavi.app");
  assert.ok(mcp >= 0 && mcpSub >= 0, "playnavi.app /mcp rules exist");
  assert.match(rewrites[mcp].destination, /^https:\/\/[a-z]+\.supabase\.co\/functions\/v1\/mcp$/);
  assert.match(rewrites[mcpSub].destination, /^https:\/\/[a-z]+\.supabase\.co\/functions\/v1\/mcp\/:path\*$/);
  // 他のホストでは止める (Web やリンクの画面に落とさない)
  for (const s of ["/mcp", "/mcp/:path*"]) {
    const other = index(({ source: x, has }) => x === s && !has);
    assert.equal(rewrites[other].destination, "/api/legacy-route-disabled", s);
    assert.ok(other > Math.max(mcp, mcpSub), "host rule wins first");
  }
  for (const later of [index(({ source: s }) => s === GATEWAY_SOURCE), index(({ source: s }) => s === "/(.*)")]) assert.ok(later > mcpSub, "MCP routes come before the Web relay and the fallback");
  assert.ok(config.headers.some(({ source: s, headers }) => s === "/mcp(.*)" && headers.some(({ key, value }) => key === "Cache-Control" && value === "no-store")));
});
