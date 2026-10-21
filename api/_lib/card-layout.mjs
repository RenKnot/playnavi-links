// TASK-20261017-002 r10 → r11 (5 枚以上): リンクカードの中の写真・動画の並べ方 (og-card.mjs が使う)。
// 正本の試作 notes/r11-layout/cardLayout.mjs と同じ式・同じ定数。アプリ lib/share/linkCardLayout.ts も同じ答えを返し、
// どちらも tests/fixtures/card-layout-cases.json (347 通り。r10 の 133 通りは答えが同じ) で確かめる (式を変える時は 3 つと見本を一緒に変える)。
// 決まり (全体像 §14):
//   0. 受け取るのは 8 枚まで (MAX_ITEMS)。それより多い分は描かない (カードの「すべて見る」の先で見られる)
//   1. どの写真・動画も切らない (枠の縦横 = 写真の縦横)
//   2. 1 枚目は左上 (読む順の最初)。2 枚目以降は並べ替えてよい (5 枚までは全部の並べ替え、6 枚からは「元の順・横長が先・縦長が先」の 3 通り)
//   3. 並べ方の候補 = 「横に並べる / 縦に積む」を入れ子にした全部 (順番を保つギロチン分割。縦横は 1 段ごとに交互)
//   4. 2 枚以上の時、どの枠も短い辺が MIN_SIDE 以上。満たす並べ方が無ければ最後の 1 枚を外して (カードの「すべて見る」の先で見られる) やり直す
//   5. 写真の面積の合計が最大の物を選ぶ。差がカードの 0.5% 以内なら先に作った候補 (元の順番・浅い入れ子が先)
//   6. まとまりは箱の真ん中に置く
//   7. heroFirst (その記録の写真のあとに同じプレイの写真で埋める時): 1 枚目 (その記録の 1 枚目) がいちばん大きい (同じ大きさは可)
export const CARD = { w: 1200, h: 630 };
// 上下は 24: X の公式の枠は 2:1 (1200x600) で、1200x630 の絵は上下 15px ずつ切られうる (notes/r10-card-facts.md)。写真はその外に出す
export const BOX = { x: 12, y: 24, w: 1176, h: 582 };
export const GAP = 8;
export const MIN_SIDE = 160;
export const MAX_ITEMS = 8;
const FULL_PERMUTATION_MAX = 5;
const TIE = 0.005 * CARD.w * CARD.h;

