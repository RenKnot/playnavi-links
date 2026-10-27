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

test("playnavi.app itself keeps sending /mcp and /ai-auth to STG while ChatGPT is in review", async () => {
  const root = JSON.parse(await read("vercel.json"));
  const ai = root.rewrites.filter((r) => /^\/(mcp|ai-auth)/.test(r.source) && r.has);
  assert.equal(ai.length, 4);
  for (const r of ai) assert.ok(r.destination.includes(STG_REF), r.source);
  assert.equal(JSON.parse(await read(".well-known/oauth-authorization-server")).issuer, "https://playnavi.app");
});

test("the Claude help page tells users the ai.playnavi.app address", async () => {
  const html = await read("help-claude.html");
  assert.match(html, /https:\/\/ai\.playnavi\.app\/mcp/);
  assert.doesNotMatch(html, /<code>https:\/\/playnavi\.app\/mcp<\/code>/);
});
