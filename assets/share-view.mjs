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
// アプリを開きに行く流れ (assets/app.mjs) は変えない: app.mjs の #primary-btn そのものを移して使う。
//
// r7 (overview §11 P2・P3、10/21 Emiya「主役はユーザーの投稿なのに PlayNavi を推しすぎ」): 主役は本人。
//   PlayNavi は左上の小さな印と、ページの一番下の控えめな文字のリンク 1 つ (スマホ =「PlayNaviアプリで開く」= app.mjs の
//   #primary-btn、PC = ストアの小さな文字のリンク) だけ。頭の「アプリで開く」・下の固定の帯・ストアの印・宣伝の一言は出さない。
//   並び: 名前・日付 → 写真・動画 → (レビュー: 満足度) → 文 → ゲーム。その下に加点の「このプレイの記録」
//   (EF share-view の story = 親のレビューと同じプレイのほかの公開のモーメント。押すとその場で開く)。
//
// r8 (overview §12.2、10/21 Emiya「閲覧側のメリットが少なすぎる。明らかな上位互換にならないと使われない」):
//   リンクを押した人が得をする所を、ページを開いてすぐ分かるようにする。
//   - 「このプレイのアルバム（N）」: 同じプレイの公開の写真・動画の全部 (EF share-view の album、最大 60)。
//     写真の上 (スマホ = 本文の下・PC = 2 列の下) に、切らずに (それぞれの縦横比のまま) 行ごとに幅をそろえて並べる。
//     動画は ▶ と長さ、ネタバレは押すまでぼかす。押すと全画面で全部を左右に送って見られる (写真は 2 本指・2 回押しで拡大、
//     動画はその場で再生)。本文の近くに「このプレイの写真・動画を全部見る（N）」の印
//   - 投稿の写真 (帯) を押した時も、同じ全画面でアルバム全部を送れる
//   - レビュー: プレイ時間・遊んだ機種 (EF share-view の play_time / platforms_played)
//
// r13 (10/21 Emiya「『タップすると』の先はアルバムみたいに写真が一覧になってるやつじゃないの？」、r12 CONTRACT P7
//   「シェアは投稿単位」): リンクカードの「写真・動画をすべて見る ›」の先 = この投稿の写真・動画の一覧。
//   - 投稿の写真・動画が 1 つ = 今までどおり大きく 1 枚 (切らない・動画はその場で再生)
//   - 2 つ以上 = 全部を一覧 (アルバムと同じ札・切らずに縦横比のまま・行ごとに幅いっぱい)。押すとこの投稿の分だけを
//     全画面で送って見る (アルバムと同じ全画面: 払う・2 回押しで拡大・動画は再生)。1 枚ずつ払う帯 (「1/3」) はやめた
//   - 「このプレイの写真・動画を全部見る（N）」の印は消す。「このプレイのアルバム」の枠はページの下に今のまま残す

// サーバが中身を埋め込む要素の id (api/_lib/share-preview.mjs)
export const EMBED_ID = "pn-share-view";
// サーバが記録のページの <html> に付ける印 (色・書体を先に当てる)。描けなかった時はここで外す
export const PAGE_CLASS = "pn-rec-page";
// 共有ページを出すリンクの種類 (assets/link-routing.mjs の type)
export const SHARE_VIEW_TYPES = new Set(["moment", "log"]);
export const SPOILER_BUTTON = "ネタバレを表示";
export const SPOILER_NOTE = "ネタバレを含む内容です";
export const SPOILER_TEXT_NOTE = "本文はネタバレを含むため隠しています";
export const UNPLAYABLE_TEXT = "このブラウザでは再生できません";
// TASK-20261021-002 10/29: 上げた直後 (変換中) の動画。EF share-view は表紙だけを返す (再生の住所は無い)
export const PREPARING_TEXT = "動画を準備中";
export const OPEN_IN_APP = "アプリで見る";
export const STORY_TITLE = "このプレイの記録";
export const STORY_SPOILER = "ネタバレを含むモーメント";
export const READ_MORE = "続きを読む";
export const ALBUM_TITLE = "このプレイのアルバム";
export const ALBUM_SPOILER = "ネタバレ";
export const VIEWER_SPOILER_NOTE = "ネタバレを含む写真・動画です";
// EF share-view の album の上限 (supabase _shared/sharePlayAlbum.ts PLAY_ALBUM_LIMIT)
export const ALBUM_MAX = 60;
// アルバムの 1 枚の縦横比 (幅 / 高さ) の範囲。外れる物は枠の中に切らずに収める (余白が付く)
export const ALBUM_RATIO_MIN = 1 / 2;
export const ALBUM_RATIO_MAX = 2.4;
// r13: 投稿の写真・動画の一覧の高さの目安 (px)。少ない時は大きく、多い時は 1 行の枚数を増やしてこの高さに近づける
// (スマホ = 2 枚ずつ、PC の左の列 = 2〜4 枚ずつ)。POST_GRID_NARROW より狭い一覧はスマホの目安
export const POST_GRID_NARROW = 560;
export const POST_GRID_HEIGHT = Object.freeze({ narrow: 400, wide: 700 });
// これより低い行は作らない (行を増やす)
export const POST_GRID_MIN_H = Object.freeze({ narrow: 80, wide: 110 });
// game_logs.play_time の段階 (アプリ lib/webCreateLogForm.ts PLAY_TIME_BUCKETS)
const PLAY_TIME_BUCKETS = [0, 10, 30, 50, 70, 100, 200, 500, 1000];
// ストア (assets/app.mjs の APP_STORE_URL / PLAY_STORE_URL と同じ)
export const APP_STORE_URL = "https://apps.apple.com/jp/app/playnavi/id6756201875";
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.playnavilab.playnavi.app";

const MAX_TEXT = 10_000;
const MAX_MEDIA = 12;
// EF share-view の story.moments の上限 (supabase share-view/handler.ts STORY_MOMENTS_LIMIT)
export const STORY_MAX = 12;
// レビューの感想は 4 行を超えると「続きを読む」で開く (目安の字数)
const COMMENT_FOLD = 140;
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
  // TASK-20261021-002 10/29: 変換中の動画 = 表紙 +「動画を準備中」(再生しない)。表紙が無ければ出さない
  if (item.kind === "video" && item.preparing === true) {
    const posterUrl = safeUrl(item.poster_url);
    if (!posterUrl) return null;
    return {
      kind: "video",
      url: null,
      preparing: true,
      posterUrl,
      durationText: formatDuration(item.duration_ms),
      width: dimension(item.width),
      height: dimension(item.height),
      mime: null,
    };
  }
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
  const story = storyModel(view.story);
  // r8: このプレイのアルバム
  model.album = albumModel(view, media);
  model.recordKey = recordKeyOf(view);
  if (view.kind === "moment") {
    const title = text(view.title, 200);
    return { ...model, story, title, body: text(view.body), postItems: postItems(view, model, title) };
  }
  const moments = Number.isSafeInteger(view.moments_count) && view.moments_count > 0 ? view.moments_count : 0;
  return {
    ...model,
    story,
    ...reviewFields(view),
    postItems: postItems(view, model, null),
    // story が無い (古い EF) 時だけの一言
    momentsLine: !story && moments > 0 ? `このプレイのモーメント ${moments} 件はアプリで` : null,
  };
}

