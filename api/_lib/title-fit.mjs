// TASK-20261023-003 (10/26): カードの大きな題の字の大きさを、字数でなく「実際の字の幅で折り返した結果」で決める。
// 前は字数だけで決めていた (例: カタログは 10 字以下 56px)。和文 1 字・欧文 0.6 字の見積もりより太字の英大文字が広く
// (「BGM」は 2.3 字分)、本番で「とにかくBGMが良 / い」「絶対クリアするぞリス / ト」のように 1 字だけ次の行に落ちた。
//
// 決まり (カタログ・ゲーム・表紙なしの記録のカードで共通):
// - 候補の大きさを大きい順に試し、1 字だけの行が出ない (最後の行が一番長い行の 4 割以上) ・どの行も枠に収まる、一番大きい字にする。
// - 2 行以内で決まるならそれを選び、無ければ行数の上限まで広げる。どれも当たらない (とても長い題) 時は前と同じ字数の決まり。
// 折り返しは、カードを描く Satori (@vercel/og) と同じ所で切る: 空白の後・和文の字の間 (小さい「ッ」「ャ」・「ー」・閉じ括弧・句読点の前と、
// 開き括弧の後では切らない)・英数字のつながりの中では切らない。試験 tests/title-fit.test.mjs が本物の描画と行数・幅を突き合わせる。

// Noto Sans JP 900 (カードの題の字体、Google Fonts の切り出し) の半角の字の幅 (1 = 字の大きさ)。
// 2026-10-26 に loadSubsetFont で読んだ字体の字送りを opentype で実測した値。和文・全角は 1。
const ASCII_WIDTH = {
  " ": 0.229, "!": 0.397, "\"": 0.631, "#": 0.609, "$": 0.609, "%": 0.986, "&": 0.773, "'": 0.351, "(": 0.4, ")": 0.4,
  "*": 0.529, "+": 0.609, ",": 0.351, "-": 0.383, ".": 0.351, "/": 0.385, "0": 0.609, "1": 0.609, "2": 0.609, "3": 0.609,
  "4": 0.609, "5": 0.609, "6": 0.609, "7": 0.609, "8": 0.609, "9": 0.609, ":": 0.351, ";": 0.351, "<": 0.609, "=": 0.609,
  ">": 0.609, "?": 0.536, "@": 1.041, "A": 0.66, "B": 0.695, "C": 0.667, "D": 0.729, "E": 0.63, "F": 0.604, "G": 0.733,
  "H": 0.774, "I": 0.35, "J": 0.586, "K": 0.708, "L": 0.598, "M": 0.877, "N": 0.764, "O": 0.786, "P": 0.687, "Q": 0.786,
  "R": 0.708, "S": 0.639, "T": 0.64, "U": 0.763, "V": 0.643, "W": 0.935, "X": 0.657, "Y": 0.608, "Z": 0.619, "[": 0.4,
  "\\": 0.385, "]": 0.4, "^": 0.609, "_": 0.572, "`": 0.637, "a": 0.606, "b": 0.658, "c": 0.537, "d": 0.658, "e": 0.596,
  "f": 0.398, "g": 0.616, "h": 0.658, "i": 0.321, "j": 0.323, "k": 0.634, "l": 0.332, "m": 0.985, "n": 0.658, "o": 0.637,
  "p": 0.658, "q": 0.658, "r": 0.464, "s": 0.51, "t": 0.445, "u": 0.654, "v": 0.607, "w": 0.897, "x": 0.598, "y": 0.604,
  "z": 0.532, "{": 0.4, "|": 0.311, "}": 0.4, "~": 0.609,
  "‑": 0.383, // 折れないハイフン (titleText が英数字の間の - を置き換える)
};
// 表に無い字: アクセント付きの欧文 (é 等) は広めの 0.7、記号 (™ ☆ 等。字体に無く別の字体で描かれることがある) と和文・全角は 1
const LATIN_EXTRA = 0.7;

export function charWidth(ch) {
  if (ASCII_WIDTH[ch] !== undefined) return ASCII_WIDTH[ch];
  const code = ch.codePointAt(0);
  return code >= 0x00c0 && code <= 0x024f && code !== 0x00d7 && code !== 0x00f7 ? LATIN_EXTRA : 1;
}
export const textWidth = (text) => [...String(text)].reduce((w, ch) => w + charWidth(ch), 0);

// この字の前では切らない (小さい仮名・長音・繰り返し・閉じ括弧・句読点・感嘆符など)
// 全角の空白 (U+3000) の前でも切らない (Unicode の行分割の決まりで BA = 後ろだけで切る)
const NO_BREAK_BEFORE = new Set([..."ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿーゝゞヽヾ々〻゛゜" +
  "、。，．・：；！？‼⁇⁈⁉…‥〜～）」』】〕〉》］｝〙〗〟’”!),.:;?]}\u3000"]);
