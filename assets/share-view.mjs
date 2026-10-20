// TASK-20261017-002 記録のページ (モーメント・レビューのリンクを開いた見る人の画面)。
// r3 (V3/C4)・r5: アプリが無い人・ログインしていない人にも中身 (ゲーム・投稿した人・日付・文・満足度・写真・動画) を見せる。
// 中身はサーバ (api/share-preview.mjs) が EF share-view (C2) の 200 の本文を HTML の
// <script id="pn-share-view" type="application/json"> に埋め込む。ここは通信しない (1 回の読み込みで出す)。
// 埋め込みが無い・形が違う時は何もしない = 今までの「PlayNaviでリンクを開く」+ ストアのまま。
// 利用者の文字は必ず textContent で入れる (文字を HTML として読ませる書き方は使わない)。
//
// r6 (docs/design/TASK-20261017-002-sns-share-overview.md §10.2 Q1〜Q7): 写真・動画が主役の公開ページ。
//   細い頭 (印 + 「アプリで開く」) → 画面幅いっぱいの写真・動画 (左右に払う・点と「1/4」・動画はその場で再生)
//   → 名前・日付 → ゲーム (表紙 + 題名 + 状態の札) → 文。下に固定の帯 (スマホ = アプリで開く / PC = ストアの印)。
//   PC (1024px 以上) は左に写真・動画、右に名前・ゲーム・文の 2 列。色は Web 版 (web/src/app/globals.css) と同じ。
// アプリを開きに行く流れ (assets/app.mjs) は変えない: 帯には app.mjs の #primary-btn そのものを移して使う。

// サーバが中身を埋め込む要素の id (api/_lib/share-preview.mjs)
export const EMBED_ID = "pn-share-view";
// サーバが記録のページの <html> に付ける印 (色・書体を先に当てる)。描けなかった時はここで外す
export const PAGE_CLASS = "pn-rec-page";
// 共有ページを出すリンクの種類 (assets/link-routing.mjs の type)
export const SHARE_VIEW_TYPES = new Set(["moment", "log"]);
export const SOFT_LINE = "PlayNavi でゲームの記録を残そう";
export const SPOILER_BUTTON = "ネタバレを表示";
export const SPOILER_NOTE = "ネタバレを含む内容です";
export const SPOILER_TEXT_NOTE = "本文はネタバレを含むため隠しています";
export const UNPLAYABLE_TEXT = "このブラウザでは再生できません";
export const OPEN_IN_APP = "アプリで見る";
export const TOP_OPEN = "アプリで開く";
// ストア (assets/app.mjs の APP_STORE_URL / PLAY_STORE_URL と同じ)
export const APP_STORE_URL = "https://apps.apple.com/jp/app/playnavi/id6756201875";
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.playnavilab.playnavi.app";

const MAX_TEXT = 10_000;
const MAX_MEDIA = 12;
// 写真・動画の枠の縦横比は 4:5 (縦長) 〜 16:9 (横長) に収める (Instagram と同じ幅)
export const RATIO_MIN = 4 / 5;
export const RATIO_MAX = 16 / 9;
// アプリの状態の名前 (og-card.mjs の STATUS と同じ言葉)
export const STATUS_LABELS = Object.freeze({
  playing: "プレイ中",
  completed: "クリア",
  dropped: "断念",
  streaming_completed: "実況視聴済",
});

export function isShareViewTarget(target) {
  return Boolean(target) && SHARE_VIEW_TYPES.has(target.type);
}

function text(value, max = MAX_TEXT) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

// 絵・動画の URL は https だけ (それ以外は描かない)
export function safeUrl(value) {
  if (typeof value !== "string" || value.length > 4096) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "" ? url.href : null;
  } catch {
    return null;
  }
}

// 日本時間の日付「2026年10月20日」
export function formatJstDate(iso) {
  if (typeof iso !== "string") return null;
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  const jst = new Date(time + 9 * 3600 * 1000);
  return `${jst.getUTCFullYear()}年${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日`;
}

