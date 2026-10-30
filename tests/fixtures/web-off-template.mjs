import { readFile } from "node:fs/promises";

// TASK-20260923-002 一般公開: 配備する link.html は新しい Web の住所 (pn-web-origin) と「Webで見る」を持ち、記録の住所は Web へ移る。
// 一般公開を戻した時 (印を外した時) に links が自分で出す記録の画面・アプリを開く画面は、この「切」の版で確かめる。
export function webOffHtml(html) {
  const off = html
    .replace(/\s*<meta name="pn-web-origin" content="[^"]*">/, "")
    .replace(/\s*<a id="web-btn" class="button secondary hidden" href="#">Webで見る<\/a>/, "");
  if (off.includes("pn-web-origin") || off.includes('id="web-btn"')) throw new Error("link.html の Web の印の形が変わった");
  return off;
}

export const readWebOffTemplate = async () => webOffHtml(await readFile(new URL("../../link.html", import.meta.url), "utf8"));
