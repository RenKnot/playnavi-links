import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { compare, pageParts, toLines } from "../scripts/check-legal-copies.mjs";
import { route } from "./vercel-routing.mjs";

// TASK-20261107-002 §11 (operator 11/9: all content lives only under playnavi.app): the old company-site domains
// playnavilab.com and www.playnavilab.com (Squarespace until now) are attached to this Vercel project and send
// every page to playnavi.app with a 301 (Google's change of address expects 301).
//
// TEMPORARY EXCEPTION — the legal pages (/terms, /privacypolicy, /legal on the old hosts) answer 200 with the same
// single copy that playnavi.app serves (rewrite, canonical link to playnavi.app inside). Reason: the released app
// (5.0.2 and older) opens them in an in-app WebView that only allows the origin https://www.playnavilab.com
// (playnavi-app lib/webViewNavigationPolicy.ts:23-36); a redirect would leave that screen blank and open the
// external browser. EXIT CONDITION: when the minimum supported app version is 5.0.3 or later (the first version
// that opens https://playnavi.app/terms|privacy|legal, playnavi-app constants/legal.ts), switch to 301 by moving
// the first three entries of `rewrites` in vercel.json (OLD_HOST rules for /terms, /privacypolicy, /legal) to the
// top of `redirects` with destination https://playnavi.app/<page> and "statusCode": 301 — see README "Company site",
// and the "switch" test below, which proves that one move is the whole change. Then update the tests below.
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const config = JSON.parse(await read("vercel.json"));
const ROOT = new URL("../", import.meta.url);
const OLD_HOST = [{ type: "host", value: { re: "^(?:www\\.)?playnavilab\\.com$" } }];
const OLD_HOSTS = ["playnavilab.com", "www.playnavilab.com"];
const NEW = "https://playnavi.app";
const LEGAL = { "/terms": "terms.html", "/privacypolicy": "privacy.html", "/legal": "legal.html" };
const NEW_LEGAL_PATH = { "/terms": "/terms", "/privacypolicy": "/privacy", "/legal": "/legal" };
const PRESS_FILES = ["20261102_v5__-se9k.zip", "20261102_v5__.zip", "PlayNavi_AppIcon.png", "PlayNavi_Logo_Transparent.png", "kv.jpg", "web_hero_mb.mp4"];
const SHARE_CODE = "AbCdEf012345_-xy";
const at = (host, path, cfg = config) => route(cfg, ROOT, host, path);
const moved = (result) => (result.kind === "redirect" ? `${result.status} ${result.location}` : result.kind);

test("old company-site hosts: every page is a 301 to playnavi.app", () => {
  const expected = {
    "/": `${NEW}/`,
    "/home": `${NEW}/`,
    "/news": `${NEW}/news`,
    "/news/playnaviaiclaudepcweb": `${NEW}/news/playnaviaiclaudepcweb`,
    "/news/playnavi-major-announcement": `${NEW}/news/playnavi-major-announcement`,
    "/news/category/info": `${NEW}/news`,
    "/news/category": `${NEW}/news`,
    "/news/tag/PlayNavi": `${NEW}/news`,
    "/news/tag/a/b": `${NEW}/news`,
    "/news/2026/11/post": `${NEW}/news`,
    "/press": `${NEW}/press`,
    "/contact": `${NEW}/contact`,
    "/new-page": `${NEW}/`,
    "/s/other-file.pdf": `${NEW}/press`,
    [`/s/${SHARE_CODE}`]: `${NEW}/press`,
    "/s": `${NEW}/press`,
    // everything else, including the paths links serves on its own hosts
    "/privacy": `${NEW}/`,
    "/terms/": `${NEW}/`,
    "/Terms": `${NEW}/`,
    "/terms.html": `${NEW}/`,
    "/privacy.html": `${NEW}/`,
    "/favicon.ico": `${NEW}/`,
    "/link.html": `${NEW}/`,
    "/sitemap.xml": `${NEW}/`,
    "/a": `${NEW}/`,
    "/game/42": `${NEW}/`,
    "/api/share-links/x": `${NEW}/`,
    "/.well-known/apple-app-site-association": `${NEW}/`,
    "/unknown/deep/path": `${NEW}/`,
  };
  for (const file of PRESS_FILES) expected[`/s/${file}`] = `${NEW}/press/files/${file}`;
  for (const host of OLD_HOSTS) {
    for (const [path, location] of Object.entries(expected)) assert.equal(moved(at(host, path)), `301 ${location}`, `${host}${path}`);
  }
});