// この字の後では切らない (開き括弧)
const NO_BREAK_AFTER = new Set([..."（「『【〔〈《［｛〘〖〝‘“([{"]);
const isSpace = (ch) => ch === " " || ch === "\t" || ch === "\n";
const isWide = (ch) => ch.codePointAt(0) >= 0x2e80;

// Satori 0.25 (satori/src/utils.ts splitByBreakOpportunities) と同じく、keep-all の時は Intl.Segmenter の語の切れ目で切る
// (空白で区切った語の中でも「神龍 / の謎」「ドラゴン / ボール」で切れる)。空白は前の塊の後ろに付ける
let wordSegmenter;
function wordPieces(text) {
  wordSegmenter ??= new Intl.Segmenter(undefined, { granularity: "word" });
  const out = [];
  for (const { segment } of wordSegmenter.segment(text)) {
    if (out.length && /^ +$/.test(segment)) out[out.length - 1] += segment;
    else out.push(segment);
  }
  return out;
}

// 切ってよい所で分けた塊: { text, width (空白を除く), space (後ろの空白の幅) }
export function segments(text, { keepAll = false } = {}) {
  // 半角の空白だけをまとめる (JavaScript の \s は全角の空白も含むが、Satori は全角の空白を 1 字として描く)
  const clean = String(text).replace(/[ \t\n\r]+/g, " ").replace(/^ | $/g, "");
  const out = keepAll ? wordPieces(clean) : [];
  if (!keepAll) {
    const chars = [...clean];
    let cur = "";
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (cur && !isSpace(ch) && canBreak(chars[i - 1], ch)) {
        out.push(cur);
        cur = "";
      }
      cur += ch;
    }
    if (cur) out.push(cur);
  }
  return out.map((seg) => {
    const body = seg.replace(/ +$/, "");
    return { text: seg, width: textWidth(body), space: textWidth(seg.slice(body.length)) };
  });
}

function canBreak(prev, ch) {
  if (isSpace(prev)) return true;
  if (NO_BREAK_AFTER.has(prev) || NO_BREAK_BEFORE.has(ch)) return false;
  if (isWide(prev) || isWide(ch)) return true;
  // 英数字のつながりの中: 「/」と「-」の後だけ (数字の前は除く)
  return (prev === "/" || prev === "-") && !/[0-9]/.test(ch);
}

// 字の大きさ size・枠の幅 width で折り返した各行の幅 (px)
export function wrapTitle(text, size, width, { keepAll = false } = {}) {
  const lines = [];
  let line = 0;
  let pendingSpace = 0;
  let started = false;
  for (const seg of segments(text, { keepAll })) {
    const w = seg.width * size;
    if (started && line + pendingSpace + w > width) {
      lines.push(line);
      line = w;
    } else {
      line += (started ? pendingSpace : 0) + w;
    }
    started = true;
    pendingSpace = seg.space * size;
  }
  if (started) lines.push(line);
  return lines;
}

// 空白で区切った題で、一番長い語が枠に入る時だけ語の途中で切らない (keep-all)。前の titleWordBreak と同じ考え方を実際の幅で
export function keepAllFor(text, size, width) {
  const parts = String(text).split(/\s+/).filter(Boolean);
  if (parts.length < 2) return false;
  return Math.max(...parts.map((part) => textWidth(part))) * size <= width;
}

export const MIN_LAST_LINE = 0.4;
// 字の幅の見積もりと本物の描画の差 (字体の切り出しの違い・記号の別の字体) で境目の 1 字が入れ替わらないよう、
// 枠を 1.5% 狭めても同じ行数・同じ良さになる大きさだけを選ぶ
export const FIT_MARGIN = 0.985;

const balanced = (lines, width) => lines.length > 0 && lines.every((w) => w <= width) &&
  (lines.length === 1 || lines.at(-1) >= MIN_LAST_LINE * Math.max(...lines));

/**
 * @param {string} text 描く題 (titleText を通した後の字)
 * @param {{ width: number, sizes: number[], maxLines: number, fallback: number }} options
 *   sizes は大きい順。fallback はどの大きさも当たらない時の字 (前の字数の決まり)。
 * @returns {{ size: number, keepAll: boolean, lines: number[], fitted: boolean }}
 */
export function fitTitle(text, { width, sizes, maxLines, fallback }) {
  const tries = sizes.map((size) => {
    const keepAll = keepAllFor(text, size, width);
    const lines = wrapTitle(text, size, width, { keepAll });
    const tight = wrapTitle(text, size, width * FIT_MARGIN, { keepAll });
    return { size, keepAll, lines, ok: balanced(lines, width) && balanced(tight, width) && tight.length === lines.length };
  });
  for (const limit of [...new Set([Math.min(2, maxLines), maxLines])]) {
    const hit = tries.find((t) => t.ok && t.lines.length <= limit);
    if (hit) return { size: hit.size, keepAll: hit.keepAll, lines: hit.lines, fitted: true };
  }
  const keepAll = keepAllFor(text, fallback, width);
  return { size: fallback, keepAll, lines: wrapTitle(text, fallback, width, { keepAll }), fitted: false };
}
