import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildShareView,
  EMBED_ID,
  formatJstDate,
  hasMaskedContent,
  isShareViewTarget,
  safeUrl,
  scoreText,
  readEmbeddedShareView,
  shareModel,
  SOFT_LINE,
  SPOILER_BUTTON,
  startShareView,
} from "../assets/share-view.mjs";
import { canonicalTargetFromPath } from "../assets/link-routing.mjs";

// TASK-20261017-002 r3・r5 記録のページ (サーバが埋め込んだ中身を描く)。DOM は文字と並びだけを見る小さな作り物 (本物の Chrome は share-view-browser.test.mjs)

class FakeNode {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.dataset = {};
    this.style = {};
    this.className = "";
    this.textContent = "";
    this.parent = null;
    const node = this;
    this.classList = {
      add: (name) => { node.className = [...new Set([...node.className.split(" ").filter(Boolean), name])].join(" "); },
      remove: (name) => { node.className = node.className.split(" ").filter((c) => c && c !== name).join(" "); },
      contains: (name) => node.className.split(" ").includes(name),
    };
  }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener() {}
  focus() {}
  click() { for (const fn of this.listeners.click ?? []) fn({ target: this }); }
  get innerHTML() { throw new Error("innerHTML must not be used"); }
  set innerHTML(_) { throw new Error("innerHTML must not be used"); }
  *walk() { yield this; for (const child of this.children) yield* child.walk(); }
  all(predicate) { return [...this.walk()].filter(predicate); }
  byClass(name) { return this.all((node) => node.classList.contains(name)); }
  text() { return [...this.walk()].map((node) => node.textContent).filter(Boolean).join("\n"); }
}

function fakeDocument(ids = []) {
  const byId = new Map(ids.map(([id, className]) => {
    const node = new FakeNode("div");
    node.className = className;
    return [id, node];
  }));
  return {
    body: new FakeNode("body"),
    createElement: (tag) => new FakeNode(tag),
    getElementById: (id) => byId.get(id) ?? null,
    addEventListener() {},
    removeEventListener() {},
    byId,
  };
}