export function scoreText(score) {
  if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 10) return null;
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

export function formatDuration(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return null;
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// 端末の種類 (assets/app.mjs の detectPlatform と同じ決め方)
export function detectPlatform(ua) {
  if (/iPhone|iPad|iPod/i.test(ua ?? "")) return "ios";
  if (/Android/i.test(ua ?? "")) return "android";
  return "other";
}

// 動画の種類 (住所の拡張子から)。作り直した物は H.264 の mp4、作り直す前の iPhone の原本は .mov
export function videoMime(url) {
  let path = "";
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return "video/mp4";
  }
  if (path.endsWith(".mov") || path.endsWith(".qt")) return "video/quicktime";
  if (path.endsWith(".webm")) return "video/webm";
  return "video/mp4";
}

// 写真・動画の枠の縦横比 (幅 / 高さ)。大きさの分かる最初の 1 枚に合わせ、4:5〜16:9 に収める。
// 分からない時: 動画がある = 16:9 (EF share-view は動画の大きさを返さない。ゲームの録画は横長)、写真だけ = 1:1
export function heroRatio(media) {
  const list = media ?? [];
  const sized = list.find((item) => item.width && item.height);
  if (!sized) return list.some((item) => item.kind === "video") ? RATIO_MAX : 1;
  return Math.min(RATIO_MAX, Math.max(RATIO_MIN, sized.width / sized.height));
}

const dimension = (value) => (Number.isSafeInteger(value) && value > 0 && value < 100_000 ? value : null);

function mediaItem(item) {
  if (!item || typeof item !== "object") return null;
  const url = safeUrl(item.url);
  if (!url) return null;
  if (item.kind === "image") {
    return { kind: "image", url, width: dimension(item.width), height: dimension(item.height) };
  }
  if (item.kind === "video") {
    return {
      kind: "video",
      url,
      posterUrl: safeUrl(item.poster_url),
      durationText: formatDuration(item.duration_ms),
      width: dimension(item.width),
      height: dimension(item.height),
      mime: videoMime(url),
    };
  }
  return null;
}

// EF share-view の 200 の本文 → 画面に描く物。形が違えば null (= 今の画面のまま)
export function shareModel(payload) {
  if (payload?.status !== "ok" || !payload.view || typeof payload.view !== "object") return null;
  const view = payload.view;
  if (view.kind !== "moment" && view.kind !== "review") return null;
  const gameTitle = text(view.game?.title, 200);
  if (!gameTitle) return null;
  const authorName = text(view.author?.display_name, 100) ?? "ユーザー";
  const media = Array.isArray(view.media) ? view.media.slice(0, MAX_MEDIA).map(mediaItem).filter(Boolean) : [];
  const kindSuffix = view.kind === "moment" ? "さんのモーメント" : "さんのレビュー";
  const model = {
    kind: view.kind,
    kindSuffix,
    kindLabel: `${authorName}${kindSuffix}`,
    game: { title: gameTitle, coverUrl: safeUrl(view.game?.cover_url) },
    author: { name: authorName, avatarUrl: safeUrl(view.author?.avatar_url) },
    appUrl: safeUrl(view.app_url),
    dateIso: typeof view.date === "string" ? view.date : null,
    dateText: formatJstDate(view.date),
    spoiler: view.spoiler === true,
    media,
  };
  if (view.kind === "moment") {
    return { ...model, title: text(view.title, 200), body: text(view.body) };
  }
  const moments = Number.isSafeInteger(view.moments_count) && view.moments_count > 0 ? view.moments_count : 0;
  return {
    ...model,
    statusLabel: STATUS_LABELS[view.status] ?? null,
    status: STATUS_LABELS[view.status] ? view.status : null,
    score: typeof view.score === "number" && scoreText(view.score) ? view.score : null,
    scoreText: scoreText(view.score),
    comment: text(view.comment),
    momentsLine: moments > 0 ? `このプレイのモーメント ${moments} 件はアプリで` : null,
  };
}

