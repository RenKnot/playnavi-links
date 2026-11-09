import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const sha256 = async (path) => createHash("sha256")
  .update(await readFile(new URL(path, import.meta.url)))
  .digest("hex");

test("survey login pins the reviewed provider marks", async () => {
  assert.equal(
    await sha256("../assets/icons/apple.png"),
    "ebc00067f204c9f44dda5d99def910e7d884556f46570092bf6fb75dc2ed7f91",
  );
  assert.equal(
    await sha256("../assets/icons/google.png"),
    "a0f46b17437d558e91660b02e9613d9feb746bb1cf6ed34c4c3b325b6762f983",
  );
});

test("survey login follows the centered provider-group and warning visual contract", async () => {
  const css = await readFile(new URL("../assets/site.css", import.meta.url), "utf8");
  assert.match(css, /#survey-title\s*\{[\s\S]*font-size: clamp\(32px, 8vw, 40px\)/);
  assert.match(css, /#survey-title::after\s*\{[\s\S]*background: linear-gradient/);
  assert.match(css, /\.oauth-actions\s*\{[^}]*width: min\(92vw, 420px\);[^}]*gap: 14px/);
  assert.match(css, /\.oauth\s*\{[^}]*height: 52px;[^}]*gap: 10px;[^}]*justify-content: center;[^}]*border: 1px solid #747775;[^}]*border-radius: 12px;[^}]*color: #1f1f1f;[^}]*background: #fff;[^}]*box-shadow: 0 2px 6px/);
  assert.match(css, /\.oauth\.google\s*\{[^}]*font-family: Roboto, Arial, sans-serif;[^}]*font-weight: 500/);
  assert.match(css, /\.oauth-icon\s*\{[^}]*flex: 0 0 auto;[^}]*object-fit: contain/);
  assert.doesNotMatch(css, /\.oauth-icon\s*\{[^}]*position: absolute/);
  assert.match(css, /\.apple-icon\s*\{[^}]*width: 20px;[^}]*height: 24px/);
  assert.match(css, /\.google-icon\s*\{[^}]*width: 24px;[^}]*height: 24px/);
  assert.match(css, /\.oauth span\s*\{[^}]*flex: 0 1 auto;[^}]*text-align: left/);
  assert.match(css, /#survey-description\.auth-warning\s*\{[^}]*color: var\(--warning\);[^}]*font-weight: 700/);
});

test("Android association uses the reviewed Play App Signing certificate", async () => {
  const assetLinks = await readJson("../.well-known/assetlinks.json");
  assert.deepEqual(assetLinks[0].target.sha256_cert_fingerprints, [
    "FA:AD:DE:14:4B:F6:6C:23:C4:4A:4B:65:5D:CD:4A:2F:76:94:38:60:FD:DB:DE:C7:DC:04:1A:82:DF:7B:E4:A7",
  ]);
});

test("AASA includes the exact AI return path and existing link routes", async () => {
  const aasa = await readJson("../.well-known/apple-app-site-association");
  assert.deepEqual(aasa.applinks.details[0].paths, [
    "/a",
    "/s/*",
    "/users/*",
    "/catalogs/*",
    "/game/*",
  ]);
});