const UUID = "12345678-1234-1234-1234-123456789abc";
const MEMORY = "abcdefab-cdef-cdef-cdef-abcdefabcdef";
const STORAGE = "https://fixture.supabase.co/storage/v1/object/sign";
const MOMENT_VIEW = {
  kind: "moment",
  canonical_path: `/game/42?logId=${UUID}&moment=${MEMORY}`,
  app_url: `https://links.playnavilab.com/game/42?logId=${UUID}&moment=${MEMORY}`,
  game: { id: 42, title: "ゼルダの伝説", cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1.jpg" },
  author: { display_name: "あかり", avatar_url: null },
  date: "2026-10-20T15:30:00Z",
  spoiler: false,
  title: "ついに倒した",
  body: "<img src=x onerror=alert(1)>\n2 行目",
  media: [
    { kind: "video", url: `${STORAGE}/game-log-video-private/v.mp4?token=a`, poster_url: `${STORAGE}/game-log-media-private/p.jpg?token=b`, duration_ms: 83_000 },
    { kind: "image", url: `${STORAGE}/game-log-media-private/1.jpg?token=c`, width: 1200, height: 900 },
    { kind: "image", url: `${STORAGE}/game-log-media-private/2.jpg?token=d`, width: null, height: null },
  ],
};
const REVIEW_VIEW = {
  kind: "review",
  canonical_path: `/game/42?logId=${UUID}`,
  app_url: `https://links.playnavilab.com/game/42?logId=${UUID}`,
  game: { id: 42, title: "ゼルダの伝説", cover_url: null },
  author: { display_name: "あかり", avatar_url: "https://fixture.supabase.co/storage/v1/object/public/avatars/a.png" },
  date: "2026-10-19T23:59:59+09:00",
  spoiler: false,
  status: "completed",
  score: 9.5,
  comment: "最高でした",
  moments_count: 3,
  media: [{ kind: "image", url: `${STORAGE}/game-log-media-private/r.jpg?token=e`, width: 800, height: 600 }],
};
const ok = (view) => ({ status: "ok", view });

test("share view is offered only for moment and review links", () => {
  assert.equal(isShareViewTarget(canonicalTargetFromPath(`/game/42?logId=${UUID}&moment=${MEMORY}`)), true);
  assert.equal(isShareViewTarget(canonicalTargetFromPath(`/game/42?logId=${UUID}`)), true);
  for (const path of ["/game/42", `/users/${UUID}`, `/users/${UUID}/diagnosis`, `/catalogs/${UUID}`, `/users/${UUID}/tier-lists/${UUID}`]) {
    assert.equal(isShareViewTarget(canonicalTargetFromPath(path)), false, path);
  }
  assert.equal(isShareViewTarget(null), false);
});

test("dates are shown in Japan time and scores like the app", () => {
  assert.equal(formatJstDate("2026-10-20T15:30:00Z"), "2026年10月21日", "crosses midnight in JST");
  assert.equal(formatJstDate("2026-10-19T23:59:59+09:00"), "2026年10月19日");
  assert.equal(formatJstDate("2026-01-05T00:00:00Z"), "2026年1月5日");
  for (const bad of [null, "", "yesterday", 123]) assert.equal(formatJstDate(bad), null);
  assert.equal(scoreText(9.5), "9.5");
  assert.equal(scoreText(8), "8");
  for (const bad of [null, -1, 11, "9", Number.NaN]) assert.equal(scoreText(bad), null);
});

test("the view model keeps only https media and known fields", () => {
  const moment = shareModel(ok(MOMENT_VIEW));
  assert.equal(moment.kind, "moment");
  assert.equal(moment.kindLabel, "あかりさんのモーメント");
  assert.equal(moment.dateText, "2026年10月21日");
  assert.equal(moment.title, "ついに倒した");
  assert.deepEqual(moment.media.map((item) => item.kind), ["video", "image", "image"]);
  assert.equal(moment.media[0].durationText, "1:23");
  assert.match(moment.media[0].posterUrl, /^https:/);

  const review = shareModel(ok(REVIEW_VIEW));
  assert.equal(review.kindLabel, "あかりさんのプレイ記録");
  assert.equal(review.statusLabel, "クリア");
  assert.equal(review.scoreText, "9.5");
  assert.equal(review.momentsLine, "このプレイのモーメント 3 件はアプリで");
  assert.equal(shareModel(ok({ ...REVIEW_VIEW, moments_count: 0 })).momentsLine, null);
  assert.equal(shareModel(ok({ ...REVIEW_VIEW, status: "want_to_play" })).statusLabel, null);

  const unsafe = shareModel(ok({
    ...MOMENT_VIEW,
    game: { ...MOMENT_VIEW.game, cover_url: "javascript:alert(1)" },
    author: { display_name: "  ", avatar_url: "http://example.com/a.png" },
    media: [
      { kind: "image", url: "javascript:alert(1)" }, { kind: "image", url: "data:image/png;base64,AAAA" },
      { kind: "audio", url: "https://example.com/a.mp3" }, null, { kind: "video", url: "https://user:pw@example.com/v.mp4" },
      { kind: "image", url: `${STORAGE}/game-log-media-private/ok.jpg?token=x` },
    ],
  }));
  assert.equal(unsafe.game.coverUrl, null);
  assert.equal(unsafe.author.avatarUrl, null);
  assert.equal(unsafe.author.name, "ユーザー");
  assert.deepEqual(unsafe.media.map((item) => item.url), [`${STORAGE}/game-log-media-private/ok.jpg?token=x`]);
  assert.equal(safeUrl("https://a.example/x"), "https://a.example/x");

  for (const bad of [
    null, { status: "not_found" }, { status: "ok" }, ok({ ...MOMENT_VIEW, kind: "game" }),
    ok({ ...MOMENT_VIEW, game: { title: "" } }), ok({ ...MOMENT_VIEW, game: null }),
  ]) assert.equal(shareModel(bad), null, JSON.stringify(bad));
});

test("the page is built with text nodes only and puts the content in order", async () => {
  const doc = fakeDocument();
  const root = buildShareView(doc, shareModel(ok(MOMENT_VIEW)));
  const text = root.text();
  for (const piece of ["あかりさんのモーメント", "ゼルダの伝説", "あかり", "2026年10月21日", "ついに倒した", "<img src=x onerror=alert(1)>\n2 行目", "1:23"]) {
    assert.ok(text.includes(piece), piece);
  }
  // The body's markup-looking text stays text (no element was made from it).
  assert.equal(root.all((node) => node.tagName === "IMG").length, 2 + 1, "cover + 2 photos");
  const video = root.all((node) => node.tagName === "VIDEO")[0];
  assert.equal(video.controls, true);
  assert.equal(video.preload, "metadata");
  assert.equal(video.getAttribute("playsinline"), "");
  assert.match(video.poster, /p\.jpg/);
  assert.match(video.src, /game-log-video-private\/v\.mp4/);
  const source = await readFile(new URL("../assets/share-view.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|outerHTML|document\.write/);
});

test("a review shows status, satisfaction, the comment, photos and the moments line", () => {
  const root = buildShareView(fakeDocument(), shareModel(ok(REVIEW_VIEW)));
  const text = root.text();
  for (const piece of ["あかりさんのプレイ記録", "クリア", "満足度", "9.5", "/10", "最高でした", "このプレイのモーメント 3 件はアプリで"]) {
    assert.ok(text.includes(piece), piece);
  }
  assert.equal(root.byClass("share-media-item").length, 1);
  assert.ok(root.byClass("share-avatar")[0].src.startsWith("https://"));
});

test("a spoiler hides the text and every photo / video until the reader asks", () => {
  const root = buildShareView(fakeDocument(), shareModel(ok({ ...MOMENT_VIEW, spoiler: true })));
  assert.equal(root.text().includes("ついに倒した"), false);
  assert.equal(root.text().includes("2 行目"), false);
  assert.equal(root.all((node) => node.tagName === "VIDEO").length, 0);
  assert.equal(root.byClass("share-media").length, 0);
  const button = root.all((node) => node.textContent === SPOILER_BUTTON)[0];
  assert.ok(button, "the reveal button");
  button.click();
  assert.ok(root.text().includes("ついに倒した"));
  assert.equal(root.all((node) => node.tagName === "VIDEO").length, 1);
  assert.equal(root.byClass("share-spoiler").length, 0);

  const review = buildShareView(fakeDocument(), shareModel(ok({ ...REVIEW_VIEW, spoiler: true })));
  assert.ok(review.text().includes("9.5"), "the satisfaction is not a spoiler");
  assert.equal(review.text().includes("最高でした"), false);
  // Nothing to hide = no button.
  const empty = shareModel(ok({ ...REVIEW_VIEW, spoiler: true, comment: null, media: [] }));
  assert.equal(hasMaskedContent(empty), false);
  assert.equal(buildShareView(fakeDocument(), empty).byClass("share-spoiler").length, 0);
});

test("tapping a photo opens the viewer on that photo (videos are not in the viewer)", () => {
  const opened = [];
  const root = buildShareView(fakeDocument(), shareModel(ok(MOMENT_VIEW)), { onOpen: (images, index) => opened.push([images.length, index]) });
  const buttons = root.byClass("share-media-item").filter((node) => node.tagName === "BUTTON");
  buttons[1].click();
  assert.deepEqual(opened, [[2, 1]]);
});

function embed(doc, text) {
  const node = new FakeNode("script");
  node.textContent = text;
  doc.byId.set(EMBED_ID, node);
  return doc;
}

test("the content is read from the JSON the server embedded (no network); broken or missing JSON is ignored", async () => {
  const doc = embed(fakeDocument(), JSON.stringify(ok(MOMENT_VIEW)));
  assert.equal(readEmbeddedShareView(doc).kind, "moment");
  // The server escapes <, >, &, U+2028 and U+2029 inside the script; JSON.parse restores them.
  const body = "</script><script>alert(1)</script>\u2028x";
  const escaped = JSON.stringify(ok({ ...MOMENT_VIEW, body }))
    .replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
  assert.equal(escaped.includes("</script>"), false);
  assert.equal(readEmbeddedShareView(embed(fakeDocument(), escaped)).body, body);
  for (const bad of ["", "{", "null", JSON.stringify({ status: "not_found" }), JSON.stringify(ok({ ...MOMENT_VIEW, kind: "game" }))]) {
    assert.equal(readEmbeddedShareView(embed(fakeDocument(), bad)), null, bad);
  }
  assert.equal(readEmbeddedShareView(fakeDocument()), null);
  const source = await readFile(new URL("../assets/share-view.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bfetch\(|XMLHttpRequest/);
});

test("startShareView fills the page from the embedded JSON and leaves today's page alone without it", () => {
  const ids = [["share-view", "share-view hidden"], ["link-view", "card"], ["share-soft", "share-soft hidden"]];
  const target = canonicalTargetFromPath(MOMENT_VIEW.canonical_path);

  const doc = embed(fakeDocument(ids), JSON.stringify(ok(MOMENT_VIEW)));
  assert.equal(startShareView(target, { doc }), true);
  assert.equal(doc.byId.get("share-view").classList.contains("hidden"), false);
  assert.equal(doc.byId.get("link-view").classList.contains("has-share"), true);
  assert.equal(doc.byId.get("share-soft").classList.contains("hidden"), false);

  // /s/<code>: the type is decided by the server, so the page passes null.
  const short = embed(fakeDocument(ids), JSON.stringify(ok(REVIEW_VIEW)));
  assert.equal(startShareView(null, { doc: short }), true);
  assert.ok(short.byId.get("share-view").text().includes("最高でした"));

  const failed = embed(fakeDocument(ids), JSON.stringify({ status: "not_found" }));
  assert.equal(startShareView(target, { doc: failed }), false);
  assert.equal(failed.byId.get("share-view").classList.contains("hidden"), true);
  assert.equal(failed.byId.get("link-view").classList.contains("has-share"), false);
  assert.equal(failed.byId.get("share-soft").classList.contains("hidden"), true);

  assert.equal(startShareView(target, { doc: fakeDocument(ids) }), false);

  // Other canonical link types never draw, even with JSON present.
  const game = embed(fakeDocument(ids), JSON.stringify(ok(MOMENT_VIEW)));
  assert.equal(startShareView(canonicalTargetFromPath("/game/42"), { doc: game }), false);
  assert.equal(game.byId.get("share-view").classList.contains("hidden"), true);
});

test("index.html carries the share containers and the soft line; the app module loads share-view lazily", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<article id="share-view" class="share-view hidden"><\/article>/);
  assert.ok(html.includes(`<p id="share-soft" class="share-soft hidden">${SOFT_LINE}</p>`));
  assert.ok(html.indexOf('id="share-view"') < html.indexOf('id="primary-btn"'), "content above the app button");
  assert.ok(html.indexOf('id="store-buttons"') < html.indexOf('id="share-soft"'));
  const app = await readFile(new URL("../assets/app.mjs", import.meta.url), "utf8");
  assert.match(app, /await import\("\.\/share-view\.mjs"\)/);
  assert.doesNotMatch(app, /from "\.\/share-view\.mjs"/);
  // The module is loaded only when the server embedded the content; both /s/<code> and canonical pages call it.
  assert.match(app, /if \(!document\.getElementById\("pn-share-view"\)\) return;/);
  assert.match(app, /void showShareView\(null\);\n    openShortLink\(code\);/);
  assert.match(app, /function openCanonicalTarget\(target\) \{\n  void showShareView\(target\);/);
  // The existing app-open flow is untouched: scheme first, store buttons after 2 s, /s/ -> canonical after 50 ms.
  assert.match(app, /window\.location\.href = target\.schemeUrl;/);
  assert.match(app, /const LAUNCH_TIMEOUT_MS = 2000;/);
  assert.match(app, /window\.setTimeout\(\(\) => window\.location\.replace\(target\.canonicalUrl\), 50\);/);
});