// 隠す中身があるか (ネタバレの時に「ネタバレを表示」を出すか)
export function hasMaskedContent(model) {
  if (model.media.length > 0) return true;
  return hasMaskedText(model);
}

function hasMaskedText(model) {
  return model.kind === "moment" ? Boolean(model.title || model.body) : Boolean(model.comment);
}

// サーバが埋め込んだ中身を読む。無い・壊れている時は null
export function readEmbeddedShareView(doc) {
  const node = doc.getElementById(EMBED_ID);
  if (!node || typeof node.textContent !== "string" || node.textContent.length === 0) return null;
  try {
    return shareModel(JSON.parse(node.textContent));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- DOM

function el(doc, tag, className, content) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined && content !== null) node.textContent = content;
  return node;
}

function image(doc, className, src, alt = "") {
  const node = doc.createElement("img");
  if (className) node.className = className;
  node.src = src;
  node.alt = alt;
  node.loading = "lazy";
  node.decoding = "async";
  node.referrerPolicy = "no-referrer";
  return node;
}

function button(doc, className, label, ariaLabel) {
  const node = el(doc, "button", className, label);
  node.type = "button";
  if (ariaLabel) node.setAttribute("aria-label", ariaLabel);
  return node;
}

function link(doc, className, href, label) {
  const node = el(doc, "a", className, label);
  node.href = href;
  return node;
}

