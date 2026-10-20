// TASK-20261017-002 r3 (V3/C4): 共有ページ。モーメント・レビューの正規の住所で、
// アプリが無い人にも中身 (ゲーム・投稿した人・日付・文・満足度・写真・動画) を見せる。
// 中身は EF share-view (C2) を同じ住所の /api/share-view (vercel.json の書き換え) から読む。
// 読めない時 (404・通信失敗・形が違う) は何もしない = 今までの「PlayNaviでリンクを開く」+ ストアのまま。
// 利用者の文字は必ず textContent で入れる (文字を HTML として読ませる書き方は使わない)。

export const SHARE_VIEW_URL = "/api/share-view";
export const SHARE_VIEW_TIMEOUT_MS = 8000;
// 共有ページを出すリンクの種類 (assets/link-routing.mjs の type)
export const SHARE_VIEW_TYPES = new Set(["moment", "log"]);
export const SOFT_LINE = "PlayNavi でゲームの記録を残そう";
export const SPOILER_BUTTON = "ネタバレを表示";

const MAX_TEXT = 10_000;
const MAX_MEDIA = 12;
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

const dimension = (value) => (Number.isSafeInteger(value) && value > 0 && value < 100_000 ? value : null);

function mediaItem(item) {
  if (!item || typeof item !== "object") return null;
  const url = safeUrl(item.url);
  if (!url) return null;
  if (item.kind === "image") {
    return { kind: "image", url, width: dimension(item.width), height: dimension(item.height) };
  }
  if (item.kind === "video") {
    return { kind: "video", url, posterUrl: safeUrl(item.poster_url), durationText: formatDuration(item.duration_ms) };
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
  const model = {
    kind: view.kind,
    kindLabel: view.kind === "moment" ? `${authorName}さんのモーメント` : `${authorName}さんのプレイ記録`,
    game: { title: gameTitle, coverUrl: safeUrl(view.game?.cover_url) },
    author: { name: authorName, avatarUrl: safeUrl(view.author?.avatar_url) },
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
    scoreText: scoreText(view.score),
    comment: text(view.comment),
    momentsLine: moments > 0 ? `このプレイのモーメント ${moments} 件はアプリで` : null,
  };
}

// 隠す中身があるか (ネタバレの時に「ネタバレを表示」を出すか)
export function hasMaskedContent(model) {
  if (model.media.length > 0) return true;
  return model.kind === "moment" ? Boolean(model.title || model.body) : Boolean(model.comment);
}

export async function fetchShareView(path, { fetchImpl = globalThis.fetch, signal, url = SHARE_VIEW_URL } = {}) {
  let response;
  try {
    response = await fetchImpl(`${url}?path=${encodeURIComponent(path)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      credentials: "omit",
      signal,
    });
  } catch {
    return null;
  }
  if (response.status !== 200) return null;
  try {
    return shareModel(await response.json());
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
  node.className = className;
  node.src = src;
  node.alt = alt;
  node.loading = "lazy";
  node.decoding = "async";
  node.referrerPolicy = "no-referrer";
  return node;
}

function mediaGrid(doc, model, onOpen) {
  const grid = el(doc, "div", "share-media");
  grid.dataset.count = String(Math.min(model.media.length, 4));
  const images = model.media.filter((item) => item.kind === "image");
  // 動画は横いっぱい。写真が奇数枚の時は先頭の写真を横いっぱいにする (2 列の並びに穴を空けない)
  const count = images.length;
  model.media.forEach((item) => {
    if (item.kind === "video") {
      const box = el(doc, "div", "share-media-item video wide");
      const video = doc.createElement("video");
      video.controls = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.preload = "metadata";
      if (item.posterUrl) video.poster = item.posterUrl;
      video.src = item.url;
      box.append(video);
      if (item.durationText) box.append(el(doc, "span", "share-duration", item.durationText));
      grid.append(box);
      return;
    }
    const imageIndex = images.indexOf(item);
    const wide = count % 2 === 1 && imageIndex === 0;
    const button = el(doc, "button", `share-media-item${wide ? " wide" : ""}${count === 1 ? " single" : ""}`);
    button.type = "button";
    button.setAttribute("aria-label", `写真 ${imageIndex + 1} を大きく表示`);
    const img = image(doc, "", item.url);
    if (count === 1 && item.width && item.height) img.style.aspectRatio = `${item.width} / ${item.height}`;
    button.append(img);
    button.addEventListener("click", () => onOpen(images, imageIndex));
    grid.append(button);
  });
  return grid;
}

// ネタバレの時に隠す部分 (文と写真・動画)
function maskedContent(doc, model, onOpen) {
  const nodes = [];
  if (model.kind === "moment") {
    if (model.title) nodes.push(el(doc, "h2", "share-title", model.title));
    if (model.body) nodes.push(el(doc, "p", "share-text", model.body));
  } else if (model.comment) {
    nodes.push(el(doc, "p", "share-text", model.comment));
  }
  if (model.media.length > 0) nodes.push(mediaGrid(doc, model, onOpen));
  return nodes;
}

export function buildShareView(doc, model, { onOpen = () => {} } = {}) {
  const root = el(doc, "div", "share-content");

  const game = el(doc, "header", "share-game");
  game.append(model.game.coverUrl ? image(doc, "share-cover", model.game.coverUrl) : el(doc, "div", "share-cover"));
  const gameText = el(doc, "div", "share-game-text");
  gameText.append(el(doc, "p", "share-kind", model.kindLabel), el(doc, "h1", "share-game-title", model.game.title));
  game.append(gameText);
  root.append(game);

  const author = el(doc, "div", "share-author");
  author.append(model.author.avatarUrl
    ? image(doc, "share-avatar", model.author.avatarUrl)
    : el(doc, "span", "share-avatar", [...model.author.name][0]));
  author.append(el(doc, "span", "share-author-name", model.author.name));
  if (model.dateText) {
    const time = el(doc, "time", "share-date", model.dateText);
    if (model.dateIso) time.setAttribute("datetime", model.dateIso);
    author.append(time);
  }
  root.append(author);

  if (model.kind === "review" && (model.statusLabel || model.scoreText)) {
    const meta = el(doc, "div", "share-review-meta");
    if (model.statusLabel) meta.append(el(doc, "span", `share-status status-${model.status}`, model.statusLabel));
    if (model.scoreText) {
      const score = el(doc, "span", "share-score");
      score.append(el(doc, "span", "share-score-label", "満足度"), el(doc, "strong", "", model.scoreText),
        el(doc, "span", "share-score-max", "/10"));
      meta.append(score);
    }
    root.append(meta);
  }

  const body = el(doc, "div", "share-body");
  if (model.spoiler && hasMaskedContent(model)) {
    const gate = el(doc, "div", "share-spoiler");
    gate.append(el(doc, "p", "share-spoiler-note", "ネタバレを含む内容です"));
    const button = el(doc, "button", "button secondary share-spoiler-button", SPOILER_BUTTON);
    button.type = "button";
    button.addEventListener("click", () => {
      gate.remove();
      body.append(...maskedContent(doc, model, onOpen));
    });
    gate.append(button);
    body.append(gate);
  } else {
    body.append(...maskedContent(doc, model, onOpen));
  }
  root.append(body);

  if (model.kind === "review" && model.momentsLine) root.append(el(doc, "p", "share-moments", model.momentsLine));
  return root;
}

// 写真を全画面で見る (左右の矢印キー・スワイプ・Esc で閉じる)
export function openViewer(doc, images, start) {
  let index = start;
  const overlay = el(doc, "div", "share-viewer");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "写真");
  const picture = image(doc, "share-viewer-image", images[index].url);
  picture.loading = "eager";
  const counter = el(doc, "p", "share-viewer-counter");
  const close = el(doc, "button", "share-viewer-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "閉じる");
  const prev = el(doc, "button", "share-viewer-nav prev", "‹");
  prev.type = "button";
  prev.setAttribute("aria-label", "前の写真");
  const next = el(doc, "button", "share-viewer-nav next", "›");
  next.type = "button";
  next.setAttribute("aria-label", "次の写真");
  const show = (to) => {
    index = (to + images.length) % images.length;
    picture.src = images[index].url;
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
  };
  const finish = () => {
    doc.removeEventListener("keydown", onKey);
    overlay.remove();
    doc.body.classList.remove("share-viewer-open");
  };
  let touchX = null;
  overlay.addEventListener("touchstart", (event) => { touchX = event.changedTouches[0]?.clientX ?? null; }, { passive: true });
  overlay.addEventListener("touchend", (event) => {
    if (touchX === null || !many) return;
    const dx = (event.changedTouches[0]?.clientX ?? touchX) - touchX;
    touchX = null;
    if (Math.abs(dx) > 40) show(dx < 0 ? index + 1 : index - 1);
  });
  overlay.addEventListener("click", (event) => { if (event.target === overlay) finish(); });
  close.addEventListener("click", finish);
  prev.addEventListener("click", () => show(index - 1));
  next.addEventListener("click", () => show(index + 1));
  doc.addEventListener("keydown", onKey);
  overlay.append(picture, prev, next, close, counter);
  show(index);
  doc.body.classList.add("share-viewer-open");
  doc.body.append(overlay);
  close.focus();
  return { show, close: finish };
}

// app.mjs から呼ぶ。描けたら true。読めない時は何も変えずに false
export async function startShareView(target, { doc = document, fetchImpl } = {}) {
  if (!isShareViewTarget(target)) return false;
  const container = doc.getElementById("share-view");
  const linkView = doc.getElementById("link-view");
  if (!container || !linkView) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SHARE_VIEW_TIMEOUT_MS);
  const model = await fetchShareView(target.canonicalPath, {
    signal: controller.signal,
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  clearTimeout(timer);
  if (!model) return false;
  container.replaceChildren(buildShareView(doc, model, { onOpen: (images, index) => openViewer(doc, images, index) }));
  container.classList.remove("hidden");
  linkView.classList.add("has-share");
  doc.getElementById("share-soft")?.classList.remove("hidden");
  return true;
}
