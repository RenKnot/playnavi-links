// TASK-20260930-006 (2026-10-27): ai.playnavi.app = 本番の AI サーバへの入口 (Claude を ChatGPT の審査と切り離して先に出す)。
// Vercel の別の置き場 (Root Directory = ai-gateway) で、playnavi.app の設定 (ChatGPT の審査中は STG 向き) には触れない。
// /.well-known は Vercel で転送も振り替えもできないので、案内はこの置き場の静的ファイル (中身は AI サーバのコードの metadata() と同じ)。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const HOST = "https://ai.playnavi.app";
const STG_REF = "wffhdhdxdrmobgojxddo";

test("ai.playnavi.app forwards only /mcp and /ai-auth, to the production functions, never STG", async () => {
  const cfg = JSON.parse(await read("ai-gateway/vercel.json"));
  const rewrites = cfg.rewrites.map((r) => [r.source, r.destination]);
  assert.deepEqual(rewrites.map(([s]) => s), ["/mcp", "/mcp/:path*", "/ai-auth", "/ai-auth/:path*"]);
  const bases = new Set(rewrites.map(([, d]) => new URL(d).origin));
  assert.equal(bases.size, 1, "one production project");
  const [base] = bases;
  assert.match(base, /^https:\/\/[a-z]{20}\.supabase\.co$/);
  assert.ok(!base.includes(STG_REF), "must not point at STG");
  assert.deepEqual(rewrites.map(([, d]) => new URL(d).pathname), ["/functions/v1/mcp", "/functions/v1/mcp/:path*", "/functions/v1/ai-oauth", "/functions/v1/ai-oauth/:path*"]);
  for (const f of ["ai-gateway/vercel.json", "ai-gateway/.well-known/oauth-authorization-server", "ai-gateway/.well-known/oauth-protected-resource/mcp"]) {
    assert.ok(!(await read(f)).includes(STG_REF), f);
  }
  assert.deepEqual(cfg.redirects, [{ source: "/", destination: "https://playnavi.app/help/claude", permanent: false }]);
});

test("ai.playnavi.app discovery documents name itself as the issuer and resource (root issuer, no path)", async () => {
  const as = JSON.parse(await read("ai-gateway/.well-known/oauth-authorization-server"));
  assert.equal(as.issuer, HOST);
  for (const k of ["authorization_endpoint", "token_endpoint", "revocation_endpoint"]) assert.ok(as[k].startsWith(`${HOST}/ai-auth/`), k);
  assert.deepEqual(as.code_challenge_methods_supported, ["S256"]);
  assert.ok(as.token_endpoint_auth_methods_supported.includes("none"), "Claude is a public client (PKCE)");
  assert.equal(as.client_id_metadata_document_supported, true);
  const pr = JSON.parse(await read("ai-gateway/.well-known/oauth-protected-resource/mcp"));
  assert.deepEqual(pr, { resource: `${HOST}/mcp`, authorization_servers: [HOST], bearer_methods_supported: ["header"], resource_name: "PlayNavi" });
});

// 11/6 OpenAI がプラグインを承認 (住所 https://playnavi.app/mcp は公開後に変えられない) → playnavi.app も本番へ。
// 本番の EF は ai.playnavi.app と playnavi.app の 2 つの住所に答える。どちらから来たかは転送先の道の先頭の印 /site/playnavi.app で見分ける
// (playnavi-supabase _shared/aiOauthStore.ts siteOf。⛔ Vercel が自動で付ける ?host= は :path* のある道には付かないので頼らない)
test("playnavi.app sends /mcp and /ai-auth to the same production project as ai.playnavi.app, marked /site/playnavi.app, never STG", async () => {
  const root = JSON.parse(await read("vercel.json"));
  const gw = JSON.parse(await read("ai-gateway/vercel.json"));
  const prodBase = new URL(gw.rewrites[0].destination).origin;
  const ai = root.rewrites.filter((r) => /^\/(mcp|ai-auth)/.test(r.source) && r.has);
  assert.deepEqual(ai.map((r) => [r.source, r.has]), [
    ["/mcp", [{ type: "host", value: "playnavi.app" }]],
    ["/mcp/:path*", [{ type: "host", value: "playnavi.app" }]],
    ["/ai-auth", [{ type: "host", value: "playnavi.app" }]],
    ["/ai-auth/:path*", [{ type: "host", value: "playnavi.app" }]],
  ]);
  assert.deepEqual(ai.map((r) => r.destination), [
    `${prodBase}/functions/v1/mcp/site/playnavi.app`,
    `${prodBase}/functions/v1/mcp/site/playnavi.app/:path*`,
    `${prodBase}/functions/v1/ai-oauth/site/playnavi.app`,
    `${prodBase}/functions/v1/ai-oauth/site/playnavi.app/:path*`,
  ]);
  assert.ok(!(await read("vercel.json")).includes(STG_REF), "no route of playnavi.app points at STG any more");
  // 静的の案内 (Vercel は /.well-known を転送できない) は playnavi.app を名乗る (本番の EF の印つきの答えと同じ)
  const as = JSON.parse(await read(".well-known/oauth-authorization-server"));
  assert.equal(as.issuer, "https://playnavi.app");
  for (const k of ["authorization_endpoint", "token_endpoint", "revocation_endpoint"]) assert.ok(as[k].startsWith("https://playnavi.app/ai-auth/"), k);
  assert.equal(as.client_id_metadata_document_supported, true);
  assert.deepEqual(JSON.parse(await read(".well-known/oauth-protected-resource/mcp")),
    { resource: "https://playnavi.app/mcp", authorization_servers: ["https://playnavi.app"], bearer_methods_supported: ["header"], resource_name: "PlayNavi" });
  // 2 つの置き場の案内は、住所の違いを除いて同じ中身 (本番の EF の metadata() が 1 つだから)
  const gwAs = JSON.parse(await read("ai-gateway/.well-known/oauth-authorization-server"));
  assert.deepEqual(JSON.parse(JSON.stringify(as).replaceAll("https://playnavi.app", "https://ai.playnavi.app")), gwAs);
});

test("the Claude help page tells users the ai.playnavi.app address", async () => {
  const html = await read("help-claude.html");
  assert.match(html, /https:\/\/ai\.playnavi\.app\/mcp/);
  assert.doesNotMatch(html, /<code>https:\/\/playnavi\.app\/mcp<\/code>/);
});