function prefersReducedMotion(doc) {
  try {
    return Boolean(doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  } catch {
    return false;
  }
}

// ロゴ (明るい画面 = 青緑のドット絵 /logo.png、暗い画面 = 白い文字。Web 版の BrandLogo と同じ画像)
function logo(doc) {
  const box = link(doc, "pn-logo", "/");
  box.setAttribute("aria-label", "PlayNavi");
  const light = image(doc, "pn-logo-light", "/logo.png");
  light.loading = "eager";
  light.width = 200;
  light.height = 35;
  const dark = image(doc, "pn-logo-dark", "/assets/brand/playnavi-wordmark-dark.webp");
  dark.width = 694;
  dark.height = 138;
  box.append(light, dark);
  return box;
}

// ストアの公式の印。ios = App Store だけ、android = Google Play だけ、ほか = 両方 (assets/app.mjs の showStores と同じ)
function storeBadges(doc, platform, className) {
  const box = el(doc, "div", `pn-badges ${className}`);
  box.setAttribute("aria-label", "アプリストア");
  if (platform !== "android") {
    const apple = link(doc, "pn-badge pn-badge-apple", APP_STORE_URL);
    const img = image(doc, "", "/assets/brand/badge-app-store-ja.svg", "App Store からダウンロード");
    img.width = 120;
    img.height = 40;
    apple.append(img);
    box.append(apple);
  }
  if (platform !== "ios") {
    const google = link(doc, "pn-badge pn-badge-google", PLAY_STORE_URL);
    const img = image(doc, "", "/assets/brand/badge-google-play-ja.png", "Google Play で手に入れよう");
    img.width = 646;
    img.height = 198;
    google.append(img);
    box.append(google);
  }
  return box;
}

// 1 枚の動画: 表紙と大きな ▶。押すとその場で再生 (playsinline・始まってから操作の棒)。音を消した自動再生はしない。
// 再生できない (canPlayType が「無理」・読み込みの error) 時は表紙 +「このブラウザでは再生できません」+「アプリで見る」(Q7)
function videoSlide(doc, item, position, total, appHref) {
  const slide = el(doc, "div", "pn-slide pn-slide-video");
  slide.setAttribute("role", "group");
  slide.setAttribute("aria-roledescription", "スライド");
  slide.setAttribute("aria-label", `${position} / ${total} 動画`);
  const video = doc.createElement("video");
  video.className = "pn-video";
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.preload = "metadata";
  if (item.posterUrl) video.poster = item.posterUrl;
  slide.append(video);

  const play = button(doc, "pn-play", null, `動画を再生${item.durationText ? ` (${item.durationText})` : ""}`);
  play.append(el(doc, "span", "pn-play-icon"));
  slide.append(play);
  if (item.durationText) slide.append(el(doc, "span", "pn-duration", item.durationText));

  const fail = () => {
    if (slide.classList.contains("is-unplayable")) return;
    slide.classList.add("is-unplayable");
    video.controls = false;
    play.hidden = true;
    const box = el(doc, "div", "pn-video-fail");
    box.setAttribute("role", "status");
    box.append(el(doc, "p", "pn-video-fail-text", UNPLAYABLE_TEXT), link(doc, "pn-video-fail-link pn-app-link", appHref ?? "#", OPEN_IN_APP));
    slide.append(box);
  };

  const playable = typeof video.canPlayType !== "function" || video.canPlayType(item.mime) !== "";
  if (!playable) {
    fail();
    return { slide, video, fail };
  }
  video.src = item.url;
  video.addEventListener("error", fail);
  video.addEventListener("playing", () => slide.classList.add("is-playing"));
  play.addEventListener("click", () => {
    play.hidden = true;
    slide.classList.add("is-started");
    video.controls = true;
    const started = video.play?.();
    if (started && typeof started.catch === "function") {
      started.catch((error) => {
        // 再生の許可が無い (省電力など) 時はもう一度押せるように戻す。それ以外は再生できない
        if (error?.name === "NotAllowedError" || error?.name === "AbortError") {
          play.hidden = false;
          video.controls = false;
          slide.classList.remove("is-started");
        } else {
          fail();
        }
      });
    }
  });
  return { slide, video, fail };
}

// 写真・動画の帯 (Q1)。画面幅いっぱいに 1 枚ずつ、左右に払う (scroll-snap)・PC は矢印キーと左右のボタン・点と「1/4」
function hero(doc, model, { onOpen, appHref }) {
  const total = model.media.length;
  const images = model.media.filter((item) => item.kind === "image");
  const box = el(doc, "section", "pn-hero");
  box.setAttribute("aria-roledescription", "カルーセル");
  box.setAttribute("aria-label", "写真と動画");
  // 枠の縦横比は描く前に決める (写真が読み込まれても下の文がずれない)
  box.style.setProperty?.("--pn-ratio", String(Number(heroRatio(model.media).toFixed(4))));
  const frame = el(doc, "div", "pn-frame");
  const track = el(doc, "div", "pn-track");
  track.tabIndex = 0;
  track.setAttribute("aria-label", total > 1 ? "写真と動画 (左右の矢印キーで切り替え)" : "写真と動画");
  const videos = [];
  model.media.forEach((item, index) => {
    if (item.kind === "video") {
      const made = videoSlide(doc, item, index + 1, total, appHref);
      videos.push(made.video);
      track.append(made.slide);
      return;
    }
    const imageIndex = images.indexOf(item);
    const slide = button(doc, "pn-slide pn-slide-photo", null, `写真 ${imageIndex + 1} / ${images.length} を大きく表示`);
    const photo = image(doc, "pn-photo", item.url, `${model.author.name}さんの写真 ${imageIndex + 1}`);
    if (index === 0) photo.loading = "eager";
    slide.append(photo);
    slide.addEventListener("click", () => onOpen(images, imageIndex));
    track.append(slide);
  });
  frame.append(track);
  box.append(frame);

  let current = 0;
  const counter = total > 1 ? el(doc, "p", "pn-counter", `1/${total}`) : null;
  const dots = [];
  let prev = null;
  let next = null;
  if (total > 1) {
    counter.setAttribute("aria-live", "polite");
    const dotBox = el(doc, "div", "pn-dots");
    dotBox.setAttribute("aria-hidden", "true");
    for (let i = 0; i < total; i += 1) {
      const dot = el(doc, "span", i === 0 ? "pn-dot is-current" : "pn-dot");
      dots.push(dot);
      dotBox.append(dot);
    }
    prev = button(doc, "pn-nav pn-nav-prev", null, "前の写真・動画");
    next = button(doc, "pn-nav pn-nav-next", null, "次の写真・動画");
    prev.disabled = true;
    frame.append(counter, prev, next);
    box.append(dotBox);
  }

  const mark = (index) => {
    if (index === current || index < 0 || index >= total) return;
    current = index;
    if (counter) counter.textContent = `${index + 1}/${total}`;
    dots.forEach((dot, i) => dot.classList[i === index ? "add" : "remove"]("is-current"));
    if (prev) prev.disabled = index === 0;
    if (next) next.disabled = index === total - 1;
    // 見えなくなった動画は止める
    for (const video of videos) if (!video.paused && typeof video.pause === "function") video.pause();
  };
  const goTo = (index) => {
    const to = Math.max(0, Math.min(total - 1, index));
    const width = track.clientWidth || 0;
    if (typeof track.scrollTo === "function") {
      track.scrollTo({ left: to * width, behavior: prefersReducedMotion(doc) ? "auto" : "smooth" });
    }
    mark(to);
  };
  let pending = null;
  track.addEventListener("scroll", () => {
    if (pending !== null) return;
    const raf = doc.defaultView?.requestAnimationFrame?.bind(doc.defaultView) ?? ((fn) => setTimeout(fn, 16));
    pending = raf(() => {
      pending = null;
      const width = track.clientWidth || 1;
      mark(Math.round(track.scrollLeft / width));
    });
  }, { passive: true });
  track.addEventListener("keydown", (event) => {
    if (event.target !== track) return;
    if (event.key === "ArrowRight") { event.preventDefault(); goTo(current + 1); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); goTo(current - 1); }
  });
  prev?.addEventListener("click", () => goTo(current - 1));
  next?.addEventListener("click", () => goTo(current + 1));
  // PC: どこにも焦点が無い (ページを開いたまま) 時も左右の矢印キーで切り替える (全画面の写真を見ている間・ネタバレの間は除く)
  if (total > 1) {
    doc.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      const active = doc.activeElement;
      if (active && active !== doc.body) return;
      if (doc.querySelector?.(".share-viewer") || track.hasAttribute?.("inert")) return;
      event.preventDefault();
      goTo(current + (event.key === "ArrowRight" ? 1 : -1));
    });
  }
  return { box, frame, track, goTo, get index() { return current; }, total };
}

