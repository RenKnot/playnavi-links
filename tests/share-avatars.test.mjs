import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import { PNG } from "pngjs";

const families = [
  {
    path: "gamer_type",
    names: [
      "rank_conqueror", "strategic_explorer", "isekai_diver", "story_eater",
      "sun_of_the_guild", "party_captain", "god_crafter",
      "community_architect", "trophy_hunter", "seasonal_traveler",
      "series_explorer", "buzz_game_watcher", "light_gamer",
    ],
  },
  {
    path: "gamer_type_v2",
    names: [
      "cbid", "cbsd", "cbiw", "cbsw", "cfid", "cfsd", "cfiw", "cfsw",
      "ebid", "ebsd", "ebiw", "ebsw", "efid", "efsd", "efiw", "efsw",
    ],
  },
];
const root = new URL("../assets/share-avatars/", import.meta.url);

test("all 58 share-only avatars are opaque square PNGs at the published paths", async () => {
  let count = 0;
  for (const family of families) {
    const expected = family.names.flatMap((name) => [
      `${name}_m.png`, `${name}_f.png`,
    ]).sort();
    const folder = new URL(`${family.path}/`, root);
    assert.deepEqual((await readdir(folder)).sort(), expected);
    for (const name of expected) {
      const file = await readFile(new URL(name, folder));
      assert.ok(file.length < 1_000_000, `${family.path}/${name} is too large`);
      const image = PNG.sync.read(file);
      assert.equal(image.width, 512);
      assert.equal(image.height, 512);
      const corners = [0, 511, 511 * 512, 512 * 512 - 1];
      for (const pixel of corners) {
        assert.equal(image.data[pixel * 4 + 3], 255, `${family.path}/${name} has a transparent corner`);
      }
      count += 1;
    }
  }
  assert.equal(count, 58);
});
