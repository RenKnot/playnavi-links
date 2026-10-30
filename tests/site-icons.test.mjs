// 全体検査: PlayNavi のサイトのアイコン (タブ・ホーム画面・iPhone の再生中の表示) は、コントローラーが真ん中にある (TASK-20261023-003)。
// 運営者 10/30「PlayNaviアイコンがずれて出ることがあるんだが、これはWEBのアイコン設定がずれてるから？」:
// icon.png (512) と favicon.ico (16・32・48) のコントローラーが下に寄っていた (縦の真ん中 0.61・0.59。上の点 13 個)。
// iPhone は動画を再生すると、頁のアイコンのどれか (icon.png か apple-icon) を再生中の表示に使うので「ずれる時がある」になった。
// 決まり: アプリのアイコン (playnavi-app assets/app/icon-ios.png) と同じ置き方 = 縦横とも真ん中から 4% 以内・端に付かない。
// Web 版 (playnavi-app web/src/app) と同じ絵・同じ決まり (web/src/lib/brand/siteIcons.test.mjs)。
// PNG は node の zlib で読む (画像の部品に頼らない)。
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

/** 8 ビットの PNG (色の型 2 = RGB・6 = RGBA、飛び越し無し) を RGBA の点の並びに */
export function decodePng(buffer) {
  assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  let offset = 8, width = 0, height = 0, colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      assert.equal(data[8], 8, "bit depth"); colorType = data[9]; assert.equal(data[12], 0, "interlace");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  assert.ok(channels, `color type ${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0, b = previous[i], c = i >= channels ? previous[i - channels] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const add = filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : filter === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0;
      line[i] = (line[i] + add) & 255;
    }
    for (let x = 0; x < width; x++) {
      for (let k = 0; k < 3; k++) out[(y * width + x) * 4 + k] = line[x * channels + k];
      out[(y * width + x) * 4 + 3] = channels === 4 ? line[x * channels + 3] : 255;
    }
    previous = line;
  }
  return { width, height, pixels: out };
}

/** ico の中の PNG を全部 */
export function icoFrames(buffer) {
  const count = buffer.readUInt16LE(4);
  return Array.from({ length: count }, (_, i) => {
    const size = buffer.readUInt32LE(6 + 16 * i + 8), offset = buffer.readUInt32LE(6 + 16 * i + 12);
    return decodePng(buffer.subarray(offset, offset + size));
  });
}

/**
 * 絵の外枠 (行・列の 1% 以上が絵の所) と縦横の真ん中 (0〜1)、外枠の外にある絵の点の数 (離れた点。上の黒い点など)。
 * 絵 = 透明でない点 (地が透明の時) か、地の色と違う点 (地が塗ってある時)
 */
export function artBox({ width, height, pixels }) {
  const bg = [...pixels.subarray(0, 4)];
  const isArt = (x, y) => {
    const i = (y * width + x) * 4;
    return bg[3] < 128 ? pixels[i + 3] > 64 : Math.abs(pixels[i] - bg[0]) + Math.abs(pixels[i + 1] - bg[1]) + Math.abs(pixels[i + 2] - bg[2]) > 60;
  };
  const need = Math.max(1, Math.floor(width / 100));
  const rows = [], cols = [];
  for (let y = 0; y < height; y++) { let n = 0; for (let x = 0; x < width; x++) if (isArt(x, y)) n++; if (n >= need) rows.push(y); }
  for (let x = 0; x < width; x++) { let n = 0; for (let y = 0; y < height; y++) if (isArt(x, y)) n++; if (n >= need) cols.push(x); }
  const top = Math.min(...rows), bottom = Math.max(...rows), left = Math.min(...cols), right = Math.max(...cols);
  let stray = 0;
  // 外枠のすぐ外 (2 点以内) は絵の縁 (細いアンテナの先のにじみ) として数えない
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (isArt(x, y) && (y < top - 2 || y > bottom + 2 || x < left - 2 || x > right + 2)) stray++;
  return { left, top, right: width - 1 - right, bottom: height - 1 - bottom, cx: (left + right + 1) / 2 / width, cy: (top + bottom + 1) / 2 / height, stray };
}

export function assertCentered(name, image) {
  const box = artBox(image);
  assert.ok(Math.abs(box.cx - 0.5) <= 0.04 && Math.abs(box.cy - 0.5) <= 0.04, `${name} ${image.width}: ${JSON.stringify(box)}`);
  assert.ok(box.top >= 1 && box.bottom >= 1 && box.left >= 1 && box.right >= 1, `${name} ${image.width} touches the edge: ${JSON.stringify(box)}`);
  assert.equal(box.stray, 0, `${name} ${image.width} has stray dots: ${JSON.stringify(box)}`);
}

const file = (name) => readFileSync(new URL(`../${name}`, import.meta.url));

test("サイトのアイコンはどれもコントローラーが真ん中 (icon.png・apple-touch-icon.png・favicon.ico の 16/32/48)", () => {
  assertCentered("icon.png", decodePng(file("icon.png")));
  assertCentered("apple-touch-icon.png", decodePng(file("apple-touch-icon.png")));
  const frames = icoFrames(file("favicon.ico"));
  assert.deepEqual(frames.map((frame) => frame.width).sort((a, b) => a - b), [16, 32, 48]);
  for (const frame of frames) assertCentered("favicon.ico", frame);
});
