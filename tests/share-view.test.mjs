import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  APP_STORE_URL,
  buildShareView,
  detectPlatform,
  EMBED_ID,
  formatJstDate,
  hasMaskedContent,
  heroRatio,
  isShareViewTarget,
  OPEN_IN_APP,
  PAGE_CLASS,
  PLAY_STORE_URL,
  safeUrl,
  scoreText,
  readEmbeddedShareView,
  shareModel,
  SPOILER_BUTTON,
  STORY_SPOILER,
  STORY_TITLE,
  storyModel,
  startShareView,
  syncAppLinks,
  UNPLAYABLE_TEXT,
  videoMime,
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
    const style = {};
    style.setProperty = (name, value) => { style[name] = value; };
    this.style = style;
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
  prepend(...nodes) { for (const node of nodes) { node.remove(); node.parent = this; } this.children.unshift(...nodes); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  hasAttribute(name) { return name in this.attributes; }
  querySelector(selector) { return this.byClass(selector.replace(/^\./, ""))[0] ?? null; }
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

function fakeDocument(ids = [], { canPlay = () => "maybe" } = {}) {
  const byId = new Map(ids.map(([id, className]) => {
    const node = new FakeNode("div");
    node.className = className;
    return [id, node];
  }));
  return {
    body: new FakeNode("body"),
    documentElement: new FakeNode("html"),
    createElement: (tag) => {
      const node = new FakeNode(tag);
      if (tag === "video") node.canPlayType = canPlay;
      return node;
    },
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
  assert.equal(moment.kindSuffix, "さんのモーメント");
  assert.equal(moment.appUrl, MOMENT_VIEW.app_url);
  assert.equal(moment.dateText, "2026年10月21日");
  assert.equal(moment.title, "ついに倒した");
  assert.deepEqual(moment.media.map((item) => item.kind), ["video", "image", "image"]);
  assert.equal(moment.media[0].durationText, "1:23");
  assert.equal(moment.media[0].mime, "video/mp4");
  assert.match(moment.media[0].posterUrl, /^https:/);

  const review = shareModel(ok(REVIEW_VIEW));
  assert.equal(review.kindLabel, "あかりさんのレビュー");
  assert.equal(review.statusLabel, "クリア");
  assert.equal(review.scoreText, "9.5");
  assert.equal(review.score, 9.5);
  assert.equal(review.momentsLine, "このプレイのモーメント 3 件はアプリで");
  assert.equal(shareModel(ok({ ...REVIEW_VIEW, moments_count: 0 })).momentsLine, null);
  assert.equal(shareModel(ok({ ...REVIEW_VIEW, status: "want_to_play" })).statusLabel, null);
  assert.equal(shareModel(ok({ ...REVIEW_VIEW, score: 12 })).score, null);

  const unsafe = shareModel(ok({
    ...MOMENT_VIEW,
    app_url: "javascript:alert(1)",
    game: { ...MOMENT_VIEW.game, cover_url: "javascript:alert(1)" },
    author: { display_name: "  ", avatar_url: "http://example.com/a.png" },
    media: [
      { kind: "image", url: "javascript:alert(1)" }, { kind: "image", url: "data:image/png;base64,AAAA" },
      { kind: "audio", url: "https://example.com/a.mp3" }, null, { kind: "video", url: "https://user:pw@example.com/v.mp4" },
      { kind: "image", url: `${STORAGE}/game-log-media-private/ok.jpg?token=x` },
    ],
  }));
  assert.equal(unsafe.appUrl, null);
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

test("r6: the media frame ratio is fixed before loading and kept between 4:5 and 16:9", () => {
  assert.equal(heroRatio([{ kind: "image", width: 1200, height: 900 }]), 4 / 3);
  assert.equal(heroRatio([{ kind: "image", width: 1080, height: 1920 }]), 4 / 5, "tall photos are clamped to 4:5");
  assert.equal(heroRatio([{ kind: "image", width: 3000, height: 1000 }]), 16 / 9, "panoramas are clamped to 16:9");
  assert.equal(heroRatio([{ kind: "video", width: null, height: null }, { kind: "image", width: 1000, height: 1000 }]), 1, "first item with a size wins");
  assert.equal(heroRatio([{ kind: "video", width: null, height: null }]), 16 / 9, "a video without a size is a 16:9 game capture");
  assert.equal(heroRatio([{ kind: "image", width: null, height: null }]), 1);
  assert.equal(videoMime(`${STORAGE}/game-log-video-private/v.mp4?token=a`), "video/mp4");
  assert.equal(videoMime(`${STORAGE}/game-log-video-private/IMG_0001.MOV?token=a`), "video/quicktime");
  assert.equal(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), "ios");
  assert.equal(detectPlatform("Mozilla/5.0 (Linux; Android 14)"), "android");
  assert.equal(detectPlatform("Mozilla/5.0 (Windows NT 10.0)"), "other");
});

test("the page is built with text nodes only: author first, then media, text and game (r7: the poster is the hero)", async () => {
  const doc = fakeDocument();
  const root = buildShareView(doc, shareModel(ok(MOMENT_VIEW)));
  const text = root.text();
  for (const piece of ["あかり", "さんのモーメント", "ゼルダの伝説", "2026年10月21日", "ついに倒した", "<img src=x onerror=alert(1)>\n2 行目", "1:23"]) {
    assert.ok(text.includes(piece), piece);
  }
  // r7 P3: PlayNavi is only the small mark top-left and the quiet end line (no top pill, no fixed bar, no badges, no slogan)
  for (const gone of ["pn-top-open", "pn-bar", "pn-foot", "pn-badges"]) assert.equal(root.byClass(gone).length, 0, gone);
  assert.equal(text.includes("ゲームの記録を残そう"), false);
  // Order: mark -> author -> media -> text -> game -> end line.
  const order = ["pn-top", "pn-author", "pn-hero", "pn-text", "pn-game", "pn-end"].map((name) => [...root.walk()].indexOf(root.byClass(name)[0]));
  assert.deepEqual([...order].sort((a, b) => a - b), order, JSON.stringify(order));
  assert.ok(order.every((index) => index > 0));
  // The body's markup-looking text stays text (no element was made from it).
  assert.equal(root.byClass("pn-photo").length, 2);
  assert.equal(root.byClass("pn-slide").length, 3, "one slide per photo / video, no tiles");
  assert.equal(root.byClass("pn-hero")[0].style["--pn-ratio"], String(Number((4 / 3).toFixed(4))), "the first photo with a size (1200x900)");
  assert.equal(root.byClass("pn-counter")[0].textContent, "1/3");
  assert.equal(root.byClass("pn-dot").length, 3);
  const video = root.all((node) => node.tagName === "VIDEO")[0];
  assert.equal(video.controls, undefined, "no controls until the reader starts it");
  assert.equal(video.autoplay, undefined, "no muted autoplay");
  assert.equal(video.preload, "metadata");
  assert.equal(video.getAttribute("playsinline"), "");
  assert.match(video.poster, /p\.jpg/);
  assert.match(video.src, /game-log-video-private\/v\.mp4/);
  // Big play button: a real <button> with the length in its name.
  const play = root.byClass("pn-play")[0];
  assert.equal(play.tagName, "BUTTON");
  assert.equal(play.getAttribute("aria-label"), "動画を再生 (1:23)");
  let played = 0;
  video.play = () => { played += 1; return Promise.resolve(); };
  play.click();
  assert.equal(played, 1);
  assert.equal(video.controls, true, "controls after start");
  assert.equal(play.hidden, true);
  const source = await readFile(new URL("../assets/share-view.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|outerHTML|document\.write/);
  assert.doesNotMatch(source, /\.muted\s*=|autoplay/);
});

test("r6 Q7: a video the browser cannot play shows the poster, the message and an app link", () => {
  // canPlayType says no (e.g. the iPhone .mov original before re-encoding)
  const mov = { ...MOMENT_VIEW, media: [{ ...MOMENT_VIEW.media[0], url: `${STORAGE}/game-log-video-private/IMG_1.MOV?token=a` }] };
  const asked = [];
  const doc = fakeDocument([], { canPlay: (mime) => { asked.push(mime); return mime === "video/quicktime" ? "" : "maybe"; } });
  const root = buildShareView(doc, shareModel(ok(mov)));
  assert.deepEqual(asked, ["video/quicktime"]);
  const slide = root.byClass("pn-slide-video")[0];
  assert.ok(slide.classList.contains("is-unplayable"));
  assert.equal(root.all((node) => node.tagName === "VIDEO")[0].src, undefined, "nothing is downloaded");
  assert.match(root.all((node) => node.tagName === "VIDEO")[0].poster, /p\.jpg/);
  assert.ok(root.text().includes(UNPLAYABLE_TEXT));
  const link = root.byClass("pn-video-fail-link")[0];
  assert.equal(link.textContent, OPEN_IN_APP);
  assert.equal(link.href, MOMENT_VIEW.app_url);

  // A load error (bad file) does the same, once.
  const broken = buildShareView(fakeDocument(), shareModel(ok(MOMENT_VIEW)));
  const video = broken.all((node) => node.tagName === "VIDEO")[0];
  for (const fn of video.listeners.error) fn({});
  for (const fn of video.listeners.error) fn({});
  assert.equal(broken.byClass("pn-video-fail").length, 1);
  assert.equal(broken.byClass("pn-play")[0].hidden, true);
});

test("a review shows status, the big satisfaction with a bar, the comment, photos and (old EF without story) the moments line", () => {
  const root = buildShareView(fakeDocument(), shareModel(ok(REVIEW_VIEW)));
  const text = root.text();
  for (const piece of ["さんのレビュー", "クリア", "満足度", "9.5", " / 10", "最高でした", "このプレイのモーメント 3 件はアプリで"]) {
    assert.ok(text.includes(piece), piece);
  }
  assert.ok(root.byClass("pn-status")[0].classList.contains("pn-status-completed"));
  assert.equal(root.byClass("pn-score")[0].getAttribute("aria-label"), "満足度 9.5 / 10");
  assert.equal(root.byClass("pn-score-fill")[0].style["--pn-score"], "95%");
  assert.equal(root.byClass("pn-slide").length, 1);
  assert.equal(root.byClass("pn-counter").length, 0, "no counter / dots for one photo");
  assert.ok(root.byClass("pn-avatar")[0].src.startsWith("https://"));
});

test("r6 Q5: a spoiler blurs the media, leaves the text out, and one button reveals both", () => {
  const root = buildShareView(fakeDocument(), shareModel(ok({ ...MOMENT_VIEW, spoiler: true })));
  assert.ok(root.classList.contains("is-spoiler"));
  assert.equal(root.text().includes("ついに倒した"), false);
  assert.equal(root.text().includes("2 行目"), false);
  assert.ok(root.byClass("pn-track")[0].hasAttribute("inert"), "blurred media cannot be played or opened");
  const buttons = root.all((node) => node.textContent === SPOILER_BUTTON);
  assert.equal(buttons.length, 1, "one button");
  assert.equal(buttons[0].tagName, "BUTTON");
  buttons[0].click();
  assert.ok(root.text().includes("ついに倒した"));
  assert.equal(root.classList.contains("is-spoiler"), false);
  assert.equal(root.byClass("pn-track")[0].hasAttribute("inert"), false);
  assert.equal(root.byClass("pn-spoiler-cover").length + root.byClass("pn-spoiler-text").length, 0);

  // Text only: the button sits where the text would be.
  const textOnly = buildShareView(fakeDocument(), shareModel(ok({ ...MOMENT_VIEW, spoiler: true, media: [] })));
  assert.equal(textOnly.byClass("pn-spoiler-text")[0].all((node) => node.textContent === SPOILER_BUTTON).length, 1);

  const review = buildShareView(fakeDocument(), shareModel(ok({ ...REVIEW_VIEW, spoiler: true })));
  assert.ok(review.text().includes("9.5"), "the satisfaction is not a spoiler");
  assert.equal(review.text().includes("最高でした"), false);
  // Nothing to hide = no button.
  const empty = shareModel(ok({ ...REVIEW_VIEW, spoiler: true, comment: null, media: [] }));
  assert.equal(hasMaskedContent(empty), false);
  const emptyRoot = buildShareView(fakeDocument(), empty);
  assert.equal(emptyRoot.all((node) => node.textContent === SPOILER_BUTTON).length, 0);
  assert.equal(emptyRoot.classList.contains("is-spoiler"), false);
});

test("tapping a photo opens the viewer on that photo (videos are not in the viewer)", () => {
  const opened = [];
  const root = buildShareView(fakeDocument(), shareModel(ok(MOMENT_VIEW)), { onOpen: (images, index) => opened.push([images.length, index]) });
  const photos = root.byClass("pn-slide-photo");
  assert.ok(photos.every((node) => node.tagName === "BUTTON"));
  assert.equal(photos[1].getAttribute("aria-label"), "写真 2 / 2 を大きく表示");
  photos[1].click();
  assert.deepEqual(opened, [[2, 1]]);
});

test("r7 P3: the end line has small store links on PC only; app links follow app.mjs's open button", () => {
  const stores = (platform) => buildShareView(fakeDocument(), shareModel(ok(MOMENT_VIEW)), { platform })
    .byClass("pn-end-stores")[0].all((node) => node.tagName === "A").map((node) => [node.href, node.textContent]);
  assert.deepEqual(stores("ios"), [[APP_STORE_URL, "App Store"]]);
  assert.deepEqual(stores("android"), [[PLAY_STORE_URL, "Google Play"]]);
  assert.deepEqual(stores("other"), [[APP_STORE_URL, "App Store"], [PLAY_STORE_URL, "Google Play"]]);
  for (const node of buildShareView(fakeDocument(), shareModel(ok(MOMENT_VIEW))).all((n) => n.tagName === "IMG")) {
    assert.doesNotMatch(String(node.src), /badge/, "no store badge images");
  }

  const root = buildShareView(fakeDocument(), shareModel(ok(MOMENT_VIEW)), { platform: "ios" });
  const primary = new FakeNode("a");
  primary.className = "button primary";
  primary.setAttribute("href", "https://playnavi-links.vercel.app/game/42");
  syncAppLinks(root, primary, MOMENT_VIEW.app_url);
  assert.equal(root.dataset.app, "on");
  primary.classList.add("hidden");
  syncAppLinks(root, primary, MOMENT_VIEW.app_url);
  assert.equal(root.dataset.app, "off", "PC / while resolving: the end line shows the small store links instead");
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
  const ids = [["share-view", "share-view hidden"], ["link-view", "card"]];
  const target = canonicalTargetFromPath(MOMENT_VIEW.canonical_path);

  const doc = embed(fakeDocument(ids), JSON.stringify(ok(MOMENT_VIEW)));
  // app.mjs's buttons live in #link-view; the page moves them into the quiet end line (same elements).
  const actions = new FakeNode("div");
  actions.className = "actions";
  const primary = new FakeNode("a");
  primary.className = "button primary";
  primary.setAttribute("href", "playnavi://game/42");
  actions.append(primary);
  doc.byId.get("link-view").append(actions);
  doc.byId.set("primary-btn", primary);
  assert.equal(startShareView(target, { doc, userAgent: "Android" }), true);
  assert.equal(doc.byId.get("share-view").classList.contains("hidden"), false);
  assert.equal(doc.byId.get("link-view").classList.contains("has-share"), true);
  assert.ok(doc.documentElement.classList.contains(PAGE_CLASS));
  const root = doc.byId.get("share-view").children[0];
  assert.equal(root.dataset.platform, "android");
  assert.equal(actions.parent, root.byClass("pn-end-slot")[0], "the open button sits in the end line");
  assert.equal(root.dataset.app, "on");

  // /s/<code>: the type is decided by the server, so the page passes null.
  const short = embed(fakeDocument(ids), JSON.stringify(ok(REVIEW_VIEW)));
  assert.equal(startShareView(null, { doc: short }), true);
  assert.ok(short.byId.get("share-view").text().includes("最高でした"));

  const failed = embed(fakeDocument(ids), JSON.stringify({ status: "not_found" }));
  assert.equal(startShareView(target, { doc: failed }), false);
  assert.equal(failed.byId.get("share-view").classList.contains("hidden"), true);
  assert.equal(failed.byId.get("link-view").classList.contains("has-share"), false);

  assert.equal(startShareView(target, { doc: fakeDocument(ids) }), false);

  // Other canonical link types never draw, even with JSON present.
  const game = embed(fakeDocument(ids), JSON.stringify(ok(MOMENT_VIEW)));
  assert.equal(startShareView(canonicalTargetFromPath("/game/42"), { doc: game }), false);
  assert.equal(game.byId.get("share-view").classList.contains("hidden"), true);
});

test("index.html carries the share container (r7: no slogan line); the app module loads share-view lazily", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<article id="share-view" class="share-view hidden"><\/article>/);
  assert.equal(html.includes("share-soft"), false);
  assert.equal(html.includes("ゲームの記録を残そう"), false);
  assert.ok(html.indexOf('id="share-view"') < html.indexOf('id="primary-btn"'), "content above the app button");
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
  // r6: when the page cannot be drawn, the server's record-page mark is removed (= today's page)
  assert.match(app, /drawn = startShareView\(target\);/);
  assert.match(app, /if \(!drawn\) document\.documentElement\.classList\.remove\("pn-rec-page"\);/);
});

// ---- r7 P2: このプレイの記録 (EF share-view の story) ----

const M2 = "abcdefab-cdef-cdef-cdef-abcdefab0002";
const M3 = "abcdefab-cdef-cdef-cdef-abcdefab0003";
const STORY = {
  review: { status: "completed", score: 9.5, comment: "最高でした\n2 行目", spoiler: false, date: "2026-10-20T01:00:00Z" },
  moments: [
    {
      memory_id: M2, title: "船をもらった", body: "行ける場所が増えた", date: "2026-10-19T12:00:00Z", spoiler: false,
      thumb: { kind: "image", url: `${STORAGE}/game-log-media-private/t.jpg?token=t`, poster_url: null }, media_count: 2,
      media: [
        { kind: "image", url: `${STORAGE}/game-log-media-private/a.jpg?token=a`, width: 1440, height: 810 },
        { kind: "video", url: `${STORAGE}/game-log-video-private/v.mp4?token=v`, poster_url: `${STORAGE}/game-log-media-private/vp.jpg?token=p`, duration_ms: 9000 },
      ],
    },
    { memory_id: M3, title: "正体", body: "犯人は", date: "2026-10-19T13:00:00Z", spoiler: true,
      thumb: { kind: "image", url: `${STORAGE}/game-log-media-private/s.jpg?token=s`, poster_url: null }, media_count: 1,
      media: [{ kind: "image", url: `${STORAGE}/game-log-media-private/s.jpg?token=s`, width: 800, height: 600 }] },
  ],
  moments_total: 5,
};

test("r7 P2: the story model keeps the parent review, https media only and the rest count; empty or broken stories are dropped", () => {
  const story = shareModel(ok({ ...MOMENT_VIEW, story: STORY })).story;
  assert.equal(story.review.scoreText, "9.5");
  assert.equal(story.review.statusLabel, "クリア");
  assert.equal(story.review.dateText, "2026年10月20日");
  assert.deepEqual(story.moments.map((m) => m.id), [M2, M3]);
  assert.equal(story.moments[0].mediaCount, 2);
  assert.deepEqual(story.moments[0].media.map((m) => m.kind), ["image", "video"]);
  assert.equal(story.total, 5);
  assert.equal(storyModel(null), null);
  assert.equal(storyModel({ review: null, moments: [] }), null);
  assert.equal(storyModel({ review: { status: null, score: null, comment: null }, moments: [] }), null, "an empty review card is not drawn");
  const unsafe = storyModel({ review: null, moments: [
    { memory_id: "not-a-uuid", title: "x" },
    { memory_id: M2, title: "ok", thumb: { kind: "image", url: "javascript:alert(1)" }, media: [{ kind: "image", url: "http://x/a.jpg" }] },
  ] });
  assert.equal(unsafe.moments.length, 1);
  assert.equal(unsafe.moments[0].thumb, null);
  assert.deepEqual(unsafe.moments[0].media, []);
  assert.equal(unsafe.total, 1);
  // A review with a story no longer prints the old "N 件はアプリで" line.
  assert.equal(shareModel(ok({ ...REVIEW_VIEW, story: { review: null, moments: STORY.moments, moments_total: 2 } })).momentsLine, null);
});

test("r7 P2: 「このプレイの記録」 comes after the record: the review card, the moments, and the rest line", () => {
  const root = buildShareView(fakeDocument(), shareModel(ok({ ...MOMENT_VIEW, story: STORY })));
  const walk = [...root.walk()];
  const section = root.byClass("pn-story")[0];
  assert.ok(walk.indexOf(section) > walk.indexOf(root.byClass("pn-game")[0]), "after the record itself");
  assert.ok(walk.indexOf(section) < walk.indexOf(root.byClass("pn-end")[0]), "before the end line");
  const text = section.text();
  for (const piece of [STORY_TITLE, "あかりさんの『ゼルダの伝説』", "レビュー", "クリア", "9.5", " / 10", "最高でした\n2 行目", "船をもらった", "行ける場所が増えた", "2026年10月19日", "ほか 3 件のモーメントはアプリで"]) {
    assert.ok(text.includes(piece), piece);
  }
  assert.equal(root.byClass("pn-story-item").length, 2);
  assert.equal(root.byClass("pn-story-thumb-count")[0].textContent, "2");
  // Nothing is loaded for a moment until it is opened (no media nodes in the panel).
  assert.equal(root.byClass("pn-story-media").length, 0);
  assert.equal(root.all((node) => node.tagName === "VIDEO").length, 1, "only the record's own video");
});

test("r7 P2: tapping a moment opens it in place (full text, photos to the viewer, the video plays in place); tapping again closes it", () => {
  const opened = [];
  const root = buildShareView(fakeDocument(), shareModel(ok({ ...MOMENT_VIEW, story: STORY })), { onOpen: (images, index) => opened.push([images.length, index]) });
  const [first] = root.byClass("pn-story-item");
  const toggle = first.byClass("pn-story-toggle")[0];
  const panel = first.byClass("pn-story-panel")[0];
  assert.equal(toggle.tagName, "BUTTON");
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(toggle.getAttribute("aria-controls"), panel.id);
  assert.equal(panel.hidden, true);
  toggle.click();
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.equal(panel.hidden, false);
  assert.ok(first.classList.contains("is-open"));
  const photo = first.byClass("pn-story-photo")[0];
  assert.equal(photo.tagName, "BUTTON");
  photo.click();
  assert.deepEqual(opened, [[1, 0]]);
  const video = first.all((node) => node.tagName === "VIDEO")[0];
  assert.equal(video.controls, true);
  assert.equal(video.preload, "none");
  assert.equal(video.getAttribute("playsinline"), "");
  assert.match(video.poster, /vp\.jpg/);
  toggle.click();
  assert.equal(panel.hidden, true);
  assert.equal(first.classList.contains("is-open"), false);
  toggle.click();
  assert.equal(first.byClass("pn-story-media").length, 1, "built once");
});

test("r7 P2: a spoiler moment and a spoiler review stay hidden until tapped", () => {
  const story = { ...STORY, review: { ...STORY.review, spoiler: true } };
  const root = buildShareView(fakeDocument(), shareModel(ok({ ...MOMENT_VIEW, story })));
  const section = root.byClass("pn-story")[0];
  assert.equal(section.text().includes("犯人は"), false);
  assert.equal(section.text().includes("正体"), false);
  assert.equal(section.text().includes("最高でした"), false);
  assert.ok(section.text().includes("9.5"), "the satisfaction is not a spoiler");
  const spoiled = root.byClass("pn-story-item")[1];
  assert.ok(spoiled.classList.contains("is-spoiler"));
  assert.ok(spoiled.text().includes(STORY_SPOILER));
  spoiled.byClass("pn-story-toggle")[0].click();
  assert.equal(spoiled.classList.contains("is-spoiler"), false);
  assert.ok(spoiled.text().includes("正体") && spoiled.text().includes("犯人は"));
  const reveal = root.byClass("pn-story-review")[0].all((node) => node.textContent === SPOILER_BUTTON)[0];
  reveal.click();
  assert.ok(root.byClass("pn-story-review")[0].text().includes("最高でした"));
});

test("r7 P2: a long review comment is folded with 「続きを読む」", () => {
  const long = "あ".repeat(200);
  const root = buildShareView(fakeDocument(), shareModel(ok({ ...MOMENT_VIEW, story: { ...STORY, review: { ...STORY.review, comment: long } } })));
  const comment = root.byClass("pn-story-comment")[0];
  assert.ok(comment.classList.contains("is-folded"));
  root.byClass("pn-story-more-button")[0].click();
  assert.equal(comment.classList.contains("is-folded"), false);
  assert.equal(root.byClass("pn-story-more-button").length, 0);
});