test("old company-site hosts: robots.txt allows crawling so Google can see the 301s", () => {
  for (const host of OLD_HOSTS) assert.deepEqual(at(host, "/robots.txt").file, "robots-links.txt", host);
});

test("TEMPORARY legal-page exception: old hosts answer 200 with the single copy (released app 5.0.2 and older)", async () => {
  for (const host of OLD_HOSTS) {
    for (const [path, file] of Object.entries(LEGAL)) {
      const result = at(host, path);
      assert.equal(result.kind, "file", `${host}${path} must not redirect (in-app WebView allows only www.playnavilab.com)`);
      assert.equal(result.file, file, `${host}${path}`);
    }
  }
  // the exception is exactly the first three rewrites, bound to the old hosts only
  assert.deepEqual(config.rewrites.slice(0, 3), Object.entries(LEGAL).map(([source, file]) => ({ source, has: OLD_HOST, destination: `/${file}` })));
  // one copy per page (no duplicate files) with the canonical address on playnavi.app inside
  const html = (await readdir(ROOT)).filter((name) => name.endsWith(".html")).sort();
  assert.deepEqual(html, ["help-chatgpt.html", "help-claude.html", "legal.html", "link.html", "privacy.html", "terms.html"]);
  for (const [path, file] of Object.entries(LEGAL)) {
    const page = await read(file);
    assert.equal(page.match(/<link rel="canonical"[^>]*>/g)?.join(), `<link rel="canonical" href="${NEW}${NEW_LEGAL_PATH[path]}">`, file);
    assert.doesNotMatch(page, /noindex|<script/i, file);
  }
});

test("switch to 301 later = move the exception block from rewrites to redirects (one place)", () => {
  const block = config.rewrites.slice(0, 3);
  const switched = {
    ...config,
    redirects: [
      ...block.map(({ source, has }) => ({ source, has, destination: `${NEW}${NEW_LEGAL_PATH[source]}`, statusCode: 301 })),
      ...config.redirects,
    ],
    rewrites: config.rewrites.slice(3),
  };
  for (const host of OLD_HOSTS) {
    for (const path of Object.keys(LEGAL)) assert.equal(moved(at(host, path, switched)), `301 ${NEW}${NEW_LEGAL_PATH[path]}`, `${host}${path}`);
    assert.equal(at(host, "/robots.txt", switched).file, "robots-links.txt");
  }
  // playnavi.app is the same before and after
  for (const path of ["/terms", "/privacy", "/legal", "/privacypolicy"]) assert.deepEqual(moved(at("playnavi.app", path, switched)), moved(at("playnavi.app", path)), path);
});

test("old-host rules come before every other rule and never match other hosts", () => {
  const isOld = (rule) => JSON.stringify(rule.has) === JSON.stringify(OLD_HOST);
  const oldRedirects = config.redirects.filter(isOld);
  assert.equal(oldRedirects.length, 13);
  assert.deepEqual(config.redirects.slice(0, 13), oldRedirects, "old-host redirects first");
  for (const rule of config.redirects) assert.equal(rule.statusCode, 301, rule.source);
  assert.deepEqual(config.rewrites.slice(0, 4).map(isOld), [true, true, true, true], "old-host rewrites first");
  assert.equal(config.rewrites.filter(isOld).length, 4);
  assert.equal(config.headers.some(isOld), false);
  // the old-host catch-all answers everything except the exception and robots.txt
  assert.deepEqual(config.redirects[12], { source: "/:path((?!(?:terms|privacypolicy|legal|robots\\.txt)$).*)", has: OLD_HOST, destination: `${NEW}/`, statusCode: 301 });
  const re = new RegExp(OLD_HOST[0].value.re);
  for (const host of OLD_HOSTS) assert.ok(re.test(host), host);
  for (const host of ["links.playnavilab.com", "playnavi.app", "evilplaynavilab.com", "playnavilab.com.evil.example", "wwwxplaynavilab.com", "www.playnavilab.co", "playnavi-links.vercel.app"]) assert.equal(re.test(host), false, host);
});

