#!/usr/bin/env node
// TASK-20261028-005 (10/29): playnavi.app/privacy (このリポの privacy.html) が公式の
// https://www.playnavilab.com/privacypolicy と同じ文かを確かめる。
//
// 経緯: 10/9 (TASK-20260930-006) に OpenAI の提出の点検が公式のページを「開けない」と言い続けたので、
// 同じ文の写しを playnavi.app/privacy に置き、ChatGPT の提出物はこの住所を指している
// (playnavi-app docs/design/chatgpt-plugin/playnavi/plugin.json の privacyPolicyURL)。
// 10/25 に公式だけ改定され、写しが 10/9 版のまま残った。公式を直したら、この道具で差を見て写しも直す。
//
// 比べる範囲: 「最終更新日」の行から、写しの末尾の注記 (「このページは … と同じ内容です」) / 公式のフッターの前まで。
// 使い方: node scripts/check-privacy-copy.mjs   最後の行が PRIVACY_COPY_MATCH なら同じ、PRIVACY_COPY_DIFF なら違う (差の行を出す)
import { readFile } from "node:fs/promises";

const OFFICIAL_URL = "https://www.playnavilab.com/privacypolicy";

function toLines(html) {
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

function policyBody(lines, endMarkers) {
  const start = lines.findIndex((line) => line.startsWith("最終更新日"));
  if (start < 0) throw new Error("「最終更新日」の行が見つかりません");
  const rest = lines.slice(start);
  const end = rest.findIndex((line) => endMarkers.some((marker) => line.startsWith(marker)));
  return end < 0 ? rest : rest.slice(0, end);
}

const local = policyBody(toLines(await readFile(new URL("../privacy.html", import.meta.url), "utf8")), ["このページは "]);
const response = await fetch(OFFICIAL_URL, { headers: { "User-Agent": "Mozilla/5.0 (PlayNavi privacy copy check)" } });
if (!response.ok) {
  console.log(`STOP: 公式のページが ${response.status} を返しました (${OFFICIAL_URL})`);
  process.exit(2);
}
const official = policyBody(toLines(await response.text()), ["PlayNaviを通じて"]);

const onlyLocal = local.filter((line) => !official.includes(line));
const onlyOfficial = official.filter((line) => !local.includes(line));
for (const line of onlyOfficial) console.log(`公式だけ: ${line.slice(0, 160)}`);
for (const line of onlyLocal) console.log(`写しだけ: ${line.slice(0, 160)}`);
console.log(`lines local=${local.length} official=${official.length}`);
console.log(onlyLocal.length === 0 && onlyOfficial.length === 0 ? "PRIVACY_COPY_MATCH" : "PRIVACY_COPY_DIFF");
process.exit(onlyLocal.length === 0 && onlyOfficial.length === 0 ? 0 : 1);
