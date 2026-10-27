// TASK-20261023-003 E2: Tier表のリンクカードに描く「表そのもの」の決まり (描画しない純粋な値と関数だけ)。
// - 段の帯の色: アプリ constants/tierColors.ts (tierBand / monoBand) と Web web/src/lib/tierLists/model.ts (bandPaint) の写し。
//   値を変える時はアプリ・Web・ここの 3 つをそろえる。
// - 札の大きさ (どれも大きい方から 1px ずつ試す = アプリのシェア画像 web/src/lib/tierLists/model.ts fitBoard と同じ探し方):
//   1) 全部の札が入るなら全部を描く (札の幅 TIER_READ_MIN 以上で、入る中で一番大きく)
//   2) 入らなければ、段ごとの行の数に上限を付け、入り切らない分は段の最後の枠を「+N」にする。札の幅 TIER_READ_MIN 以上の
//      組み合わせ (幅 × 行の上限) のうち、描く札の面積の合計 (枚数 × 幅²) がいちばん大きい物 (同じなら札が大きい方)
//   3) それでも入らない (段が 7〜8 つ) なら 1 段 1 行で、入る中で一番大きく
//   空の段は帯の文字が入る高さだけ残す。

export const TIER_LOOKS = ["rarity", "neon", "mono"];
export const TIER_COLORS = ["gold", "purple", "blue", "green", "cyan", "red", "orange", "silver", "onyx"];

const RARITY = {
  gold: { stops: ["#ffe58a", "#f5b301", "#a86a00"], locations: [0, 0.42, 1], ink: "#2b1a00" },
  purple: { stops: ["#c4a6ff", "#7c4dff", "#45199e"], locations: [0, 0.45, 1], ink: "#ffffff" },
  blue: { stops: ["#8cc0ff", "#2f7bf5", "#163f9c"], locations: [0, 0.45, 1], ink: "#ffffff" },
  green: { stops: ["#7eecc0", "#14b886", "#08664b"], locations: [0, 0.45, 1], ink: "#ffffff" },
  cyan: { stops: ["#8deaf3", "#22b0c6", "#0b6575"], locations: [0, 0.45, 1], ink: "#ffffff" },
  red: { stops: ["#ff9db4", "#f0436a", "#941539"], locations: [0, 0.45, 1], ink: "#ffffff" },
  orange: { stops: ["#ffc896", "#ff7a2f", "#a83a08"], locations: [0, 0.45, 1], ink: "#ffffff" },
  silver: { stops: ["#ffffff", "#ccd4db", "#8693a0"], locations: [0, 0.45, 1], ink: "#16202a" },
  onyx: { stops: ["#66727d", "#2a3138", "#0d1115"], locations: [0, 0.45, 1], ink: "#ffffff" },
};
const NEON_BASE = "#101317";
const NEON = {
  gold: { glow: "rgba(255,210,74,0.34)", ink: "#ffd24a" },
  purple: { glow: "rgba(178,136,255,0.36)", ink: "#c2a0ff" },
  blue: { glow: "rgba(90,169,255,0.36)", ink: "#6fb4ff" },
  green: { glow: "rgba(62,240,165,0.30)", ink: "#4ff0b0" },
  cyan: { glow: "rgba(63,227,240,0.32)", ink: "#57e6f2" },
  red: { glow: "rgba(255,92,138,0.34)", ink: "#ff6f97" },
  orange: { glow: "rgba(255,154,60,0.34)", ink: "#ffa451" },
  silver: { glow: "rgba(227,232,238,0.26)", ink: "#eef2f6" },
  onyx: { glow: "rgba(140,151,163,0.26)", ink: "#a9b4bf" },
};
const MONO_BASE = {
  gold: "#f5b301", purple: "#7c4dff", blue: "#2f7bf5", green: "#14b886", cyan: "#26b3c8",
  red: "#f0436a", orange: "#ff7a2f", silver: "#9aa6b2", onyx: "#4a545d",
};
const GLOSS = "linear-gradient(180deg, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0) 46%)";

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
export function mixColor(a, b, t) {
  const x = rgb(a);
  const y = rgb(b);
  return "#" + x.map((v, i) => ("0" + Math.round(v + (y[i] - v) * t).toString(16)).slice(-2)).join("");
}
const isLight = (hex) => {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.66;
};

// アプリ monoBand と同じ: 1 段目は表の色を白へ 30% 寄せ、最後の段は黒へ 50% 寄せ、間は等分
function monoBand(color, index, count) {
  const base = MONO_BASE[color] ?? MONO_BASE.cyan;
  const pos = count > 1 ? index / (count - 1) : 0;
  const t = 0.3 - 0.8 * pos;
  const c = t >= 0 ? mixColor(base, "#ffffff", t) : mixColor(base, "#000000", -t);
  return {
    stops: [mixColor(c, "#ffffff", 0.32), c, mixColor(c, "#000000", 0.4)],
    locations: [0, 0.45, 1],
    ink: isLight(c) ? mixColor(base, "#000000", 0.78) : "#ffffff",
  };
}

