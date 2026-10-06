import assert from "node:assert/strict";
import { readFile, mkdtemp, readdir, rm, symlink, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { webTargetFromPath } from "../assets/link-routing.mjs";
import { GATEWAY_SOURCE, prepareWebGateway, writeCandidate } from "../scripts/prepare-web-gateway.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const UUID = "00000000-0000-0000-0000-000000000001";
const source = async () => ({ config: JSON.parse(await read("vercel.json")), html: await read("index.html"), previewSource: await read("api/share-preview.mjs"), upstreamOrigin: "https://playnavi-web-v2-stg.vercel.app", gatewayOrigin: "https://playnavi.app" });

test("Web landing reuses strict canonical paths and only fixed Web origins", () => {
  for (const path of ["/game/42", `/game/42?logId=${UUID}`, `/users/${UUID}`, `/users/${UUID}/best-games`, `/users/${UUID}/custom-rankings/${UUID}`, `/catalogs/${UUID}`]) {
    assert.equal(webTargetFromPath(path, "https://playnavi.app"), `https://playnavi.app${path}`);
  }
  for (const path of [`/users/${UUID}/diagnosis`, "/a", "/s/AbCdEf012345_-xy", "//evil.example/game/42", "https://evil.example/game/42", "/game/42?next=https://evil.example", "/game/42#x", "/game/9223372036854775808"]) assert.equal(webTargetFromPath(path, "https://playnavi.app"), null);
  for (const origin of ["", "http://playnavi.app", "https://playnavi.app/", "https://links.playnavilab.com", "https://playnavi-links.vercel.app", "https://evil.example", "https://playnavi.app@evil.example"]) assert.equal(webTargetFromPath("/game/42", origin), null);
});

test("candidate changes entrypoint atomically and preserves reserved contracts", async () => {
  const original = await source();
  const before = JSON.stringify(original);
  const candidate = prepareWebGateway(original);
  assert.equal(JSON.stringify(original), before);
  assert.equal(candidate.config.functions["api/share-preview.mjs"].includeFiles, "link.html");
  assert.match(candidate.previewSource, /join\(process.cwd\(\), "link.html"\)/);
  assert.match(candidate.html, /name="pn-web-origin" content="https:\/\/playnavi.app"/);
  assert.equal(candidate.config.rewrites.some(({ destination }) => destination === "/index.html"), false);
  const matcher = new RegExp(`^/${GATEWAY_SOURCE.slice('/:path('.length, -1)}$`);
  for (const path of ["/", "/game/42", "/login", "/auth/callback", "/_next/static/chunk.js", "/favicon.ico", "/users/uuid", "/users/uuid/best-games", "/catalogs/uuid", "/apple-touch-icon.png"]) assert.equal(matcher.test(path), true, path);
  for (const path of ["/api", "/api/auth/start", "/api/auth/callback", "/api/survey/session/guest", "/api/unknown", "/assets/site.css", "/.well-known/apple-app-site-association", "/a", "/a/extra", "/s/code", "/surveys/slug", "/survey-login-error", "/auth/steam/callback", "/users/uuid/diagnosis", "/users/uuid/diagnosis/extra", "/logo.png", "/og-fallback.png", "/robots.txt", "/link.html"]) assert.equal(matcher.test(path), false, path);
  const gateway = candidate.config.rewrites.find(({ source }) => source === GATEWAY_SOURCE);
  assert.deepEqual(gateway.has, [{ type: "host", value: "playnavi.app" }]);
  assert.equal(gateway.destination, "https://playnavi-web-v2-stg.vercel.app/:path*");
  for (const route of original.config.rewrites.filter(({ destination }) => destination !== "/index.html")) assert.ok(candidate.config.rewrites.some((entry) => JSON.stringify(entry) === JSON.stringify(route)));
  assert.equal(candidate.config.headers.at(-1).headers.find(({ key }) => key === "x-vercel-enable-rewrite-caching").value, "0");
  // A fixture hostname, not a claim that this Vercel resource exists.
  const staging = prepareWebGateway({ ...original, gatewayOrigin: "https://fixture-gateway.vercel.app" });
  assert.deepEqual(staging.config.rewrites.find(({ source }) => source === GATEWAY_SOURCE).has, [{ type: "host", value: "fixture-gateway.vercel.app" }]);
  assert.deepEqual(staging.config.headers.at(-1).has, [{ type: "host", value: "fixture-gateway.vercel.app" }]);
  assert.match(staging.html, /name="pn-web-origin" content="https:\/\/playnavi-web-v2-stg.vercel.app"/);
  assert.equal(staging.config.rewrites.find(({ source }) => source === "/index.html").has[0].value, "fixture-gateway.vercel.app");
});

test("candidate rejects unreviewed protocols, origins and entrypoint drift", async () => {
  const original = await source();
  for (const upstreamOrigin of ["https://playnavi.app", "https://links.playnavilab.com", "https://playnavi-links.vercel.app", "http://localhost:3000", "https://example.com", "https://next.vercel.app/path", "https://next.vercel.app?token=x", "https://a:b@next.vercel.app", "https://next.vercel.app:123", "https://\tnext.vercel.app"]) assert.throws(() => prepareWebGateway({ ...original, upstreamOrigin }));
  assert.throws(() => prepareWebGateway({ ...original, previewSource: "changed" }));
  for (const gatewayOrigin of [undefined, "https://links.playnavilab.com", "https://playnavi-links.vercel.app", original.upstreamOrigin, "http://fixture-gateway.vercel.app", "https://evil.example", "https://fixture-gateway.vercel.app/path", "https://fixture-gateway.vercel.app?key=x", "https://user@fixture-gateway.vercel.app"]) assert.throws(() => prepareWebGateway({ ...original, gatewayOrigin }));
});

test("generation writes fresh non-secret release files and refuses overwrite", async () => {
  const temp = await mkdtemp(join(tmpdir(), "pn-web-gateway-"));
  try {
    const output = join(temp, "candidate");
    const originalHtml = await read("index.html");
    const originalConfig = await read("vercel.json");
    const origins = { upstreamOrigin: "https://playnavi-web-v2-stg.vercel.app", gatewayOrigin: "https://fixture-gateway.vercel.app" };
    await writeCandidate({ output, ...origins });
    assert.equal(await read("index.html"), originalHtml);
    assert.equal(await read("vercel.json"), originalConfig);
    const files = await readdir(output);
    for (const excluded of ["index.html", ".git", ".env", "node_modules", "scripts", "tests", "docs"]) assert.ok(!files.includes(excluded), excluded);
    assert.ok(files.includes("link.html"));
    for (const file of ["apple-app-site-association", "assetlinks.json"]) assert.equal(await readFile(join(output, ".well-known", file), "utf8"), await read(`.well-known/${file}`));
    await assert.rejects(writeCandidate({ output, ...origins }), { code: "EEXIST" });
    const alias = join(temp, "checkout-alias");
    await symlink(fileURLToPath(new URL("../", import.meta.url)), alias);
    const insideCheckout = join(alias, "forbidden-candidate");
    await assert.rejects(writeCandidate({ output: insideCheckout, ...origins }), /outside this checkout/);
    await assert.rejects(access(insideCheckout), { code: "ENOENT" });
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("AI connection (MCP) on playnavi.app goes to the mcp function before the Web relay and the fallback (V5 group 6)", async () => {
  const original = await source();
  const candidate = prepareWebGateway(original);
  for (const config of [original.config, candidate.config]) {
    const rewrites = config.rewrites;
    const index = (pred) => rewrites.findIndex(pred);
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
    const relay = index(({ source: s }) => s === GATEWAY_SOURCE);
    const fallback = index(({ source: s }) => s === "/(.*)");
    for (const later of [relay, fallback].filter((i) => i >= 0)) assert.ok(later > mcpSub, "MCP routes come before the Web relay and the fallback");
  }
  assert.ok(original.config.headers.some(({ source: s, headers }) => s === "/mcp(.*)" && headers.some(({ key, value }) => key === "Cache-Control" && value === "no-store")));
});