const treeCache = new Map();
function treesOf(n) {
  if (!treeCache.has(n)) treeCache.set(n, trees(0, n, null));
  return treeCache.get(n);
}
function trees(lo, hi, orient) {
  if (hi - lo === 1) return [{ leaf: lo }];
  const out = [];
  for (const o of orient ? [orient] : ["row", "col"]) {
    const other = o === "row" ? "col" : "row";
    const walk = (start, groups) => {
      if (start === hi) {
        if (groups.length < 2) return;
        let acc = [[]];
        for (const [s, e] of groups) {
          const subs = e - s === 1 ? [{ leaf: s }] : trees(s, e, other);
          acc = acc.flatMap((prefix) => subs.map((t) => [...prefix, t]));
        }
        for (const children of acc) out.push({ o, children });
        return;
      }
      for (let end = start + 1; end <= hi; end += 1) walk(end, [...groups, [start, end]]);
    };
    walk(lo, []);
  }
  return out;
}
// 幅 = al × 高さ + be (横に並べる = 高さをそろえる、縦に積む = 幅をそろえる)。memo = この並び順の中で 1 回だけ計算する
function affine(t, a, g, memo) {
  if (t.leaf !== undefined) return { al: a[t.leaf], be: 0 };
  const hit = memo.get(t);
  if (hit) return hit;
  const cs = t.children.map((c) => affine(c, a, g, memo));
  const gaps = g * (cs.length - 1);
  let out;
  if (t.o === "row") out = { al: cs.reduce((s, c) => s + c.al, 0), be: cs.reduce((s, c) => s + c.be, 0) + gaps };
  else {
    const al = 1 / cs.reduce((s, c) => s + 1 / c.al, 0);
    out = { al, be: (cs.reduce((s, c) => s + c.be / c.al, 0) - gaps) * al };
  }
  memo.set(t, out);
  return out;
}
function place(t, a, g, x, y, h, out, memo) {
  if (t.leaf !== undefined) { out[t.leaf] = { x, y, w: a[t.leaf] * h, h }; return; }
  const f = affine(t, a, g, memo);
  const w = f.al * h + f.be;
  let cx = x, cy = y;
  for (const c of t.children) {
    const cf = affine(c, a, g, memo);
    if (t.o === "row") { place(c, a, g, cx, y, h, out, memo); cx += cf.al * h + cf.be + g; }
    else { const ch = (w - cf.be) / cf.al; place(c, a, g, x, cy, ch, out, memo); cy += ch + g; }
  }
}
function permutations(rest) {
  if (rest.length <= 1) return [rest];
  return rest.flatMap((c, i) => permutations([...rest.slice(0, i), ...rest.slice(i + 1)]).map((p) => [c, ...p]));
}
// 並べ替えの候補 (1 枚目は固定)。5 枚までは全部、6 枚からは 元の順 → 横長が先 → 縦長が先 (同じ縦横は元の順。重なる物は 1 つに)
function ordersOf(a) {
  const n = a.length;
  if (n === 1) return [[0]];
  const rest = a.map((_, i) => i).slice(1);
  if (n <= FULL_PERMUTATION_MAX) return permutations(rest).map((p) => [0, ...p]);
  const wideFirst = [...rest].sort((i, j) => a[j] - a[i] || i - j);
  const tallFirst = [...rest].sort((i, j) => a[i] - a[j] || i - j);
  const out = [];
  for (const r of [rest, wideFirst, tallFirst]) if (!out.some((o) => o.join() === [0, ...r].join())) out.push([0, ...r]);
  return out;
}
/** input = 幅 ÷ 高さ (表示する順)。返り値の slots は aspects と同じ並び (外した物は null)。座標はカードの中の px (小数) */
export function layoutCard(input, { box = BOX, gap = GAP, minSide = MIN_SIDE, heroFirst = false } = {}) {
  const aspects = input.slice(0, MAX_ITEMS);
  for (let n = aspects.length; n >= 1; n -= 1) {
    const a = aspects.slice(0, n);
    const orders = ordersOf(a);
    let best = null;
    for (const order of orders) {
      const aa = order.map((i) => a[i]);
      const memo = new Map();
      for (const t of treesOf(n)) {
        const f = affine(t, aa, gap, memo);
        const h = Math.min(box.h, (box.w - f.be) / f.al);
        if (!(h > 0)) continue;
        const s = [];
        place(t, aa, gap, 0, 0, h, s, memo);
        if (s.some((r) => !(r.w > 0 && r.h > 0))) continue;
        if (n > 1 && Math.min(...s.map((r) => Math.min(r.w, r.h))) < minSide) continue; // 1 枚だけの時は下限を見ない (とても横長の 1 枚も出す)
        // heroFirst: 1 枚目 (本人の投稿の写真) がいちばん大きい (同じプレイのほかの写真で埋める時)
        if (heroFirst && n > 1 && s.some((r, k) => k > 0 && r.w * r.h > s[0].w * s[0].h + 1)) continue;
        const area = s.reduce((sum, r) => sum + r.w * r.h, 0);
        if (!best || area > best.area + TIE) best = { order, s, area, W: f.al * h + f.be, H: h };
      }
    }
    if (best) {
      const ox = box.x + (box.w - best.W) / 2;
      const oy = box.y + (box.h - best.H) / 2;
      const slots = input.map(() => null);
      best.order.forEach((orig, k) => { const r = best.s[k]; slots[orig] = { x: ox + r.x, y: oy + r.y, w: r.w, h: r.h }; });
      return { shown: n, slots, area: best.area, group: { x: ox, y: oy, w: best.W, h: best.H } };
    }
  }
  return { shown: 0, slots: input.map(() => null), area: 0, group: null };
}
