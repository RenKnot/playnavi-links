// 規約の 3 ページの見出しの印 (playnavi-app TASK-20261113-005 G-04)。
// 番号つきの区分 (1.〜15.・6-1.・6-2.) は全部 <h2> (太字 + 上の区切り線)。本文の印 <p> で始まる番号の区分を残さない
// (「2. 取得する利用者情報」「4 共同利用…」「5. 利用目的」が本文と同じ字になっていた)。
// 6-2 の中の小見出し (1)〜(6) は区分と同じ <h2> にせず、1 段下の <h3> (区切り線なし)。
// 文字は 1 字も変えない (運営者の決め 11/14「規約の文字は変えない」= 「4 共同利用」の「.」も足さない)。文字の比べは scripts/check-legal-copies.mjs と同じ toLines。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { toLines } from "../scripts/check-legal-copies.mjs";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const strip = (html) => html.replace(/<[^>]+>/g, "").trim();
const tags = (html, tag) => [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => strip(m[1]));
/** 番号つきの区分の形 (「2. …」「4 …」「6-1. …」)。(1) の形の小見出しは入れない */
const SECTION = /^\d+(?:-\d+)?\.?\s+\S/;

test("privacy: 番号つきの区分は全部 h2 (1.〜15.・6-1.・6-2.)・本文の印で始まる区分は無い", async () => {
  const html = await read("privacy.html");
  const ja = html.split("<h2>6-2. Connecting AI services</h2>")[0];
  const sections = tags(ja, "h2").filter((t) => SECTION.test(t)).map((t) => t.match(/^\d+(?:-\d+)?/)[0]);
  assert.deepEqual(sections, ["1", "2", "3", "4", "5", "6-1", "6-2", "7", "8", "9", "10", "11", "12", "13", "14", "15"]);
  const paragraphSections = tags(html, "p").filter((t) => SECTION.test(t));
  assert.deepEqual(paragraphSections, []);
  // 見出しの文字は今のまま (「4」の後に「.」を足さない)
  assert.ok(tags(ja, "h2").includes("2. 取得する利用者情報"));
  assert.ok(tags(ja, "h2").includes("4 共同利用・第三者提供・委託・越境移転"));
  assert.ok(tags(ja, "h2").includes("5. 利用目的"));
});

test("privacy: 6-2 の小見出し (1)〜(6) は h3 (日本語・英語とも)・区分の h2 は (n) で始まらない", async () => {
  const html = await read("privacy.html");
  assert.deepEqual(tags(html, "h2").filter((t) => /^\(\d\)/.test(t)), []);
  const subs = tags(html, "h3").map((t) => t.match(/^\((\d)\)/)?.[1]);
  assert.deepEqual(subs, ["1", "2", "3", "4", "5", "6", "1", "2", "3", "4", "5", "6"]);
  // h3 は h2 より小さく、区切り線を付けない (見出しの段の順が見た目でも分かる)
  assert.match(html, /h3\{font-size:1rem;[^}]*\}/);
  assert.doesNotMatch(html.match(/h3\{[^}]*\}/)[0], /border/);
});

test("privacy: 本文の文字は見出しの印を直す前と同じ (toLines で比べる)", async () => {
  const html = await read("privacy.html");
  const lines = toLines(html);
  // 直す前は見出しと本文を <br> でつないでいた。同じ行に分かれていることと、文が 1 字も欠けていないことを見る
  for (const line of [
    "2. 取得する利用者情報",
    "当社は、利用者が本サービスを利用する際、以下の情報を提供いただくか、技術的手段により自動取得する場合があります。括弧内は典型例であり、必要最小限の範囲で取得します。",
    "4 共同利用・第三者提供・委託・越境移転",
    "5. 利用目的",
    "当社は、取得した情報を以下の目的で利用します。目的の範囲を超える利用は、法令上許容される場合を除き、事前に同意を得ます。",
  ]) assert.ok(lines.includes(line), line);
});

test("terms・legal: 番号つきの区分は全部 h2 (同じ印の決まり)", async () => {
  for (const file of ["terms.html", "legal.html"]) {
    const html = await read(file);
    assert.deepEqual(tags(html, "p").filter((t) => SECTION.test(t) || /^第\d+条/.test(t)), [], file);
  }
});