function author(doc, model) {
  const row = el(doc, "div", "pn-author");
  row.append(model.author.avatarUrl
    ? image(doc, "pn-avatar", model.author.avatarUrl)
    : el(doc, "span", "pn-avatar pn-avatar-initial", [...model.author.name][0]));
  const lines = el(doc, "div", "pn-author-text");
  const heading = el(doc, "h1", "pn-author-line");
  heading.append(el(doc, "span", "pn-author-name", model.author.name), el(doc, "span", "pn-author-kind", model.kindSuffix));
  lines.append(heading);
  if (model.dateText) {
    const time = el(doc, "time", "pn-date", model.dateText);
    if (model.dateIso) time.setAttribute("datetime", model.dateIso);
    lines.append(time);
  }
  row.append(lines);
  return row;
}

function gameChip(doc, model) {
  const chip = el(doc, "div", "pn-game");
  chip.append(model.game.coverUrl
    ? image(doc, "pn-cover", model.game.coverUrl, `${model.game.title} の表紙`)
    : el(doc, "span", "pn-cover pn-cover-empty"));
  const lines = el(doc, "div", "pn-game-text");
  lines.append(el(doc, "p", "pn-game-title", model.game.title));
  if (model.kind === "review" && model.statusLabel) {
    lines.append(el(doc, "span", `pn-status pn-status-${model.status}`, model.statusLabel));
  }
  chip.append(lines);
  return chip;
}

