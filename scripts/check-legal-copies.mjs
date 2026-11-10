#!/usr/bin/env node
// TASK-20261107-002 (11/9): links の規約の 3 つ (terms.html・privacy.html・legal.html) が、Squarespace の会社サイト
// (https://www.playnavilab.com/terms・/privacypolicy・/legal) と同じ文かを 1 行ずつ確かめる。
// 前身は scripts/check-privacy-copy.mjs (TASK-20261028-005、プライバシーポリシーだけ)。
//
// 使うのは Squarespace が動いている間 (= 古い住所の名前の管理を Vercel に切り替える前) だけ。
// 切り替えた後は www.playnavilab.com/… がこのリポの写しそのものを返すので、比べる意味が無くなる。
// Squarespace を解約したら links の 3 つのファイルが正本になり、この道具は消してよい (README「Company site」)。
//
// 比べる範囲: 見出し (h1 と公式の題の行。空白は無視) と、「最終更新日」の行から本文の終わりまで
// (写し = 末尾の注記「運営: …」の前 / 公式 = フッター「PlayNaviを通じて」の前)。順番も含めて 1 行ずつ比べる。
// 使い方: node scripts/check-legal-copies.mjs [terms|privacy|legal ...]
//   ページごとに TERMS_COPY_MATCH / PRIVACY_COPY_MATCH / LEGAL_COPY_MATCH (同じ) か *_COPY_DIFF (違う。差の行を出す)
//   全部同じなら終了コード 0、違いがあれば 1、公式のページを取れなければ 2
import { readFile } from "node:fs/promises";

const PAGES = {
  terms: { file: "terms.html", official: "https://www.playnavilab.com/terms" },
  privacy: { file: "privacy.html", official: "https://www.playnavilab.com/privacypolicy" },
  legal: { file: "legal.html", official: "https://www.playnavilab.com/legal" },
};

export function toLines(html) {
  const text = html
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h[1-6]>|<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/⁠/g, "");
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function pageParts(lines, endMarkers) {
  const start = lines.findIndex((line) => line.startsWith("最終更新日"));
  if (start < 1) throw new Error("「最終更新日」の行 (とその前の題) が見つかりません");
  const rest = lines.slice(start);
  const end = rest.findIndex((line) => endMarkers.some((marker) => line.startsWith(marker)));
  return { title: lines[start - 1].replace(/\s+/g, ""), body: end < 0 ? rest : rest.slice(0, end) };
}

export function compare(local, official) {
  const diffs = [];
  if (local.title !== official.title) diffs.push(`題: 写し「${local.title}」/ 公式「${official.title}」`);
  const n = Math.max(local.body.length, official.body.length);
  for (let i = 0; i < n; i += 1) {
    if (local.body[i] === official.body[i]) continue;
    diffs.push(`${i + 1} 行目: 写し「${(local.body[i] ?? "(無し)").slice(0, 120)}」/ 公式「${(official.body[i] ?? "(無し)").slice(0, 120)}」`);
    if (diffs.length >= 20) break;
  }
  return diffs;
}

async function main() {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PAGES);
  let failed = false;
  for (const name of names) {
    const page = PAGES[name];
    if (!page) throw new Error(`知らないページ: ${name} (terms / privacy / legal)`);
    const local = pageParts(toLines(await readFile(new URL(`../${page.file}`, import.meta.url), "utf8")), ["運営: "]);
    const response = await fetch(page.official, { headers: { "User-Agent": "Mozilla/5.0 (PlayNavi legal copy check)" } });
    if (!response.ok) {
      console.log(`STOP: 公式のページが ${response.status} を返しました (${page.official})`);
      process.exit(2);
    }
    const official = pageParts(toLines(await response.text()), ["PlayNaviを通じて"]);
    const diffs = compare(local, official);
    for (const diff of diffs) console.log(`  ${diff}`);
    const label = `${name.toUpperCase()}_COPY_${diffs.length === 0 ? "MATCH" : "DIFF"}`;
    console.log(`${label} lines local=${local.body.length} official=${official.body.length} (${page.file} vs ${page.official})`);
    failed ||= diffs.length > 0;
  }
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