test("production-only legacy routes and share preview stay ahead of safe fallbacks and the SPA", async () => {
  const config = await readJson("../vercel.json");
  const sources = config.rewrites.map(({ source }) => source);
  assert.deepEqual(sources, [
    // TASK-20261107-002: old company-site hosts (playnavilab.com / www) first — the temporary legal-page
    // exception (200 with the single copy) and robots.txt (tests/company-site.test.mjs)
    "/terms",
    "/privacypolicy",
    "/legal",
    "/robots.txt",
    "/auth/steam/callback",
    "/auth/steam/callback",
    "/auth/steam/callback",
    "/api/share-links/:code",
    "/api/share-links/:code",
    "/api/share-links/:code",
    "/api/share-links/:code",
    "/oauth-client-metadata.json",
    "/bluesky-auth/jwks.json",
    "/bluesky-auth/callback",
    "/oauth-client-metadata.json",
    "/bluesky-auth/:path*",
    "/mcp",
    "/mcp/:path*",
    "/ai-auth",
    "/ai-auth/:path*",
    "/mcp",
    "/mcp/:path*",
    "/ai-auth",
    "/ai-auth/:path*",
    "/api/surveys/:surveySlug/responses",
    "/api/surveys/:surveySlug",
    "/a",
    "/s/:code",
    "/game/:id",
    "/users/:ownerId/custom-rankings/:rankingId",
    "/users/:ownerId/tier-lists/:listId",
    "/users/:id/best-games",
    "/users/:id/diagnosis",
    "/users/:id",
    "/catalogs/:id",
    "/surveys/:surveySlug",
    "/privacy",
    // TASK-20261107-002: the legal pages move off Squarespace to playnavi.app (served like /privacy)
    "/terms",
    "/legal",
    "/help/claude",
    "/help/chatgpt",
    // TASK-20261107-002: robots.txt per host (playnavi.app and its check deployments / everything else)
    "/robots.txt",
    "/robots.txt",
    "/robots.txt",
    // TASK-20260923-002 一般公開: 予約の住所が全部決まった後、最後の受け皿の直前で新しい Web へ中継する (tests/web-gateway.test.mjs)
    "/index.html",
    "/index.html",
    "/survey-login-error",
    sources.at(-3),
    sources.at(-2),
    "/(.*)",
  ]);
  assert.ok(sources.at(-3).startsWith("/:path((?!") && sources.at(-2) === sources.at(-3));

  // The allowlist differs per route because share links are minted on a host
  // that never serves the Steam callback.
  const productionHostsBySource = {
    "/auth/steam/callback": [
      "links.playnavilab.com",
      "playnavi-links.vercel.app",
    ],
    "/api/share-links/:code": [
      "playnavi.app",
      "links.playnavilab.com",
      "playnavi-links.vercel.app",
    ],
  };
  // AI 連携 (MCP と専用鍵の窓口、V5 群6)。住所は playnavi.app (OpenAI の住所確認)。
  // 転送先は 1 つの Supabase プロジェクトにそろえる (11/6 から本番。道の先頭に /site/playnavi.app の印)。他のホストでは止める
  const aiSources = ["/mcp", "/mcp/:path*", "/ai-auth", "/ai-auth/:path*"];
  const aiRoutes = aiSources.map((source) => config.rewrites.filter((route) => route.source === source));
  const aiProject = /^https:\/\/([a-z]+)\.supabase\.co\/functions\/v1\//.exec(aiRoutes[0][0].destination)?.[1];
  assert.ok(aiProject, "AI routes go to a Supabase function");
  for (const routes of aiRoutes) {
    assert.equal(routes.length, 2);
    assert.deepEqual(routes[0].has, [{ type: "host", value: "playnavi.app" }]);
    assert.ok(routes[0].destination.startsWith(`https://${aiProject}.supabase.co/functions/v1/`), routes[0].source);
    assert.match(routes[0].destination, /^https:\/\/[a-z]+\.supabase\.co\/functions\/v1\/(mcp|ai-oauth)\/site\/playnavi\.app(\/:path\*)?$/, routes[0].source);
    assert.equal(routes[1].has, undefined);
    assert.equal(routes[1].destination, "/api/legacy-route-disabled");
  }
  // Bluesky のログイン (TASK-20261021-002 10/30 Emiya「承認画面で Supabase の URL が出てんだけど…PlayNavi のドメインのにちゃんと差し替えて」):
  // Bluesky が取りに来る 3 つ (設定の文書 = client_id・公開鍵・戻り) だけを、本番の EF bluesky-oauth へ playnavi.app から転送する。
  // client_id は決まった形 https://playnavi.app/oauth-client-metadata.json (承認画面にホスト名だけが出る)。他のホスト・他の道は止める
  const steamProject = config.rewrites.find((route) => route.source === "/auth/steam/callback").destination.split("/functions/")[0];
  const bsky = {
    "/oauth-client-metadata.json": "/functions/v1/bluesky-oauth/client-metadata.json",
    "/bluesky-auth/jwks.json": "/functions/v1/bluesky-oauth/jwks.json",
    "/bluesky-auth/callback": "/functions/v1/bluesky-oauth/callback",
  };
  for (const [source, path] of Object.entries(bsky)) {
    const routes = config.rewrites.filter((route) => route.source === source);
    assert.deepEqual(routes[0].has, [{ type: "host", value: "playnavi.app" }], source);
    assert.equal(routes[0].destination, `${steamProject}${path}`, source);
  }
  for (const source of ["/oauth-client-metadata.json", "/bluesky-auth/:path*"]) {
    const fallback = config.rewrites.filter((route) => route.source === source).at(-1);
    assert.equal(fallback.has, undefined, source);
    assert.equal(fallback.destination, "/api/legacy-route-disabled", source);
  }
  assert.equal(config.rewrites.filter((route) => route.destination.includes("/bluesky-oauth")).length, 3);

  for (const [source, productionHosts] of Object.entries(productionHostsBySource)) {
    const routes = config.rewrites.filter((route) => route.source === source);
    assert.equal(routes.length, productionHosts.length + 1);
    assert.deepEqual(
      routes.slice(0, productionHosts.length).map((route) => route.has),
      productionHosts.map((host) => [{ type: "host", value: host }]),
    );
    assert.match(routes[0].destination, /^https:\/\/irbtguncoatqfikctreq\.supabase\.co\//);
    for (const route of routes.slice(1, productionHosts.length)) {
      assert.equal(route.destination, routes[0].destination);
    }
    const fallback = routes[productionHosts.length];
    assert.equal(fallback.destination, "/api/legacy-route-disabled");
    assert.equal(fallback.has, undefined);
  }
});

test("share preview uses the original HTML and only the approved share routes", async () => {
  const config = await readJson("../vercel.json");
  assert.deepEqual(config.functions?.["api/share-preview.mjs"], {
    includeFiles: "link.html",
    regions: ["hnd1"],
  });
  assert.equal(
    config.rewrites.find((entry) => entry.source === "/s/:code")?.destination,
    "/api/share-preview?code=:code",
  );
  const canonical = [
    ["/game/:id", "/api/share-preview?kind=game&id=:id"],
    ["/users/:ownerId/custom-rankings/:rankingId", "/api/share-preview?kind=ranking&ownerId=:ownerId&rankingId=:rankingId"],
    ["/users/:ownerId/tier-lists/:listId", "/api/share-preview?kind=tier_list&ownerId=:ownerId&listId=:listId"],
    ["/users/:id/best-games", "/api/share-preview?kind=best_games&id=:id"],
    ["/users/:id/diagnosis", "/api/share-preview?kind=diagnosis&id=:id"],
    ["/users/:id", "/api/share-preview?kind=user&id=:id"],
    ["/catalogs/:id", "/api/share-preview?kind=catalog&id=:id"],
  ];
  for (const [source, destination] of canonical) {
    const route = config.rewrites.find((entry) => entry.source === source);
    assert.deepEqual(route?.has, [{ type: "host", value: "links.playnavilab.com" }]);
    assert.equal(route?.destination, destination);
  }
  const sources = config.rewrites.map(({ source }) => source);
  assert.ok(sources.indexOf("/users/:ownerId/custom-rankings/:rankingId") < sources.indexOf("/users/:id"));
  assert.ok(sources.indexOf("/users/:ownerId/tier-lists/:listId") < sources.indexOf("/users/:id"));
  assert.ok(sources.indexOf("/users/:id/best-games") < sources.indexOf("/users/:id"));
  assert.ok(sources.indexOf("/users/:id/diagnosis") < sources.indexOf("/users/:id"));
  assert.ok(sources.indexOf("/s/:code") < sources.indexOf("/(.*)"));
});

// TASK-20261107-002 (§5-a 2): playnavi.app's robots.txt mirrors the Web's production rules
// (playnavi-app web/src/app/robots.ts: allow /, disallow /auth/ and /oauth/) and names its sitemap.
// links.playnavilab.com keeps today's file: Google asks each site's robots.txt to name that site's own
// sitemap (developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap, "cross-submit").
// A static robots.txt would win over these rewrites on Vercel, so none may exist.
test("robots.txt is chosen per host: playnavi.app names its sitemap, links keeps allow-all", async () => {
  const config = await readJson("../vercel.json");
  await assert.rejects(readFile(new URL("../robots.txt", import.meta.url)), { code: "ENOENT" });
  const routes = config.rewrites.filter((route) => route.source === "/robots.txt" && !route.has?.[0]?.value?.re?.includes("playnavilab"));
  const relay = config.rewrites.find((route) => route.source.startsWith("/:path((?!") && route.has?.[0]?.value === "playnavi.app");
  const checkHost = config.rewrites.find((route) => route.source.startsWith("/:path((?!") && route.has?.[0]?.value?.re);
  assert.deepEqual(routes, [
    { source: "/robots.txt", has: [{ type: "host", value: "playnavi.app" }], destination: "/robots-playnavi-app.txt" },
    { source: "/robots.txt", has: checkHost.has, destination: "/robots-playnavi-app.txt" },
    { source: "/robots.txt", destination: "/robots-links.txt" },
  ]);
  const at = config.rewrites.indexOf(routes[2]);
  assert.ok(at < config.rewrites.indexOf(relay) && at < config.rewrites.findIndex((route) => route.source === "/(.*)"));
  assert.equal(
    await readFile(new URL("../robots-playnavi-app.txt", import.meta.url), "utf8"),
    "User-agent: *\nAllow: /\nDisallow: /auth/\nDisallow: /oauth/\n\nSitemap: https://playnavi.app/sitemap.xml\n",
  );
  assert.equal(await readFile(new URL("../robots-links.txt", import.meta.url), "utf8"), "User-agent: *\nAllow: /\n");
});

test("AI return path receives the SPA and private document headers", async () => {
  const config = await readJson("../vercel.json");
  const route = config.rewrites.find((entry) => entry.source === "/a");
  assert.equal(route?.destination, "/link.html");
  assert.ok(config.rewrites.indexOf(route) < config.rewrites.findIndex((entry) => entry.source === "/(.*)"));
  const headers = Object.fromEntries(
    config.headers.find((entry) => entry.source === "/a").headers.map(({ key, value }) => [key, value]),
  );
  assert.equal(headers["Cache-Control"], "no-store");
  assert.equal(headers["Referrer-Policy"], "no-referrer");
  assert.equal(headers["X-Robots-Tag"], "noindex, nofollow");
});

test("the host that mints share URLs can reach the resolver on its own origin", async () => {
  // Share URLs are minted as https://playnavi.app/s/{code} (SHORT_LINK_ORIGIN in
  // playnavi-supabase supabase/functions/_shared/shortLinkContract.ts) and the SPA
  // fetches SHORT_LINK_RESOLVER_URL ("/api/share-links") on its own origin. If that
  // host is missing from the rewrite allowlist, every shared link on the web falls
  // through to the local deny fallback and shows "リンクを開けません".
  const config = await readJson("../vercel.json");
  const allowedHosts = config.rewrites
    .filter((route) => route.source === "/api/share-links/:code" && route.has)
    .flatMap((route) => route.has.map((condition) => condition.value));
  assert.ok(
    allowedHosts.includes("playnavi.app"),
    "playnavi.app must reach short-links-resolve",
  );
});

test("dynamic survey API routes are explicitly mapped before the SPA fallback", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  const routes = config.rewrites;
  const responseRoute = routes.findIndex(
    (entry) => entry.source === "/api/surveys/:surveySlug/responses",
  );
  const readRoute = routes.findIndex(
    (entry) => entry.source === "/api/surveys/:surveySlug",
  );
  const spaRoute = routes.findIndex((entry) => entry.source === "/(.*)");

  assert.ok(responseRoute >= 0);
  assert.ok(readRoute >= 0);
  assert.ok(spaRoute >= 0);
  assert.equal(routes[responseRoute].destination, "/api/surveys/[surveySlug]/responses");
  assert.equal(routes[readRoute].destination, "/api/surveys/[surveySlug]");
  assert.ok(responseRoute < readRoute);
  assert.ok(readRoute < spaRoute);
});

