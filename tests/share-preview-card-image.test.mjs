// TASK-20261023-003 (運営者 10/30「アップしてすぐシェアしたら、リンクカードが用意できてないのか謎のカードしか出なかった」の類件):
// 小さいカード (summary) の絵は X の下限 (144×144) 以上にする。logo.png (200×35) は X が灰色の仮のカードにするので使わない。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CARD_FALLBACK_IMAGE, GENERIC_CARD, validCard } from "../api/_lib/share-preview.mjs";
import { FALLBACK_URL } from "../api/og.mjs";

/** PNG の幅と高さ (IHDR) */
function pngSize(path) {
  const buffer = readFileSync(new URL(path, import.meta.url));
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test("代わりの絵は X の小さいカードの下限 (144×144) 以上で、/api/og の失敗時と同じ絵", () => {
  assert.equal(CARD_FALLBACK_IMAGE, FALLBACK_URL);
  const size = pngSize("../og-fallback.png");
  assert.ok(size.width >= 144 && size.height >= 144, JSON.stringify(size));
  // logo.png は下限より小さい (使わない理由)
  const logo = pngSize("../logo.png");
  assert.ok(logo.height < 144, JSON.stringify(logo));
});

test("取れなかった時のカードと、EF が返した logo.png は代わりの絵になる。普通の表紙はそのまま", () => {
  assert.equal(GENERIC_CARD.image_url, CARD_FALLBACK_IMAGE);
  const card = (image_url) => validCard({ status: "ok", card: { title: "題", description: "説明", image_url } });
  assert.equal(card("https://playnavi.app/logo.png").image_url, CARD_FALLBACK_IMAGE);
  assert.equal(card("https://images.igdb.com/igdb/image/upload/t_720p/abc.jpg").image_url, "https://images.igdb.com/igdb/image/upload/t_720p/abc.jpg");
});