// レビューの満足度 (Q4): 大きな数字 + 「/ 10」+ 細い棒
function scoreBlock(doc, model) {
  const box = el(doc, "div", "pn-score");
  box.setAttribute("role", "img");
  box.setAttribute("aria-label", `満足度 ${model.scoreText} / 10`);
  box.append(el(doc, "p", "pn-score-label", "満足度"));
  const value = el(doc, "p", "pn-score-value");
  value.append(el(doc, "strong", "pn-score-number", model.scoreText), el(doc, "span", "pn-score-max", " / 10"));
  box.append(value);
  const bar = el(doc, "div", "pn-score-bar");
  const fill = el(doc, "span", "pn-score-fill");
  fill.style.setProperty?.("--pn-score", `${Math.round(model.score * 10)}%`);
  bar.append(fill);
  box.append(bar);
  return box;
}

// ネタバレの時に隠す文
function textNodes(doc, model) {
  const nodes = [];
  if (model.kind === "moment") {
    if (model.title) nodes.push(el(doc, "h2", "pn-title", model.title));
    if (model.body) nodes.push(el(doc, "p", "pn-body", model.body));
  } else if (model.comment) {
    nodes.push(el(doc, "p", "pn-body", model.comment));
  }
  return nodes;
}

export function buildShareView(doc, model, { onOpen = () => {}, platform = "other" } = {}) {
  const root = el(doc, "div", "pn-rec");
  root.dataset.kind = model.kind;
  root.dataset.platform = platform;
  root.dataset.app = "off";
  const masked = model.spoiler && hasMaskedContent(model);
  if (masked) root.classList.add("is-spoiler");

  // 細い頭 (印 + 「アプリで開く」)
  const top = el(doc, "header", "pn-top");
  const topInner = el(doc, "div", "pn-top-inner");
  topInner.append(logo(doc), link(doc, "pn-top-open pn-app-link", model.appUrl ?? "#", TOP_OPEN));
  top.append(topInner);
  root.append(top);

  const layout = el(doc, "div", model.media.length > 0 ? "pn-layout has-media" : "pn-layout");
  let heroParts = null;
  if (model.media.length > 0) {
    heroParts = hero(doc, model, { onOpen, appHref: model.appUrl });
    layout.append(heroParts.box);
  }

  const details = el(doc, "div", "pn-details");
  details.append(author(doc, model), gameChip(doc, model));
  if (model.kind === "review" && model.scoreText) details.append(scoreBlock(doc, model));
  const textBox = el(doc, "div", "pn-text");
  details.append(textBox);

  if (masked) {
    // Q5: 写真・動画はぼかし (操作できない)、文は入れない。「ネタバレを表示」1 つで両方出る
    if (heroParts) heroParts.track.setAttribute("inert", "");
    const reveal = button(doc, "pn-spoiler-button", SPOILER_BUTTON);
    let cover = null;
    if (heroParts) {
      cover = el(doc, "div", "pn-spoiler-cover");
      cover.append(el(doc, "p", "pn-spoiler-note", SPOILER_NOTE), reveal);
      heroParts.frame.append(cover);
    }
    const note = hasMaskedText(model) || !heroParts ? el(doc, "div", "pn-spoiler-text") : null;
    if (note) {
      note.append(el(doc, "p", "pn-spoiler-text-note", heroParts ? SPOILER_TEXT_NOTE : SPOILER_NOTE));
      if (!heroParts) note.append(reveal);
      textBox.append(note);
    }
    reveal.addEventListener("click", () => {
      root.classList.remove("is-spoiler");
      cover?.remove();
      note?.remove();
      heroParts?.track.removeAttribute("inert");
      textBox.append(...textNodes(doc, model));
    });
  } else {
    textBox.append(...textNodes(doc, model));
  }
  if (model.kind === "review" && model.momentsLine) details.append(el(doc, "p", "pn-moments", model.momentsLine));

  const foot = el(doc, "footer", "pn-foot");
  foot.append(storeBadges(doc, platform, "pn-foot-badges"));
  details.append(foot);
  layout.append(details);
  root.append(layout);

  // 下に固定の帯 (Q3)。スマホ = app.mjs の「PlayNaviアプリで開く」(#primary-btn を startShareView が移す)、
  // PC (アプリを開くボタンが出ない) = アプリの印 + ストアの印
  const bar = el(doc, "div", "pn-bar");
  const barInner = el(doc, "div", "pn-bar-inner");
  const brand = el(doc, "div", "pn-bar-brand");
  const icon = image(doc, "pn-bar-icon", "/assets/brand/app-icon-120.webp");
  icon.width = 40;
  icon.height = 40;
  const brandText = el(doc, "div", "pn-bar-text");
  brandText.append(el(doc, "p", "pn-bar-name", "PlayNavi"), el(doc, "p", "pn-bar-sub", "ゲームの記録を残そう"));
  brand.append(icon, brandText);
  barInner.append(brand, el(doc, "div", "pn-bar-slot"), storeBadges(doc, platform, "pn-bar-badges"));
  bar.append(barInner);
  root.append(bar);
  return root;
}