// Web bandPaint と同じ形 (背景・グラデーション・光沢・文字の色・ネオンの線・文字の影・斜体)
export function bandPaint(look, colorKey, monoColor, index, count) {
  if (look === "neon") {
    const n = NEON[colorKey] ?? NEON.cyan;
    return {
      backgroundColor: NEON_BASE,
      gradient: `linear-gradient(120deg, ${n.glow} 0%, rgba(16,19,23,0) 70%)`,
      gloss: null,
      ink: n.ink,
      neon: n.ink,
      textShadow: `0 0 10px ${n.ink}, 0 0 2px ${n.ink}`,
      italic: false,
    };
  }
  const band = look === "mono" ? monoBand(monoColor, index, count) : RARITY[colorKey] ?? RARITY.cyan;
  const [a, b, c] = band.stops;
  const [la, lb, lc] = band.locations.map((l) => `${Math.round(l * 100)}%`);
  return {
    backgroundColor: b,
    gradient: `linear-gradient(150deg, ${a} ${la}, ${b} ${lb}, ${c} ${lc})`,
    gloss: GLOSS,
    ink: band.ink,
    neon: null,
    textShadow: isLight(band.ink) ? "0 1px 2px rgba(0,0,0,0.28)" : "0 1px 0 rgba(255,255,255,0.45)",
    italic: true,
  };
}

// ---------------------------------------------------------------- 札の大きさ

// 札の幅の上限・全部描く時の下限・1 段 1 行の時の下限 (縦横は 3:4)
export const TIER_CARD_MAX = 150;
export const TIER_READ_MIN = 48;
export const TIER_CARD_MIN = 20;
const DIVIDER = 4;

// 段の数で帯の幅を決める (段が多いほど帯は細い)
export function bandWidth(tierCount) {
  if (tierCount <= 2) return 120;
  if (tierCount <= 4) return 104;
  if (tierCount <= 6) return 92;
  return 84;
}

function measure(counts, width, height, w, cap) {
  const tiers = counts.length;
  const band = bandWidth(tiers);
  const pad = w >= 48 ? 6 : 4;
  const gap = w >= 48 ? 6 : 4;
  const cardH = Math.round((w * 4) / 3);
  const perRow = Math.max(1, Math.floor((width - band - pad * 2 + gap) / (w + gap)));
  // 空の段の高さ: 1 段に割り当たる高さ (最大 64。札が 1 枚も無い表は最大 96)。帯の字 (ランク名) が読める高さ
  const allEmpty = counts.every((n) => n === 0);
  const emptyRow = Math.max(24, Math.min(allEmpty ? 96 : 64, Math.floor((height - DIVIDER * (tiers - 1)) / tiers)));
  const rows = counts.map((n) => {
    if (n === 0) return { h: emptyRow, lines: 0, shown: 0, more: 0 };
    const lines = Math.min(Math.ceil(n / perRow), cap);
    const shown = n > lines * perRow ? lines * perRow - 1 : n;
    return { h: Math.max(lines * cardH + (lines - 1) * gap + pad * 2, emptyRow), lines, shown, more: n - shown };
  });
  const total = rows.reduce((s, r) => s + r.h, 0) + DIVIDER * Math.max(0, tiers - 1);
  const drawn = rows.reduce((s, r) => s + r.shown, 0);
  return { band, pad, gap, divider: DIVIDER, cardW: w, cardH, perRow, rows, total, drawn, fits: total <= height };
}

// counts = 各段の札の数 (上から)。width / height = 表の枠。返り値 mode: all = 全部描く / capped = 行の上限つきで +N / line = 1 段 1 行で +N
export function tierBoardLayout(counts, { width, height }) {
  const safe = counts.map((n) => (Number.isSafeInteger(n) && n > 0 ? n : 0));
  if (safe.length === 0) return null;
  for (let w = TIER_CARD_MAX; w >= TIER_READ_MIN; w--) {
    const fit = measure(safe, width, height, w, Infinity);
    if (fit.fits) return { ...fit, mode: "all" };
  }
  let best = null;
  for (let cap = 1; cap <= 12; cap++) {
    for (let w = TIER_CARD_MAX; w >= TIER_READ_MIN; w--) {
      const fit = measure(safe, width, height, w, cap);
      if (!fit.fits) continue;
      const area = fit.drawn * w * w;
      if (!best || area > best.area || (area === best.area && w > best.cardW)) best = { ...fit, area };
    }
  }
  if (best) {
    const { area, ...fit } = best;
    return { ...fit, mode: "capped" };
  }
  for (let w = TIER_READ_MIN - 1; w >= TIER_CARD_MIN; w--) {
    const fit = measure(safe, width, height, w, 1);
    if (fit.fits) return { ...fit, mode: "line" };
  }
  return { ...measure(safe, width, height, TIER_CARD_MIN, 1), mode: "line" };
}