test("survey pages receive strict privacy and script policies", async () => {
  const config = await readJson("../vercel.json");
  const surveyHeaders = Object.fromEntries(
    config.headers.find((entry) => entry.source === "/surveys/(.*)").headers
      .map(({ key, value }) => [key, value]),
  );
  assert.equal(surveyHeaders["Cache-Control"], "no-store");
  assert.equal(surveyHeaders["Referrer-Policy"], "no-referrer");
  assert.match(surveyHeaders["Content-Security-Policy"], /script-src 'self'/);
  assert.doesNotMatch(surveyHeaders["Content-Security-Policy"], /unsafe-inline|https?:/);

  const html = await readFile(new URL("../link.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /<style|<script(?![^>]*\bsrc=)/);
});

test("short-link documents and proxy responses are not cached or indexed", async () => {
  const config = await readJson("../vercel.json");
  for (const source of ["/s/(.*)", "/api/share-links/(.*)"]) {
    const headers = Object.fromEntries(
      config.headers.find((entry) => entry.source === source).headers.map(({ key, value }) => [key, value]),
    );
    assert.equal(headers["Cache-Control"], "no-store");
    assert.equal(headers["Referrer-Policy"], "no-referrer");
    assert.equal(headers["X-Robots-Tag"], "noindex, nofollow");
  }
});

test("user copy avoids version labels and store navigation remains explicit", async () => {
  const app = await readFile(new URL("../assets/app.mjs", import.meta.url), "utf8");
  const html = await readFile(new URL("../link.html", import.meta.url), "utf8");
  assert.doesNotMatch(`${app}\n${html}`, /新版|旧版|旧Store/);
  assert.match(
    app,
    /未ログインの場合は、ログイン後にこのリンクをもう一度開く必要があることがあります。/,
  );
  assert.doesNotMatch(app, /window\.location\.(?:href|replace)\s*=.*(?:APP_STORE|PLAY_STORE)/);
});

test("survey code loads only on survey routes and login copy matches stored-data behavior", async () => {
  const app = await readFile(new URL("../assets/app.mjs", import.meta.url), "utf8");
  const surveyApp = await readFile(new URL("../assets/survey-app.mjs", import.meta.url), "utf8");
  const html = await readFile(new URL("../link.html", import.meta.url), "utf8");

  assert.doesNotMatch(app, /import\s*\{\s*startSurvey\s*\}\s*from/);
  assert.match(app, /const \{ startSurvey \} = await import\("\.\/survey-app\.mjs"\)/);
  assert.match(
    app,
    /if \(surveyMatch\) \{\s*void startSurveyRoute\(surveyMatch\[1\]\);\s*return;/,
  );
  assert.match(app, /showSurveyBootstrapFailure/);

  assert.match(
    html,
    /アカウントに紐づく報酬をご提供するため、ログインをお願いします。/,
  );
  assert.match(
    html,
    /回答データにUIDを保存しません。UIDは称号付与だけに使い、回答内容とは紐づけません。/,
  );
  const loginNotice = html.match(/<ul class="login-notice">([\s\S]*?)<\/ul>/)?.[1] || "";
  const noticeItems = [...loginNotice.matchAll(/<li(?: [^>]*)?>(.*?)<\/li>/g)].map((match) => match[1].trim());
  assert.deepEqual(noticeItems, [
    "アカウントに紐づく報酬をご提供するため、ログインをお願いします。",
    "回答データにUIDを保存しません。UIDは称号付与だけに使い、回答内容とは紐づけません。回答内容は個人が分からない形で集計・利用します。",
    "",
  ]);
  assert.match(html, /<li id="survey-guide" class="hidden"><\/li>/);
  assert.match(html, /<img class="oauth-icon google-icon" src="\/assets\/icons\/google\.png" alt="" aria-hidden="true">/);
  assert.match(html, /<img class="oauth-icon apple-icon" src="\/assets\/icons\/apple\.png" alt="" aria-hidden="true">/);
  assert.match(html, /<span>Appleでサインイン<\/span>/);
  assert.match(html, /id="apple-login"[^>]+aria-describedby="apple-login-note"/);
  assert.match(html, /Apple側の仕様で「新規登録」という表示になることがありますが、内部的にはサインインとして処理されるので問題ありません。/);
  assert.match(html, /<span>Google でログイン<\/span>/);
  assert.match(html, /報酬なしでログインせずに回答する/);
  assert.match(surveyApp, /title: preview\?\.title \|\| "アンケート"/);
  assert.ok(html.indexOf('id="apple-login"') < html.indexOf('id="apple-login-note"'));
  assert.ok(html.indexOf('id="apple-login-note"') < html.indexOf('id="google-login"'));
  assert.match(surveyApp, /descriptionTone: authFailure \? "warning" : "default"/);
  assert.match(surveyApp, /authFailure === "account_not_found"/);
  assert.match(surveyApp, /新規登録は行われていません。別のログイン方法を試すか/);
  assert.match(surveyApp, /classList\.toggle\("auth-warning", descriptionTone === "warning"\)/);
  assert.match(surveyApp, /setAttribute\("role", "alert"\)/);
  assert.match(surveyApp, /removeAttribute\("role"\)/);
  assert.doesNotMatch(html, /PlayNaviの登録時と同じログイン方法/);
  assert.doesNotMatch(html, /アンケート内容は匿名での回答になります。/);
});

test("lost OAuth state never falls through to the app-install home", async () => {
  const callback = await readFile(new URL("../api/auth/callback.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../assets/app.mjs", import.meta.url), "utf8");

  assert.match(callback, /returnPathFromOAuthState\(returnedState\)/);
  assert.match(callback, /"\/survey-login-error"/);
  assert.match(callback, /error\.code === "EXISTING_IDENTITY_NOT_FOUND"/);
  assert.match(app, /path === "\/survey-login-error"/);
  assert.match(app, /新規登録は行われていません。元のアンケートのリンクをもう一度開き/);
});

test("OAuth discovery documents are static files (Vercel cannot rewrite /.well-known) and match the AI gateway addresses", async () => {
  const as = await readJson("../.well-known/oauth-authorization-server");
  const rs = await readJson("../.well-known/oauth-protected-resource/mcp");
  assert.equal(as.issuer, "https://playnavi.app");
  assert.equal(as.authorization_endpoint, "https://playnavi.app/ai-auth/authorize");
  assert.equal(as.token_endpoint, "https://playnavi.app/ai-auth/token");
  assert.equal(as.revocation_endpoint, "https://playnavi.app/ai-auth/revoke");
  assert.deepEqual(as.code_challenge_methods_supported, ["S256"]);
  assert.equal("registration_endpoint" in as, false);
  // 10/9 夜: ChatGPT の名乗りの文書 (CIMD) と署名 (private_key_jwt)。OpenAI の管理画面が事前登録の接続 ID を受け付けないため
  assert.equal(as.client_id_metadata_document_supported, true);
  assert.ok(as.token_endpoint_auth_methods_supported.includes("private_key_jwt"));
  assert.deepEqual(as.token_endpoint_auth_signing_alg_values_supported, ["RS256"]);
  assert.equal(rs.resource, "https://playnavi.app/mcp");
  assert.deepEqual(rs.authorization_servers, ["https://playnavi.app"]);
  const config = await readJson("../vercel.json");
  const rule = config.headers.find(({ source }) => source === "/.well-known/(oauth-authorization-server|oauth-protected-resource/mcp)");
  assert.ok(rule, "json content type for the discovery files");
  assert.ok(rule.headers.some(({ key, value }) => key === "Content-Type" && value === "application/json"));
  assert.equal(config.rewrites.some(({ source }) => source.startsWith("/.well-known/oauth")), false, "no rewrite under /.well-known");
});

test("playnavi.app/privacy serves the full privacy policy, including the AI connection section (10/9 ChatGPT plugin review)", async () => {
  const config = await readJson("../vercel.json");
  const i = config.rewrites.findIndex((r) => r.source === "/privacy");
  assert.equal(config.rewrites[i]?.destination, "/privacy.html");
  assert.ok(i < config.rewrites.findIndex((r) => r.source === "/(.*)"), "must come before the catch-all");
  const page = await readFile(new URL("../privacy.html", import.meta.url), "utf8");
  for (const s of ["<title>プライバシーポリシー | PlayNavi</title>", "PlayNavi Lab", "6-2. AI サービスとの連携", "(4) 保持期間", "Connecting AI services", "contact@playnavilab.com"]) assert.ok(page.includes(s), s);
  // 10/29 (TASK-20261028-005): 10/25 の改定 (6-1 に PlayNavi AI・画像から取り込む機能で送る物) を写す。
  // Squarespace が動いている間は scripts/check-legal-copies.mjs で公式 www.playnavilab.com/privacypolicy と比べる (README「Company site」)
  for (const s of ["最終更新日：2026年10月25日", "(1) PlayNavi AI（話して、または文字を入力して操作を頼む機能）", "(3) 画像から取り込む機能", "これらの機能でも、メールアドレスやパスワードをAIサービスへ送信しません。"]) assert.ok(page.includes(s), s);
  assert.doesNotMatch(page, /<script/i);
});

test("OpenAI domain verification token is served byte-exact as plain text (ChatGPT plugin review, 10/9)", async () => {
  const token = await readFile(new URL("../.well-known/openai-apps-challenge", import.meta.url), "utf8");
  assert.match(token, /^[A-Za-z0-9_-]{20,512}$/, "printable token, no trailing newline");
  const config = await readJson("../vercel.json");
  const rule = config.headers.find(({ source }) => source === "/.well-known/openai-apps-challenge");
  assert.equal(rule?.headers.find(({ key }) => key === "Content-Type")?.value, "text/plain; charset=utf-8");
  assert.equal(config.rewrites.some(({ source }) => source.startsWith("/.well-known/")), false, "no rewrite under /.well-known");
});

test("playnavi.app/help/claude serves the Claude connection guide with the real MCP address (TASK-20260930-006)", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  const help = config.rewrites.findIndex((r) => r.source === "/help/claude");
  const fallback = config.rewrites.findIndex((r) => r.source === "/(.*)");
  assert.equal(config.rewrites[help]?.destination, "/help-claude.html");
  assert.ok(help >= 0 && help < fallback, "help rewrite must come before the catch-all");
  const html = await readFile(new URL("../help-claude.html", import.meta.url), "utf8");
  // TASK-20261107-002: one link to the Web top, marked via=links (absolute: links.playnavilab.com/ is the links home)
  assert.match(html, /<p><a href="https:\/\/playnavi\.app\/\?via=links">PCで使う（Web版）<\/a><\/p>/);
  // 10/27: Claude は本番の入口 ai.playnavi.app (playnavi.app/mcp は ChatGPT の審査の間 STG)
  assert.match(html, /https:\/\/ai\.playnavi\.app\/mcp/);
  assert.match(html, /カスタムコネクタを追加/);
  assert.match(html, /\/privacy/);
  // 10/30 Emiya「勝手に入る内容で変えずに確定していけば大丈夫とか、全スキルを常に承認にするのがおすすめとか」: つなぐ時の手順を厚く
  assert.match(html, /入っている内容は何も変えずに「追加」/);
  assert.match(html, /詳細設定/);
  assert.match(html, /アプリで使っているのと同じ方法/);
  assert.match(html, /道具を全部「常に許可」/);
  assert.match(html, /確定するまで記録は変わりません/);
  assert.match(html, /id="trouble"/);
});

test("playnavi.app/help/chatgpt serves the ChatGPT guide for the published plugin (TASK-20260930-006, 11/6 公開)", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  const help = config.rewrites.findIndex((r) => r.source === "/help/chatgpt");
  const fallback = config.rewrites.findIndex((r) => r.source === "/(.*)");
  assert.equal(config.rewrites[help]?.destination, "/help-chatgpt.html");
  assert.ok(help >= 0 && help < fallback, "help rewrite must come before the catch-all");
  const html = await readFile(new URL("../help-chatgpt.html", import.meta.url), "utf8");
  // TASK-20261107-002: one link to the Web top, marked via=links (absolute: links.playnavilab.com/ is the links home)
  assert.match(html, /<p><a href="https:\/\/playnavi\.app\/\?via=links">PCで使う（Web版）<\/a><\/p>/);
  // 11/6 Emiya「パブリッシュも押しました」: 公開ページ (Emiya が貼った住所) を開くボタンと、プラグインで探す道
  assert.match(html, /<a class="add" href="https:\/\/chatgpt\.com\/plugins\/plugin_asdk_app_6ac8eb791dc48191b4b611f969f65ad2">ChatGPT で PlayNavi を開く<\/a>/);
  assert.match(html, /「プラグイン」で「PlayNavi」と探しても開けます/);
  // 11/6 Emiya「設定の仕方、めちゃくちゃ簡単だと思うので、それがちゃんと伝わるメッセージやUIにしてください。ごちゃごちゃ書いたり、たんぱくにかいたりしてると、つたわらない」
  // → 最初の画面に「3 ステップ」・URL の入力が要らない・大きなボタン・3 つの手順・「これで完了」。細かい話は下の .more へ
  assert.match(html, /3 ステップでつながります/);
  assert.match(html, /URL の入力も、むずかしい設定もいりません/);
  const three = /<ol class="three" id="steps">([\s\S]*?)<\/ol>/.exec(html)?.[1] ?? "";
  assert.equal((three.match(/<li>/g) ?? []).length, 3, "exactly three steps");
  // 11/6 Emiya の録画 (iPhone の ChatGPT): ボタンの名前は「プラグインをインストール」(前の「追加」は実物と違った)
  assert.match(three.replace(/<[^>]+>/g, ""), /「プラグインをインストール」を押す/);
  assert.match(three, /<span class="nw">「プラグインを<\/span><span class="nw">インストール」を押す<\/span>/, "the button name only breaks after 「プラグインを」");
  assert.match(three, /PlayNavi にログイン/);
  assert.match(three, /「連携する」を押す/);
  assert.match(html, /これで完了です/);
  // 11/6 Emiya「セットアップから1つ頼んで見るところまでの動画…編集してくれる？」: 3 つの手順のすぐ下に実際の画面の動画 (SNS の投稿と同じ物)
  const movie = /<figure class="movie">([\s\S]*?)<\/figure>/.exec(html)?.[1] ?? "";
  assert.match(movie, /<video src="\/assets\/help\/chatgpt-setup\.mp4" poster="\/assets\/help\/chatgpt-setup-poster\.jpg" controls muted playsinline preload="none"/);
  assert.ok(html.indexOf('class="three"') < html.indexOf('class="movie"') && html.indexOf('class="movie"') < html.indexOf('class="more"'), "the video sits right under the three steps");
  for (const asset of ["chatgpt-setup.mp4", "chatgpt-setup-poster.jpg"]) {
    const size = (await stat(new URL(`../assets/help/${asset}`, import.meta.url))).size;
    assert.ok(size > 10_000 && size < 10_000_000, `${asset} is ${size} bytes (the page loads it on phones)`);
  }
  assert.ok(html.indexOf('class="three"') < html.indexOf('class="more"'), "the details come after the three steps");
  // 公開の後は、URL を入れる手順も「承認された方だけ」も案内しない (誰でも使える)
  assert.doesNotMatch(html, /カスタム MCP サーバーを追加|理解したうえで続けます|承認された方だけ|ご利用開始のお知らせが届いた方/);
  assert.doesNotMatch(html, /<code>https:\/\/(ai\.)?playnavi\.app\/mcp<\/code>/, "the address to type is not part of the steps any more");
  // ベータ版の手順で足した人: そのまま使える・切り替える時は「個人用」の物を消す
  assert.match(html, /id="beta"/);
  assert.match(html, /そのままお使いいただけます/);
  assert.match(html, /「個人用」にある PlayNavi を削除/);
  assert.match(html.replace(/<[^>]+>/g, ""), /アプリと同じ方法（Apple か Google）で/);
  assert.match(html, /確定するまで記録は変わりません/);
  // 11/4 Emiya「強制ではないが利便性のために…推奨する旨を、わかりやすい手順とともに」(細かい話の側に残す)
  assert.match(html, /（任意）毎回の確認を省く/);
  assert.match(html, /「管理」→「権限」で「すべてのツールを許可」/);
  // 写真はモーメント 1 件に 10 枚まで送れる (playnavi-supabase mcp/handler.ts MAX_PHOTOS。11/6 に 4 → 10、supabase #751)。前の「送れません」は誤り
  assert.match(html, /1 件に 10 枚まで送れます/);
  assert.doesNotMatch(html, /4 枚まで/);
  assert.doesNotMatch(html, /写真や動画は ChatGPT から送れません/);
  // 11/4 14:50 Emiya「「一覧に載る前〜」…「自分で足す形」…AIが雑に和訳しました、みたいな文章全部やめろ」
  assert.doesNotMatch(html, /一覧に載|自分で足|足す|足した|先行ベータ|つなぎ方|頁/);
  assert.match(html, /#PlayNaviChatGPT/);
  assert.match(html, /「問い合わせ・リクエスト」/);
  assert.match(html, /「機能追加リクエスト」/);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /id="trouble"/);
  assert.match(html, /\/privacy/);
});