// アプリを開くリンク (頭の「アプリで開く」・再生できない時の「アプリで見る」) を app.mjs の #primary-btn にそろえる。
// #primary-btn が出ている (スマホ) 時はその住所、出ていない (PC・確認中) 時は頭の「アプリで開く」を隠す
export function syncAppLinks(root, primary, fallbackHref) {
  if (!root) return;
  const on = Boolean(primary) && !primary.classList.contains("hidden");
  const href = on ? primary.getAttribute("href") : null;
  root.dataset.app = on ? "on" : "off";
  const walk = typeof root.querySelectorAll === "function"
    ? [...root.querySelectorAll(".pn-app-link")]
    : typeof root.byClass === "function" ? root.byClass("pn-app-link") : [];
  for (const anchor of walk) {
    anchor.href = href || fallbackHref || "#";
  }
}

// 写真を全画面で見る (左右の矢印キー・スワイプ・Esc で閉じる)
export function openViewer(doc, images, start, { touch = false } = {}) {
  let index = start;
  const opener = doc.activeElement ?? null;
  const overlay = el(doc, "div", touch ? "share-viewer is-touch" : "share-viewer");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "写真");
  const stage = el(doc, "div", "share-viewer-stage");
  const picture = image(doc, "share-viewer-image", images[index].url, "");
  picture.loading = "eager";
  stage.append(picture);
  const head = el(doc, "div", "share-viewer-head");
  const counter = el(doc, "p", "share-viewer-counter");
  const close = button(doc, "share-viewer-close", null, "閉じる");
  close.append(el(doc, "span", "share-viewer-x"));
  head.append(counter, close);
  const prev = button(doc, "share-viewer-nav prev", null, "前の写真");
  const next = button(doc, "share-viewer-nav next", null, "次の写真");
  const show = (to) => {
    index = (to + images.length) % images.length;
    picture.src = images[index].url;
    picture.alt = `写真 ${index + 1} / ${images.length}`;
    counter.textContent = `${index + 1} / ${images.length}`;
  };
  const many = images.length > 1;
  prev.hidden = !many;
  next.hidden = !many;
  counter.hidden = !many;
  const onKey = (event) => {
    if (event.key === "Escape") finish();
    else if (event.key === "ArrowLeft" && many) show(index - 1);
    else if (event.key === "ArrowRight" && many) show(index + 1);
    else if (event.key === "Tab") {
      // 全画面の中だけを行き来する
      const order = [prev, next, close].filter((node) => !node.hidden);
      const at = order.indexOf(doc.activeElement);
      event.preventDefault();
      order[(at + (event.shiftKey ? order.length - 1 : 1)) % order.length]?.focus();
    }
  };
  const finish = () => {
    doc.removeEventListener("keydown", onKey);
    overlay.remove();
    doc.body.classList.remove("share-viewer-open");
    if (opener && typeof opener.focus === "function") opener.focus();
  };
  let touchX = null;
  overlay.addEventListener("touchstart", (event) => { touchX = event.changedTouches[0]?.clientX ?? null; }, { passive: true });
  overlay.addEventListener("touchend", (event) => {
    if (touchX === null || !many) return;
    const dx = (event.changedTouches[0]?.clientX ?? touchX) - touchX;
    touchX = null;
    if (Math.abs(dx) > 40) show(dx < 0 ? index + 1 : index - 1);
  });
  overlay.addEventListener("click", (event) => { if (event.target === overlay || event.target === stage) finish(); });
  close.addEventListener("click", finish);
  prev.addEventListener("click", () => show(index - 1));
  next.addEventListener("click", () => show(index + 1));
  doc.addEventListener("keydown", onKey);
  overlay.append(stage, prev, next, head);
  show(index);
  doc.body.classList.add("share-viewer-open");
  doc.body.append(overlay);
  // 指で開いた時は焦点の枠を出さない (キーボードの人は Tab で枠が出る)
  close.focus(touch ? { focusVisible: false } : undefined);
  return { show, close: finish };
}