// プレイ時間の段階 → 言葉 (アプリ lib/webCreateLogForm.ts playTimeBucketLabel と同じ言い方。0 = 未プレイは出さない)
export function playTimeText(hours) {
  if (!Number.isSafeInteger(hours) || hours <= 0) return null;
  if (hours === 1000) return "500時間以上";
  const index = PLAY_TIME_BUCKETS.indexOf(hours);
  return index > 0 ? `${PLAY_TIME_BUCKETS[index - 1]}〜${hours}時間` : `約${hours}時間`;
}

function platformList(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    const name = text(item, 60);
    if (name && !out.includes(name)) out.push(name);
    if (out.length === 8) break;
  }
  return out;
}

function reviewFields(view) {
  return {
    statusLabel: STATUS_LABELS[view.status] ?? null,
    status: STATUS_LABELS[view.status] ? view.status : null,
    score: typeof view.score === "number" && scoreText(view.score) ? view.score : null,
    scoreText: scoreText(view.score),
    comment: text(view.comment),
    // r8: プレイ時間・遊んだ機種
    playTimeText: playTimeText(view.play_time),
    platforms: platformList(view.platforms_played),
  };
}

// ---------------------------------------------------------------- r8: このプレイのアルバム

// 開いている記録の鍵 (アルバムの 1 件の key と同じ形: モーメント = memory_id、レビュー = "review")
function recordKeyOf(view) {
  if (view.kind === "review") return "review";
  const match = /[?&]moment=([0-9a-f-]{36})(?:&|$)/i.exec(typeof view.canonical_path === "string" ? view.canonical_path : "");
  return match ? match[1].toLowerCase() : null;
}

// 1 枚の縦横比。分からない時は動画 = 16:9、写真 = 4:3 (読み込んだら本当の値に直す)
export function albumRatio(item) {
  const raw = item.width && item.height ? item.width / item.height : item.kind === "video" ? 16 / 9 : 4 / 3;
  return Math.min(ALBUM_RATIO_MAX, Math.max(ALBUM_RATIO_MIN, raw));
}

function albumItem(value) {
  const base = mediaItem(value);
  if (!base) return null;
  const key = typeof value.memory_id === "string" && /^[0-9a-f-]{36}$/i.test(value.memory_id) ? value.memory_id.toLowerCase() : "review";
  return {
    ...base,
    posterUrl: base.kind === "video" ? base.posterUrl : null,
    thumbUrl: safeUrl(value.thumb_url) ?? (base.kind === "image" ? base.url : base.posterUrl),
    key,
    spoiler: value.spoiler === true,
    title: text(value.title, 200),
    dateIso: typeof value.date === "string" ? value.date : null,
    dateText: formatJstDate(value.date),
  };
}

// EF share-view の album → 描く物。投稿と同じ物しか無い (加点にならない) 時・無い時は null (= 出さない)
export function albumModel(view, media = []) {
  if (!Array.isArray(view?.album)) return null;
  const items = view.album.slice(0, ALBUM_MAX).map(albumItem).filter(Boolean);
  if (items.length === 0) return null;
  const total = Number.isSafeInteger(view.album_total) && view.album_total >= items.length ? view.album_total : items.length;
  const recordKey = recordKeyOf(view);
  if (total <= media.length && items.every((item) => item.key === recordKey)) return null;
  return {
    items,
    total,
    recordKey,
    photos: items.filter((item) => item.kind === "image").length,
    videos: items.filter((item) => item.kind === "video").length,
  };
}

// r13: この投稿の写真・動画 (一覧と全画面で見る分)。全画面はアルバムと同じ部品なので同じ形にそろえる。
// 一覧の絵は投稿の物そのもの (写真 = 本体、動画 = 表紙)。アルバムの小さな絵を番号で借りると、アルバムの並び (写真ごとの日付順) と
// 投稿の並び (display_order) が違う記録で絵を取り違えた (10/21 STG の R1: 2 枚目の縦長の枠に横長の写真)。見分ける鍵が無いので借りない
function postItems(view, model, title) {
  const key = model.recordKey ?? "post";
  return model.media.map((item) => ({
    ...item,
    thumbUrl: item.kind === "image" ? item.url : item.posterUrl,
    key,
    spoiler: false,
    title,
    dateIso: model.dateIso,
    dateText: model.dateText,
  }));
}

// r13: 一覧を行に分ける (幅いっぱいの行の並び)。ratios = 1 枚ずつの縦横比 (幅 / 高さ)、width = 一覧の幅 (px)。
// k 行に分けると 1 行の高さ ≒ 幅 × k ÷ 縦横比の合計、全体の高さ ≒ 幅 × k² ÷ 縦横比の合計。
// 全体が POST_GRID_HEIGHT に収まる一番多い行の数 k にし、行ごとの縦横比の合計がなるべくそろうように前から順に分ける
// (同じくらいなら前の行ほど枚数が少ない = 大きい)。行が低すぎる (POST_GRID_MIN_H 未満) なら行を増やす。
// 返り値 = 行ごとの番号の配列 (例: [[0, 1], [2, 3, 4]])
export function postGridRows(ratios, width, gap = 4) {
  const n = ratios.length;
  if (n === 0) return [];
  const w = Number.isFinite(width) && width > 0 ? width : 366;
  const band = w < POST_GRID_NARROW ? "narrow" : "wide";
  const sum = ratios.reduce((a, b) => a + b, 0);
  const heightOf = (rows) => Math.min(...rows.map((row) => (w - gap * (row.length - 1)) / row.reduce((a, i) => a + ratios[i], 0)));
  let k = Math.max(1, Math.min(n, Math.floor(Math.sqrt((POST_GRID_HEIGHT[band] * sum) / w))));
  for (;;) {
    const rows = balancedRows(ratios, k);
    if (k >= n || heightOf(rows) >= POST_GRID_MIN_H[band]) return rows;
    k += 1;
  }
}

// n 枚を k 行に前から分ける全部の分け方 (n は 12 まで = 多くて 2,048 通り) から、行ごとの縦横比の合計のばらつきが最小の物
function balancedRows(ratios, k) {
  const n = ratios.length;
  const target = ratios.reduce((a, b) => a + b, 0) / k;
  let best = null;
  let bestCost = Infinity;
  const sizes = [];
  const walk = (start, left) => {
    if (left === 1) {
      sizes.push(n - start);
      let at = 0;
      let cost = 0;
      for (const size of sizes) {
        let rowSum = 0;
        for (let i = at; i < at + size; i += 1) rowSum += ratios[i];
        cost += (rowSum - target) ** 2;
        at += size;
      }
      // 同じくらい (縦横比の小さな違い・読み込んだ後の比の直し) なら、先に見つかった方 = 前の行ほど枚数が少ない方を残す
      if (cost < bestCost - 0.02) { bestCost = cost; best = [...sizes]; }
      sizes.pop();
      return;
    }
    for (let size = 1; size <= n - start - (left - 1); size += 1) {
      sizes.push(size);
      walk(start + size, left - 1);
      sizes.pop();
    }
  };
  walk(0, k);
  const rows = [];
  let at = 0;
  for (const size of best) {
    rows.push(Array.from({ length: size }, (_, i) => at + i));
    at += size;
  }
  return rows;
}