test("playnavi.app: legal pages are served by links before the Web relay; /privacypolicy is a 301 to /privacy", () => {
  assert.equal(at("playnavi.app", "/terms").file, "terms.html");
  assert.equal(at("playnavi.app", "/legal").file, "legal.html");
  assert.equal(at("playnavi.app", "/privacy").file, "privacy.html");
  assert.equal(moved(at("playnavi.app", "/privacypolicy")), "301 /privacy");
  assert.deepEqual(config.redirects.at(-1), { source: "/privacypolicy", has: [{ type: "host", value: "playnavi.app" }], destination: "/privacy", statusCode: 301 });
  // unchanged: share links, AI return, robots, the Web relay (including the pages the Web will add: /about /news /press /contact)
  assert.equal(at("playnavi.app", `/s/${SHARE_CODE}`).destination, `/api/share-preview?code=${SHARE_CODE}`);
  assert.equal(at("playnavi.app", "/s/kv.jpg").destination, "/api/share-preview?code=kv.jpg");
  assert.equal(at("playnavi.app", "/a").file, "link.html");
  assert.equal(at("playnavi.app", "/robots.txt").file, "robots-playnavi-app.txt");
  for (const path of ["/", "/about", "/news", "/news/x", "/press", "/press/files/kv.jpg", "/contact", "/home"]) {
    assert.equal(at("playnavi.app", path).destination, `https://playnavi-web.vercel.app${path === "/" ? "/" : path}`, path);
  }
});

test("links.playnavilab.com is unaffected by the old-domain rules", () => {
  const host = "links.playnavilab.com";
  assert.equal(at(host, `/s/${SHARE_CODE}`).destination, `/api/share-preview?code=${SHARE_CODE}`);
  assert.equal(at(host, "/s/kv.jpg").destination, "/api/share-preview?code=kv.jpg");
  assert.equal(at(host, "/game/42").destination, "/api/share-preview?kind=game&id=42");
  assert.equal(at(host, "/a").file, "link.html");
  assert.equal(at(host, "/robots.txt").file, "robots-links.txt");
  for (const path of ["/", "/home", "/news", "/press", "/contact", "/privacypolicy", "/new-page", "/unknown"]) assert.equal(at(host, path).file, "link.html", path);
  assert.equal(at(host, "/privacy").file, "privacy.html");
  // the legal pages are served on every host like /privacy (same rule shape)
  assert.equal(at(host, "/terms").file, "terms.html");
  assert.equal(at(host, "/legal").file, "legal.html");
});

test("the copy checker compares the title and every body line in order", () => {
  const local = pageParts(toLines("<h1>サービス利用規約</h1><p>最終更新日：2026年3月29日</p><h2>第1条（定義）</h2><ol><li>A</li></ol><p class=\"note\">運営: PlayNavi Lab</p>"), ["運営: "]);
  const official = pageParts(toLines("<h3>サ⁠ービス利用規約</h3><p>最終更新日：2026年3月29日</p><p>第1条（定義）</p><ol><li><p>A</p></li></ol><h3>PlayNaviを通じて</h3>"), ["PlayNaviを通じて"]);
  assert.deepEqual(local.body, ["最終更新日：2026年3月29日", "第1条（定義）", "A"]);
  assert.deepEqual(compare(local, official), []);
  assert.equal(compare(local, { ...official, body: ["最終更新日：2026年3月29日", "A", "第1条（定義）"] }).length, 2, "order matters");
  assert.equal(compare({ ...local, title: "利用規約" }, official).length, 1, "title matters");
});