// app.mjs から呼ぶ。描けたら true。埋め込みが無い時は何も変えずに false。
// target は正規の住所の時の link-routing の結果 (モーメント・レビュー以外は描かない)。/s/<code> の時は null
// (種類はサーバが短縮リンクから決めて埋め込む)
export function startShareView(target, { doc = document, userAgent } = {}) {
  if (target !== null && !isShareViewTarget(target)) return false;
  const container = doc.getElementById("share-view");
  const linkView = doc.getElementById("link-view");
  if (!container || !linkView) return false;
  const model = readEmbeddedShareView(doc);
  if (!model) return false;
  const ua = userAgent ?? doc.defaultView?.navigator?.userAgent ?? globalThis.navigator?.userAgent ?? "";
  const root = buildShareView(doc, model, {
    platform: detectPlatform(ua),
    onOpen: (images, index) => openViewer(doc, images, index, { touch: detectPlatform(ua) !== "other" }),
  });
  container.replaceChildren(root);
  container.classList.remove("hidden");
  linkView.classList.add("has-share");
  doc.documentElement?.classList?.add(PAGE_CLASS);

  // app.mjs の「PlayNaviアプリで開く」(とその横の「もう一度試す」) を下の帯へ移す。要素そのものを移すので、
  // app.mjs が持っている参照・住所の決め方・2 秒後のストア表示はそのまま
  const actions = typeof linkView.querySelector === "function" ? linkView.querySelector(".actions") : null;
  const slot = typeof root.querySelector === "function" ? root.querySelector(".pn-bar-slot") : null;
  if (actions && slot) slot.append(actions);
  const soft = doc.getElementById("share-soft");
  if (soft) {
    soft.classList.remove("hidden");
    const foot = typeof root.querySelector === "function" ? root.querySelector(".pn-foot") : null;
    foot?.prepend?.(soft);
  }
  const primary = doc.getElementById("primary-btn");
  const sync = () => syncAppLinks(root, primary, model.appUrl);
  sync();
  const Observer = doc.defaultView?.MutationObserver ?? globalThis.MutationObserver;
  if (primary && typeof Observer === "function") {
    new Observer(sync).observe(primary, { attributes: true, attributeFilter: ["href", "class"] });
  }
  return true;
}