// 見出しの下の一言 (何がいくつあるか + 得な所)
export function albumSubText(album) {
  const parts = [];
  if (album.total === album.items.length) {
    if (album.photos > 0) parts.push(`写真 ${album.photos} 枚`);
    if (album.videos > 0) parts.push(`動画 ${album.videos} 本`);
  }
  const counts = parts.length > 0 ? `${parts.join("・")}。` : "";
  return `${counts}ほかの日の記録の分も、切らずに全部見られます`;
}

function storyThumb(value) {
  if (!value || typeof value !== "object") return null;
  if (value.kind === "image") {
    const url = safeUrl(value.url);
    return url ? { kind: "image", url } : null;
  }
  if (value.kind === "video") {
    const url = safeUrl(value.url);
    return url ? { kind: "video", url, posterUrl: safeUrl(value.poster_url) } : null;
  }
  return null;
}

function storyMoment(value) {
  if (!value || typeof value !== "object" || typeof value.memory_id !== "string" || !/^[0-9a-f-]{36}$/i.test(value.memory_id)) {
    return null;
  }
  const media = Array.isArray(value.media) ? value.media.slice(0, 4).map(mediaItem).filter(Boolean) : [];
  return {
    id: value.memory_id.toLowerCase(),
    title: text(value.title, 200),
    body: text(value.body),
    dateIso: typeof value.date === "string" ? value.date : null,
    dateText: formatJstDate(value.date),
    spoiler: value.spoiler === true,
    thumb: storyThumb(value.thumb),
    mediaCount: Number.isSafeInteger(value.media_count) && value.media_count > 0 ? Math.min(value.media_count, 4) : media.length,
    media,
  };
}

// r7 P2: EF share-view の story (このプレイの記録) → 描く物。中身が無ければ null (= 出さない)
export function storyModel(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  let review = null;
  if (value.review && typeof value.review === "object") {
    const fields = reviewFields(value.review);
    if (fields.scoreText || fields.comment || fields.statusLabel) {
      review = {
        ...fields,
        spoiler: value.review.spoiler === true,
        dateIso: typeof value.review.date === "string" ? value.review.date : null,
        dateText: formatJstDate(value.review.date),
      };
    }
  }
  const moments = Array.isArray(value.moments) ? value.moments.slice(0, STORY_MAX).map(storyMoment).filter(Boolean) : [];
  if (!review && moments.length === 0) return null;
  const total = Number.isSafeInteger(value.moments_total) && value.moments_total >= moments.length ? value.moments_total : moments.length;
  return { review, moments, total };
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

// 1 枚の動画: 表紙と大きな ▶。押すとその場で再生 (playsinline・始まってから操作の棒)。音を消した自動再生はしない。
// 再生できない (canPlayType が「無理」・読み込みの error) 時は表紙 +「このブラウザでは再生できません」+「アプリで見る」(Q7)
// TASK-20261021-002 10/29: 変換中の動画の札 (表紙 + 長さ + 小さな「動画を準備中」。▶ は出さない)
function preparingVideo(doc, node, item, { posterClass, durationClass }) {
  node.classList.add("is-preparing");
  node.append(image(doc, posterClass, item.posterUrl, ""));
  if (item.durationText) node.append(el(doc, "span", durationClass, item.durationText));
  const label = el(doc, "span", "pn-video-preparing", PREPARING_TEXT);
  label.setAttribute("role", "status");
  node.append(label);
  return node;
}

function videoSlide(doc, item, position, total, appHref) {
  const slide = el(doc, "div", "pn-slide pn-slide-video");
  slide.setAttribute("role", "group");
  slide.setAttribute("aria-roledescription", "スライド");
  slide.setAttribute("aria-label", `${position} / ${total} 動画`);
  if (item.preparing) {
    preparingVideo(doc, slide, item, { posterClass: "pn-video", durationClass: "pn-duration" });
    return { slide, video: null, fail: () => {} };
  }
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

// 写真・動画が 1 つの投稿 (Q1・r13)。画面幅いっぱいに大きく 1 枚 (枠の縦横比はその 1 枚に合わせる)。
// 写真は押すと全画面 (この投稿の分)、動画はその場で再生
function hero(doc, model, { onOpen, appHref }) {
  const item = model.media[0];
  const box = el(doc, "section", "pn-hero");
  box.setAttribute("aria-label", item.kind === "video" ? "動画" : "写真");
  // 枠の縦横比は描く前に決める (写真が読み込まれても下の文がずれない)
  box.style.setProperty?.("--pn-ratio", String(Number(heroRatio(model.media).toFixed(4))));
  const frame = el(doc, "div", "pn-frame");
  const track = el(doc, "div", "pn-track");
  if (item.kind === "video") {
    track.append(videoSlide(doc, item, 1, 1, appHref).slide);
  } else {
    const slide = button(doc, "pn-slide pn-slide-photo", null, "写真を大きく表示");
    const photo = image(doc, "pn-photo", item.url, `${model.author.name}さんの写真`);
    photo.loading = "eager";
    slide.append(photo);
    slide.addEventListener("click", () => onOpen(0));
    track.append(slide);
  }
  frame.append(track);
  box.append(frame);
  return { box, frame, track };
}

// r13: 写真・動画が 2 つ以上の投稿 = 全部を一覧 (アルバムと同じ札。切らずに縦横比のまま、行ごとに幅いっぱい)。
// 行の分け方は一覧の幅で決める (postGridRows)。描く前は画面幅から見積もり、置かれた後は本当の幅で並べ直す
function postGrid(doc, model, { onOpen }) {
  const items = model.postItems;
  const box = el(doc, "section", "pn-hero is-grid");
  box.setAttribute("aria-label", `写真・動画 ${items.length} 件`);
  const frame = el(doc, "div", "pn-post-frame");
  const grid = el(doc, "div", "pn-post-grid");
  grid.setAttribute("role", "list");
  const ratios = items.map(albumRatio);
  const tiles = items.map((item, index) => {
    const tile = albumTile(doc, item, index, items.length, {
      revealed: new Set(),
      onPress: (_, at) => onOpen(at),
      onRatio: (ratio) => { ratios[index] = ratio; layout(true); },
      // 開いてすぐ見える分は先に読む
      eager: index < 4,
    });
    tile.classList.add("pn-post-tile");
    tile.setAttribute("role", "listitem");
    return tile;
  });
  frame.append(grid);
  box.append(frame);

  const win = doc.defaultView ?? null;
  const gapOf = () => {
    const raw = win?.getComputedStyle?.(grid)?.getPropertyValue?.("--pn-album-gap");
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : 4;
  };
  // 置かれる前の幅の見積もり (site.css の並びと同じ数え方)
  const guess = () => {
    const vw = win?.innerWidth ?? 390;
    if (vw < 1024) return Math.min(vw, 640) - 24;
    const shell = Math.min(1600, Math.max(1100, vw * 0.88));
    return ((shell - 64 - 56) * 7) / 12;
  };
  let shape = "";
  function layout(force = false) {
    const width = grid.clientWidth || guess();
    const rows = postGridRows(ratios, width, gapOf());
    const key = JSON.stringify(rows);
    if (key === shape && !force) return;
    shape = key;
    const lines = rows.map((row) => {
      const line = el(doc, "div", "pn-post-row");
      const rowSum = row.reduce((a, i) => a + ratios[i], 0);
      line.style.setProperty?.("--rs", String(Number(rowSum.toFixed(4))));
      line.style.setProperty?.("--n", String(row.length));
      line.dataset.count = String(row.length);
      line.setAttribute("role", "presentation");
      line.append(...row.map((i) => tiles[i]));
      return line;
    });
    grid.replaceChildren(...lines);
  }
  layout();
  // 幅が変わった時だけ、次の描く前に並べ直す (高さの変化では動かない = 測り直しの繰り返しにならない)
  let lastWidth = -1;
  let pending = false;
  const later = () => {
    if (pending) return;
    pending = true;
    const raf = win?.requestAnimationFrame?.bind(win) ?? ((fn) => setTimeout(fn, 16));
    raf(() => { pending = false; layout(); });
  };
  const Observer = win?.ResizeObserver;
  if (typeof Observer === "function") {
    new Observer((entries) => {
      const width = Math.round(entries[0]?.contentRect?.width ?? 0);
      if (width === lastWidth) return;
      lastWidth = width;
      later();
    }).observe(grid);
  } else {
    win?.addEventListener?.("resize", later);
  }
  return { box, frame, track: grid, tiles, relayout: layout };
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

// r8: レビューのプレイ時間・遊んだ機種 (無ければ null)
function factsBlock(doc, review) {
  const rows = [];
  if (review.playTimeText) rows.push(["プレイ時間", review.playTimeText]);
  if (review.platforms?.length) rows.push(["遊んだ機種", review.platforms.join("、")]);
  if (rows.length === 0) return null;
  const list = el(doc, "dl", "pn-facts");
  for (const [label, value] of rows) {
    const row = el(doc, "div", "pn-fact");
    row.append(el(doc, "dt", "pn-fact-label", label), el(doc, "dd", "pn-fact-value", value));
    list.append(row);
  }
  return list;
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

// ---------------------------------------------------------------- r7 P2: このプレイの記録

// レビューの札 (親のレビュー)。満足度を大きく、感想は 4 行まで (長い時は「続きを読む」)。ネタバレは押すまで隠す
function storyReviewCard(doc, review) {
  const card = el(doc, "article", "pn-story-review");
  const head = el(doc, "div", "pn-story-review-head");
  head.append(el(doc, "p", "pn-story-label", "レビュー"));
  if (review.statusLabel) head.append(el(doc, "span", `pn-status pn-status-${review.status}`, review.statusLabel));
  card.append(head);
  if (review.scoreText) {
    const score = el(doc, "p", "pn-story-score");
    score.setAttribute("aria-label", `満足度 ${review.scoreText} / 10`);
    score.append(el(doc, "span", "pn-story-score-label", "満足度"), el(doc, "strong", "pn-story-score-number", review.scoreText),
      el(doc, "span", "pn-story-score-max", " / 10"));
    card.append(score);
  }
  const facts = factsBlock(doc, review);
  if (facts) card.append(facts);
  if (review.comment) {
    const body = el(doc, "div", "pn-story-review-body");
    const comment = el(doc, "p", "pn-story-comment", review.comment);
    const long = [...review.comment].length > COMMENT_FOLD || review.comment.split("\n").length > 4;
    const showComment = () => {
      body.replaceChildren(comment);
      if (long) {
        comment.classList.add("is-folded");
        const more = button(doc, "pn-story-more-button", READ_MORE);
        more.addEventListener("click", () => {
          comment.classList.remove("is-folded");
          more.remove();
        });
        body.append(more);
      }
    };
    if (review.spoiler) {
      const note = el(doc, "div", "pn-spoiler-text");
      const reveal = button(doc, "pn-spoiler-button", SPOILER_BUTTON);
      note.append(el(doc, "p", "pn-spoiler-text-note", "感想はネタバレを含むため隠しています"), reveal);
      reveal.addEventListener("click", showComment);
      body.append(note);
    } else {
      showComment();
    }
    card.append(body);
  }
  if (review.dateText) {
    const time = el(doc, "time", "pn-story-date", review.dateText);
    if (review.dateIso) time.setAttribute("datetime", review.dateIso);
    card.append(time);
  }
  return card;
}

// 開いた時の写真・動画 (横に並べて払う。写真は押すと全画面、動画はその場で再生)。開くまで読み込まない
function storyMedia(doc, moment, { onOpen }) {
  const row = el(doc, "div", "pn-story-media");
  const images = moment.media.filter((item) => item.kind === "image");
  moment.media.forEach((item) => {
    if (item.kind === "video") {
      const video = doc.createElement("video");
      video.className = "pn-story-video";
      video.controls = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.preload = "none";
      if (item.posterUrl) video.poster = item.posterUrl;
      if (typeof video.canPlayType !== "function" || video.canPlayType(item.mime) !== "") video.src = item.url;
      row.append(video);
      return;
    }
    const index = images.indexOf(item);
    const open = button(doc, "pn-story-photo", null, `写真 ${index + 1} / ${images.length} を大きく表示`);
    open.append(image(doc, "", item.url, ""));
    open.addEventListener("click", () => onOpen(images, index, item, moment.id));
    row.append(open);
  });
  return row;
}

function storyThumbNode(doc, thumb, count) {
  const box = el(doc, "span", "pn-story-thumb");
  box.setAttribute("aria-hidden", "true");
  const src = thumb.kind === "image" ? thumb.url : thumb.posterUrl;
  if (src) box.append(image(doc, "", src, ""));
  if (thumb.kind === "video") box.append(el(doc, "span", "pn-story-thumb-play"));
  if (count > 1) box.append(el(doc, "span", "pn-story-thumb-count", String(count)));
  return box;
}

// 同じプレイのほかのモーメント 1 件。押すとその場で開く (全文と写真・動画)。ネタバレは押すまで写真をぼかし、文を出さない
function storyMomentItem(doc, moment, { onOpen, onReveal = () => {} }) {
  const item = el(doc, "article", moment.spoiler ? "pn-story-item is-spoiler" : "pn-story-item");
  const panelId = `pn-story-${moment.id}`;
  const toggle = button(doc, "pn-story-toggle");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", panelId);
  if (moment.thumb) toggle.append(storyThumbNode(doc, moment.thumb, moment.mediaCount));
  const lines = el(doc, "span", "pn-story-lines");
  if (moment.spoiler) {
    lines.append(el(doc, "span", "pn-story-item-title", STORY_SPOILER), el(doc, "span", "pn-story-excerpt", "押すと表示します"));
  } else {
    const heading = moment.title ?? moment.body ?? (moment.mediaCount > 0 ? `写真・動画 ${moment.mediaCount}` : "モーメント");
    lines.append(el(doc, "span", "pn-story-item-title", heading));
    if (moment.title && moment.body) lines.append(el(doc, "span", "pn-story-excerpt", moment.body));
  }
  if (moment.dateText) {
    const time = el(doc, "time", "pn-story-date", moment.dateText);
    if (moment.dateIso) time.setAttribute("datetime", moment.dateIso);
    lines.append(time);
  }
  toggle.append(lines);
  item.append(toggle);

  const panel = el(doc, "div", "pn-story-panel");
  panel.id = panelId;
  panel.hidden = true;
  item.append(panel);
  let built = false;
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    if (open && !built) {
      built = true;
      // ふだんは見出しの文が全文になる (CSS の is-open で行の上限を外す)。ネタバレは押した時に初めて文を入れる
      if (moment.spoiler) {
        item.classList.remove("is-spoiler");
        onReveal(moment.id);
        if (moment.title) panel.append(el(doc, "h3", "pn-story-panel-title", moment.title));
        if (moment.body) panel.append(el(doc, "p", "pn-story-panel-body", moment.body));
      }
      if (moment.media.length > 0) panel.append(storyMedia(doc, moment, { onOpen }));
    }
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    panel.hidden = !open;
    item.classList[open ? "add" : "remove"]("is-open");
  });
  return item;
}

export function storySection(doc, model, { onOpen = () => {}, onReveal = () => {} } = {}) {
  const story = model.story;
  if (!story) return null;
  const section = el(doc, "section", "pn-story");
  section.setAttribute("aria-labelledby", "pn-story-heading");
  const head = el(doc, "header", "pn-story-head");
  const title = el(doc, "h2", "pn-story-title", STORY_TITLE);
  title.id = "pn-story-heading";
  head.append(title, el(doc, "p", "pn-story-sub", `${model.author.name}さんの『${model.game.title}』`));
  section.append(head);
  const grid = el(doc, "div", story.review ? "pn-story-grid has-review" : "pn-story-grid");
  if (story.review) grid.append(storyReviewCard(doc, story.review));
  if (story.moments.length > 0) {
    const list = el(doc, "div", "pn-story-list");
    list.setAttribute("role", "list");
    for (const moment of story.moments) {
      const node = storyMomentItem(doc, moment, { onOpen, onReveal });
      node.setAttribute("role", "listitem");
      list.append(node);
    }
    grid.append(list);
  }
  section.append(grid);
  const rest = story.total - story.moments.length;
  if (rest > 0) section.append(el(doc, "p", "pn-story-rest", `ほか ${rest} 件のモーメントはアプリで`));
  return section;
}

// ---------------------------------------------------------------- r8: このプレイのアルバム (DOM)

function albumLabel(item, index, total) {
  if (item.kind === "video" && item.preparing) return `動画 (${PREPARING_TEXT}) ${index + 1} / ${total} を開く`;
  if (item.kind === "video") return `動画${item.durationText ? ` (${item.durationText})` : ""} ${index + 1} / ${total} を開く`;
  return `写真 ${index + 1} / ${total} を大きく表示`;
}

// アルバムの 1 枚。縦横比のまま (切らない) 並べるため、枠の比を --a に入れる (CSS が行ごとに幅をそろえる)
function albumTile(doc, item, index, total, { revealed, onPress, onRatio = null, eager = false }) {
  const hidden = item.spoiler && !revealed.has(item.key);
  const tile = button(doc, `pn-album-tile pn-album-${item.kind}${hidden ? " is-spoiler" : ""}`, null,
    hidden ? `${ALBUM_SPOILER}: ${index + 1} / ${total} を表示` : albumLabel(item, index, total));
  tile.dataset.key = item.key;
  tile.dataset.index = String(index);
  const setRatio = (ratio) => tile.style.setProperty?.("--a", String(Number(ratio.toFixed(4))));
  setRatio(albumRatio(item));
  if (item.thumbUrl) {
    const thumb = image(doc, "pn-album-img", item.thumbUrl, "");
    if (eager) thumb.loading = "eager";
    // 大きさの分からなかった物は、読み込んだ本当の縦横比に直す
    if (!(item.width && item.height)) {
      thumb.addEventListener("load", () => {
        if (thumb.naturalWidth > 0 && thumb.naturalHeight > 0) {
          const ratio = Math.min(ALBUM_RATIO_MAX, Math.max(ALBUM_RATIO_MIN, thumb.naturalWidth / thumb.naturalHeight));
          setRatio(ratio);
          onRatio?.(ratio);
        }
      });
    }
    tile.append(thumb);
  } else {
    tile.append(el(doc, "span", "pn-album-img pn-album-empty"));
  }
  if (item.kind === "video" && item.preparing) {
    tile.classList.add("is-preparing");
    if (item.durationText) tile.append(el(doc, "span", "pn-album-duration", item.durationText));
    tile.append(el(doc, "span", "pn-video-preparing", PREPARING_TEXT));
  } else if (item.kind === "video") {
    tile.append(el(doc, "span", "pn-album-play"));
    if (item.durationText) tile.append(el(doc, "span", "pn-album-duration", item.durationText));
  }
  tile.append(el(doc, "span", "pn-album-spoiler", ALBUM_SPOILER));
  tile.addEventListener("click", () => onPress(item, index, tile));
  return tile;
}

export function albumSection(doc, model, { revealed = new Set(), onOpen = () => {}, onReveal = () => {} } = {}) {
  const album = model.album;
  if (!album) return null;
  const section = el(doc, "section", "pn-album");
  section.id = "pn-album";
  section.setAttribute("aria-labelledby", "pn-album-heading");
  const head = el(doc, "header", "pn-album-head");
  const title = el(doc, "h2", "pn-album-title");
  title.id = "pn-album-heading";
  title.append(el(doc, "span", "pn-album-title-text", ALBUM_TITLE), el(doc, "span", "pn-album-count", `（${album.total}）`));
  head.append(title, el(doc, "p", "pn-album-sub", albumSubText(album)));
  section.append(head);
  const grid = el(doc, "div", "pn-album-grid");
  grid.setAttribute("role", "list");
  const tiles = [];
  album.items.forEach((item, index) => {
    const tile = albumTile(doc, item, index, album.items.length, {
      revealed,
      onPress: (pressed, at, node) => {
        // ネタバレは 1 回目で見せるだけ (同じ記録の物を全部)。2 回目から全画面で開く
        if (node.classList.contains("is-spoiler")) {
          onReveal(pressed.key);
          return;
        }
        onOpen(at);
      },
    });
    tile.setAttribute("role", "listitem");
    tiles.push(tile);
    grid.append(tile);
  });
  section.append(grid);
  const rest = album.total - album.items.length;
  if (rest > 0) section.append(el(doc, "p", "pn-album-rest", `ほか ${rest} 件はアプリで`));
  const reveal = (key) => {
    tiles.forEach((tile, index) => {
      if (tile.dataset.key !== key || !tile.classList.contains("is-spoiler")) return;
      tile.classList.remove("is-spoiler");
      tile.setAttribute("aria-label", albumLabel(album.items[index], index, album.items.length));
    });
  };
  return { section, reveal };
}

// 全画面でアルバムの全部を左右に送って見る。写真は 2 本指で広げる・2 回押す (PC はダブルクリック) で拡大、
// 拡大中は指 (PC はつまんで) で動かす。動画はその場で再生。ネタバレはその 1 枚の上の「ネタバレを表示」で出す。
// Esc で閉じる・左右の矢印キーで送る・Tab は中だけを回る。閉じたら元の場所へ焦点を戻す
export function openAlbumViewer(doc, items, start, { touch = false, isRevealed = () => true, reveal = () => {}, appHref = null } = {}) {
  // 開いている間にもう一度押されても 2 枚目は重ねない
  if (typeof doc.querySelector === "function" && doc.querySelector(".pn-av")) return null;
  if (!Array.isArray(items) || items.length === 0) return null;
  const win = doc.defaultView ?? globalThis;
  const opener = doc.activeElement ?? null;
  const total = items.length;
  let current = Math.max(0, Math.min(total - 1, start));
  const overlay = el(doc, "div", touch ? "pn-av is-touch" : "pn-av");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", ALBUM_TITLE);
  const track = el(doc, "div", "pn-av-track");
  const slides = [];

  const zoomOf = (slide) => slide.zoom;
  const resetZoom = (slide) => slide?.resetZoom?.();

  const buildPhoto = (item, index) => {
    const node = el(doc, "div", "pn-av-slide pn-av-photo");
    const box = el(doc, "div", "pn-av-zoom");
    const pic = doc.createElement("img");
    pic.className = "pn-av-img";
    pic.alt = `写真 ${index + 1} / ${total}`;
    pic.decoding = "async";
    pic.referrerPolicy = "no-referrer";
    pic.draggable = false;
    box.append(pic);
    node.append(box);
    const z = { s: 1, x: 0, y: 0 };
    const apply = () => {
      pic.style.transform = z.s === 1 ? "" : `translate(${z.x}px, ${z.y}px) scale(${z.s})`;
      node.classList[z.s > 1 ? "add" : "remove"]("is-zoomed");
      overlay.classList[z.s > 1 ? "add" : "remove"]("is-zoomed");
    };
    const clamp = () => {
      const r = box.getBoundingClientRect();
      const mx = (r.width * (z.s - 1)) / 2;
      const my = (r.height * (z.s - 1)) / 2;
      z.x = Math.max(-mx, Math.min(mx, z.x));
      z.y = Math.max(-my, Math.min(my, z.y));
    };
    // (cx, cy) = 枠の真ん中からの指の位置。そこを動かさずに倍率を変える
    const zoomTo = (scale, cx = 0, cy = 0) => {
      const next = Math.max(1, Math.min(4, scale));
      z.x = cx - ((cx - z.x) * next) / z.s;
      z.y = cy - ((cy - z.y) * next) / z.s;
      z.s = next;
      if (z.s === 1) { z.x = 0; z.y = 0; }
      clamp();
      apply();
    };
    const fromCenter = (clientX, clientY) => {
      const r = box.getBoundingClientRect();
      return [clientX - (r.left + r.width / 2), clientY - (r.top + r.height / 2)];
    };
    const toggle = (clientX, clientY) => {
      if (z.s > 1) zoomTo(1);
      else zoomTo(2.5, ...fromCenter(clientX, clientY));
    };
    let pinch = null;
    let pan = null;
    let lastTap = { t: 0, x: 0, y: 0 };
    let lastTouchAt = 0;
    box.addEventListener("touchstart", (event) => {
      lastTouchAt = Date.now();
      if (event.touches.length === 2) {
        const [a, b] = [event.touches[0], event.touches[1]];
        pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1, s: z.s,
          c: fromCenter((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2) };
        pan = null;
        event.preventDefault();
      } else if (event.touches.length === 1 && z.s > 1) {
        pan = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      }
    }, { passive: false });
    box.addEventListener("touchmove", (event) => {
      if (pinch && event.touches.length === 2) {
        const [a, b] = [event.touches[0], event.touches[1]];
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        zoomTo((pinch.s * d) / pinch.d, ...pinch.c);
        event.preventDefault();
      } else if (pan && event.touches.length === 1 && z.s > 1) {
        const t = event.touches[0];
        z.x += t.clientX - pan.x;
        z.y += t.clientY - pan.y;
        pan = { x: t.clientX, y: t.clientY };
        clamp();
        apply();
        event.preventDefault();
      }
    }, { passive: false });
    box.addEventListener("touchend", (event) => {
      if (event.touches.length < 2) pinch = null;
      if (event.touches.length === 0) pan = null;
      if (event.touches.length > 0 || event.changedTouches.length !== 1) return;
      const t = event.changedTouches[0];
      const now = Date.now();
      if (now - lastTap.t < 300 && Math.hypot(t.clientX - lastTap.x, t.clientY - lastTap.y) < 30) {
        toggle(t.clientX, t.clientY);
        lastTap = { t: 0, x: 0, y: 0 };
        event.preventDefault();
      } else {
        lastTap = { t: now, x: t.clientX, y: t.clientY };
      }
    });
    box.addEventListener("dblclick", (event) => {
      if (Date.now() - lastTouchAt < 800) return;
      toggle(event.clientX, event.clientY);
    });
    // PC: 拡大中はつまんで動かす
    let drag = null;
    box.addEventListener("mousedown", (event) => {
      if (z.s <= 1 || event.button !== 0) return;
      drag = { x: event.clientX, y: event.clientY };
      event.preventDefault();
    });
    const onMove = (event) => {
      if (!drag) return;
      z.x += event.clientX - drag.x;
      z.y += event.clientY - drag.y;
      drag = { x: event.clientX, y: event.clientY };
      clamp();
      apply();
    };
    const onUp = () => { drag = null; };
    doc.addEventListener("mousemove", onMove);
    doc.addEventListener("mouseup", onUp);
    return {
      node,
      load: () => { if (!pic.getAttribute("src")) pic.src = item.url; },
      resetZoom: () => { if (z.s !== 1) zoomTo(1); },
      zoom: z,
      cleanup: () => { doc.removeEventListener("mousemove", onMove); doc.removeEventListener("mouseup", onUp); },
    };
  };

  const buildVideo = (item) => {
    const node = el(doc, "div", "pn-av-slide pn-av-video-slide");
    if (item.preparing) {
      preparingVideo(doc, node, item, { posterClass: "pn-av-img", durationClass: "pn-av-duration" });
      return { node, video: null, load: () => {}, pause: () => {} };
    }
    const video = doc.createElement("video");
    video.className = "pn-av-video";
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.preload = "none";
    if (item.posterUrl) video.poster = item.posterUrl;
    node.append(video);
    const play = button(doc, "pn-av-play", null, `動画を再生${item.durationText ? ` (${item.durationText})` : ""}`);
    play.append(el(doc, "span", "pn-play-icon"));
    node.append(play);
    if (item.durationText) node.append(el(doc, "span", "pn-av-duration", item.durationText));
    const playable = typeof video.canPlayType !== "function" || video.canPlayType(item.mime) !== "";
    const fail = () => {
      if (node.classList.contains("is-unplayable")) return;
      node.classList.add("is-unplayable");
      play.hidden = true;
      video.controls = false;
      const box = el(doc, "div", "pn-video-fail");
      box.setAttribute("role", "status");
      box.append(el(doc, "p", "pn-video-fail-text", UNPLAYABLE_TEXT), link(doc, "pn-video-fail-link pn-app-link", appHref ?? "#", OPEN_IN_APP));
      node.append(box);
    };
    if (!playable) fail();
    video.addEventListener("error", () => { if (video.getAttribute("src")) fail(); });
    const load = () => {
      if (!playable || video.getAttribute("src")) return;
      video.src = item.url;
      video.preload = "metadata";
    };
    play.addEventListener("click", () => {
      load();
      play.hidden = true;
      node.classList.add("is-started");
      video.controls = true;
      const started = video.play?.();
      if (started && typeof started.catch === "function") {
        started.catch((error) => {
          if (error?.name === "NotAllowedError" || error?.name === "AbortError") {
            play.hidden = false;
            video.controls = false;
            node.classList.remove("is-started");
          } else {
            fail();
          }
        });
      }
    });
    return { node, video, load, pause: () => { if (!video.paused) video.pause?.(); } };
  };

  items.forEach((item, index) => {
    const made = item.kind === "video" ? buildVideo(item) : buildPhoto(item, index);
    made.item = item;
    made.node.setAttribute("role", "group");
    made.node.setAttribute("aria-roledescription", "スライド");
    made.node.setAttribute("aria-label", `${index + 1} / ${total} ${item.kind === "video" ? "動画" : "写真"}`);
    if (item.spoiler && !isRevealed(item.key)) {
      made.node.classList.add("is-spoiler");
      const cover = el(doc, "div", "pn-av-spoiler");
      const show = button(doc, "pn-spoiler-button", SPOILER_BUTTON);
      cover.append(el(doc, "p", "pn-spoiler-note", VIEWER_SPOILER_NOTE), show);
      show.addEventListener("click", () => {
        reveal(item.key);
        for (const other of slides) {
          if (other.item.key !== item.key) continue;
          other.node.classList.remove("is-spoiler");
          other.cover?.remove();
          other.cover = null;
        }
        for (const thumb of rail?.children ?? []) if (thumb.dataset?.key === item.key) thumb.classList.remove("is-spoiler");
      });
      made.node.append(cover);
      made.cover = cover;
    }
    slides.push(made);
    track.append(made.node);
  });

  const head = el(doc, "div", "pn-av-head");
  const counter = el(doc, "p", "pn-av-counter");
  counter.setAttribute("aria-live", "polite");
  const close = button(doc, "pn-av-close", null, "閉じる");
  close.append(el(doc, "span", "share-viewer-x"));
  head.append(counter, close);
  const prev = button(doc, "pn-av-nav prev", null, "前の写真・動画");
  const next = button(doc, "pn-av-nav next", null, "次の写真・動画");
  const caption = el(doc, "div", "pn-av-caption");
  const captionTitle = el(doc, "p", "pn-av-caption-title");
  const captionDate = el(doc, "p", "pn-av-caption-date");
  caption.append(captionTitle, captionDate);
  // PC: 下に小さな絵の列 (押すとその 1 枚へ)
  const rail = total > 1 ? el(doc, "div", "pn-av-rail") : null;
  if (rail) {
    items.forEach((item, index) => {
      const thumb = button(doc, `pn-av-thumb${item.spoiler && !isRevealed(item.key) ? " is-spoiler" : ""}`, null, `${index + 1} / ${total} を表示`);
      thumb.dataset.key = item.key;
      if (item.thumbUrl) thumb.append(image(doc, "", item.thumbUrl, ""));
      if (item.kind === "video") thumb.append(el(doc, "span", "pn-av-thumb-play"));
      thumb.addEventListener("click", () => goTo(index));
      rail.append(thumb);
    });
  }

  const update = () => {
    const item = items[current];
    counter.textContent = `${current + 1} / ${total}`;
    captionTitle.textContent = item.title ?? (item.key === "review" ? "レビューの写真" : "");
    captionDate.textContent = item.dateText ?? "";
    caption.hidden = !captionTitle.textContent && !captionDate.textContent;
    prev.disabled = current === 0;
    next.disabled = current === total - 1;
    if (rail) {
      [...rail.children].forEach((thumb, index) => {
        thumb.classList[index === current ? "add" : "remove"]("is-current");
        if (index === current) thumb.setAttribute("aria-current", "true");
        else thumb.removeAttribute("aria-current");
      });
      rail.children[current]?.scrollIntoView?.({ block: "nearest", inline: "center" });
    }
    // 今の 1 枚と前後だけ読み込む。見えなくなった動画は止め、拡大は戻す
    slides.forEach((slide, index) => {
      if (Math.abs(index - current) <= 1) slide.load();
      if (index !== current) {
        slide.pause?.();
        resetZoom(slide);
      }
    });
  };
  const mark = (index) => {
    if (index === current || index < 0 || index >= total) return;
    current = index;
    update();
  };
  // ボタン・矢印キーで動かしている間は、途中の位置で番号を戻さない (着いたら、または 1 秒で解除)
  let target = null;
  let targetTimer = null;
  const goTo = (index, smooth = true) => {
    const to = Math.max(0, Math.min(total - 1, index));
    const width = track.clientWidth || 0;
    target = to;
    clearTimeout(targetTimer);
    targetTimer = setTimeout(() => { target = null; }, 1000);
    track.scrollTo?.({ left: to * width, behavior: smooth && !prefersReducedMotion(doc) ? "smooth" : "auto" });
    mark(to);
  };
  let pending = null;
  track.addEventListener("scroll", () => {
    if (pending !== null) return;
    const raf = win.requestAnimationFrame?.bind(win) ?? ((fn) => setTimeout(fn, 16));
    pending = raf(() => {
      pending = null;
      const width = track.clientWidth || 1;
      if (target !== null) {
        if (Math.abs(track.scrollLeft - target * width) < 2) target = null;
        return;
      }
      mark(Math.round(track.scrollLeft / width));
    });
  }, { passive: true });
  const onResize = () => { track.scrollLeft = current * (track.clientWidth || 0); };
  win.addEventListener?.("resize", onResize);

  const focusables = () => [...overlay.querySelectorAll("button, a[href], video[controls]")]
    .filter((node) => !node.hidden && !node.disabled && node.offsetParent !== null);
  const onKey = (event) => {
    if (event.key === "Escape") finish();
    else if (event.key === "ArrowLeft") { event.preventDefault(); goTo(current - 1); }
    else if (event.key === "ArrowRight") { event.preventDefault(); goTo(current + 1); }
    else if (event.key === "Tab") {
      const order = focusables();
      if (order.length === 0) return;
      const at = order.indexOf(doc.activeElement);
      event.preventDefault();
      order[(at + (event.shiftKey ? order.length - 1 : 1) + order.length) % order.length]?.focus();
    }
  };
  const finish = () => {
    clearTimeout(targetTimer);
    doc.removeEventListener("keydown", onKey);
    win.removeEventListener?.("resize", onResize);
    for (const slide of slides) { slide.pause?.(); slide.cleanup?.(); }
    overlay.remove();
    doc.body.classList.remove("share-viewer-open");
    if (opener && typeof opener.focus === "function") opener.focus({ preventScroll: true });
  };
  // 黒地 (写真の外) を押したら閉じる。拡大中・動画は閉じない
  overlay.addEventListener("click", (event) => {
    const target = event.target;
    if (overlay.classList.contains("is-zoomed")) return;
    if (target === overlay || target?.classList?.contains("pn-av-slide") || target?.classList?.contains("pn-av-zoom")) {
      if (!touch) finish();
    }
  });
  close.addEventListener("click", finish);
  prev.addEventListener("click", () => goTo(current - 1));
  next.addEventListener("click", () => goTo(current + 1));
  doc.addEventListener("keydown", onKey);
  overlay.append(track, prev, next, head, caption);
  if (rail) overlay.append(rail);
  prev.hidden = total < 2;
  next.hidden = total < 2;
  doc.body.classList.add("share-viewer-open");
  doc.body.append(overlay);
  track.scrollLeft = current * (track.clientWidth || 0);
  update();
  close.focus?.(touch ? { focusVisible: false } : undefined);
  return { goTo, close: finish, get index() { return current; }, overlay, zoom: (index) => zoomOf(slides[index]) };
}

// ---------------------------------------------------------------- ページ全体

// ページの一番下の控えめな行 (r7 P3)。スマホ = app.mjs の「PlayNaviアプリで開く」(startShareView が移す)、
// PC = ストアの小さな文字のリンク (iPhone = App Store だけ、Android = Google Play だけ、ほか = 両方)
function endLine(doc, platform) {
  const end = el(doc, "footer", "pn-end");
  const inner = el(doc, "div", "pn-end-inner");
  inner.append(el(doc, "span", "pn-end-brand", "PlayNavi"), el(doc, "div", "pn-end-slot"));
  const stores = el(doc, "div", "pn-end-stores");
  if (platform !== "android") stores.append(link(doc, "pn-end-store", APP_STORE_URL, "App Store"));
  if (platform !== "ios") stores.append(link(doc, "pn-end-store", PLAY_STORE_URL, "Google Play"));
  inner.append(stores);
  end.append(inner);
  return end;
}

export function buildShareView(doc, model, { onOpen = () => {}, onOpenAlbum = null, platform = "other" } = {}) {
  const root = el(doc, "div", "pn-rec");
  // r8: ネタバレを見せた記録 (アルバム・全画面で同じ扱いにする)
  const revealed = new Set();
  let albumParts = null;
  const revealKey = (key) => {
    if (!key) return;
    revealed.add(key);
    albumParts?.reveal(key);
  };
  const openAlbum = (index) => {
    const album = model.album;
    if (!album) return false;
    const open = onOpenAlbum ?? ((items, at, options) => openAlbumViewer(doc, items, at, options));
    open(album.items, index, { touch: platform !== "other", isRevealed: (key) => revealed.has(key), reveal: revealKey, appHref: model.appUrl });
    return true;
  };
  // 「このプレイの記録」の写真を押した時は、アルバムの同じ 1 枚から全部を送れるようにする
  const openFromRecord = (key, list, item) => {
    const album = model.album;
    if (!album || !key || !item) return false;
    const own = album.items.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.key === key);
    const position = list.indexOf(item);
    const hit = position >= 0 ? own[position] : null;
    return hit ? openAlbum(hit.index) : false;
  };
  // r13: 投稿の写真・動画 (一覧・1 枚) を押したら、この投稿の分だけを全画面で送る (アルバムと同じ全画面)
  const openPost = (index) => {
    const open = onOpenAlbum ?? ((items, at, options) => openAlbumViewer(doc, items, at, options));
    open(model.postItems, index, { touch: platform !== "other", isRevealed: () => true, reveal: () => {}, appHref: model.appUrl });
  };
  const openStory = (images, index, item, key) => {
    const moment = model.story?.moments.find((m) => m.id === key);
    if (!moment || !openFromRecord(key, moment.media, item)) onOpen(images, index);
  };
  root.dataset.kind = model.kind;
  root.dataset.platform = platform;
  root.dataset.app = "off";
  const masked = model.spoiler && hasMaskedContent(model);
  if (masked) root.classList.add("is-spoiler");

  // 左上の小さな印だけ (r7 P3)
  const top = el(doc, "header", "pn-top");
  const topInner = el(doc, "div", "pn-top-inner");
  topInner.append(logo(doc));
  top.append(topInner);
  root.append(top);

  const layout = el(doc, "div", model.media.length > 0 ? "pn-layout has-media" : "pn-layout");
  // 名前・日付 (主役は本人。スマホは写真・動画の上、PC は右の列の頭)
  layout.append(author(doc, model));
  let heroParts = null;
  if (model.media.length > 1) {
    heroParts = postGrid(doc, model, { onOpen: openPost });
    layout.append(heroParts.box);
  } else if (model.media.length === 1) {
    heroParts = hero(doc, model, { onOpen: openPost, appHref: model.appUrl });
    layout.append(heroParts.box);
  }

  const details = el(doc, "div", "pn-details");
  if (model.kind === "review" && model.scoreText) details.append(scoreBlock(doc, model));
  if (model.kind === "review") {
    const facts = factsBlock(doc, model);
    if (facts) details.append(facts);
  }
  const textBox = el(doc, "div", "pn-text");
  details.append(textBox);
  details.append(gameChip(doc, model));

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
      revealKey(model.recordKey);
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
  layout.append(details);
  root.append(layout);

  albumParts = albumSection(doc, model, { revealed, onOpen: openAlbum, onReveal: revealKey });
  if (albumParts) root.append(albumParts.section);
  const story = storySection(doc, model, { onOpen: openStory, onReveal: revealKey });
  if (story) root.append(story);
  root.append(endLine(doc, platform));
  return root;
}

// アプリを開くリンク (再生できない時の「アプリで見る」) を app.mjs の #primary-btn にそろえる。
// #primary-btn が出ている (スマホ) 時はその住所、出ていない (PC・確認中) 時は記録の正規の住所
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

  // app.mjs の「PlayNaviアプリで開く」(とその横の「もう一度試す」) をページの一番下の控えめな行へ移す (r7 P3)。
  // 要素そのものを移すので、app.mjs が持っている参照・住所の決め方はそのまま (ストアの印は出さない)
  const actions = typeof linkView.querySelector === "function" ? linkView.querySelector(".actions") : null;
  const slot = typeof root.querySelector === "function" ? root.querySelector(".pn-end-slot") : null;
  if (actions && slot) slot.append(actions);
  const primary = doc.getElementById("primary-btn");
  const sync = () => syncAppLinks(root, primary, model.appUrl);
  sync();
  const Observer = doc.defaultView?.MutationObserver ?? globalThis.MutationObserver;
  if (primary && typeof Observer === "function") {
    new Observer(sync).observe(primary, { attributes: true, attributeFilter: ["href", "class"] });
  }
  return true;
}
