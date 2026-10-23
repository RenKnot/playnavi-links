import assert from "node:assert/strict";
import test from "node:test";

import {
  CANONICAL_ORIGIN,
  AI_RETURN_ORIGIN,
  ResolveError,
  aiReturnTargetFromPath,
  canonicalTargetFromPath,
  isValidShortCode,
  resolveShortLink,
  shortCodeFromPath,
} from "../assets/link-routing.mjs";

const UUID_A = "12345678-1234-4234-8234-123456789012";
const UUID_B = "abcdefab-cdef-4def-8def-abcdefabcdef";
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const NON_VERSIONED_UUID = "abcdefab-cdef-0def-fdef-abcdefabcdef";
const CODE = "AbCdEf012345_-xy";

test("accepts only an exact 16-character short code", () => {
  assert.equal(CODE.length, 16);
  assert.equal(isValidShortCode(CODE), true);
  assert.equal(shortCodeFromPath(`/s/${CODE}`), CODE);
  assert.equal(shortCodeFromPath(`/s/${CODE}/extra`), null);
  assert.equal(isValidShortCode("too-short"), false);
  assert.equal(isValidShortCode("123456789012345!"), false);
});

test("AI return link keeps only the exact reviewed query contract", () => {
  const path = "/a?act=wishlist&g=42&src=chatgpt&i=reviews_no_spoiler&at=1790645000000";
  assert.deepEqual(aiReturnTargetFromPath(path), {
    canonicalPath: path,
    canonicalUrl: `${AI_RETURN_ORIGIN}${path}`,
    schemeUrl: `playnavi:/${path}`,
  });
  assert.equal(
    aiReturnTargetFromPath("/a?at=1790645000000&i=stuck&src=claude&g=42&act=log")?.canonicalPath,
    "/a?act=log&g=42&src=claude&i=stuck&at=1790645000000",
  );
});

test("AI return link for a moment keeps session and text as data only", () => {
  const text = encodeURIComponent("やっと倒せた & 次は港町");
  const target = aiReturnTargetFromPath(`/a?t=${text}&s=0123ABCD&at=1790645000000&src=chatgpt&g=42&act=moment`);
  assert.equal(target?.canonicalPath,
    `/a?act=moment&g=42&src=chatgpt&at=1790645000000&s=0123ABCD&t=${new URLSearchParams({ t: "やっと倒せた & 次は港町" }).toString().slice(2)}`);
  assert.equal(new URL(target.canonicalUrl).searchParams.get("t"), "やっと倒せた & 次は港町");
  assert.equal(aiReturnTargetFromPath("/a?act=moment&g=42&src=claude&at=1790645000000")?.canonicalPath,
    "/a?act=moment&g=42&src=claude&at=1790645000000");
});

test("AI return link rejects unsupported actions and query injection", () => {
  for (const path of [
    "/a", "/a/", "/a/extra?act=log&g=42&src=chatgpt&i=stuck&at=1790645000000",
    "/a?act=share&g=42&src=chatgpt&i=stuck&at=1790645000000",
    "/a?act=log&g=42&src=chatgpt&at=1790645000000",
    "/a?act=log&g=42&src=chatgpt&i=stuck&at=1790645000000&s=0123ABCD",
    "/a?act=moment&g=42&src=chatgpt&at=1790645000000&s=bad",
    "/a?act=moment&g=42&src=chatgpt&at=1790645000000&t=a&t=b",
    "/a?act=moment&g=42&src=chatgpt&at=1790645000000&next=https://evil.example",
    `/a?act=moment&g=42&src=chatgpt&at=1790645000000&t=${"x".repeat(2001)}`,
    "/a?act=log&g=42&src=chatgpt&i=stuck&at=1790645000000&next=https://evil.example",
    "/a?act=log&act=wishlist&g=42&src=chatgpt&i=stuck&at=1790645000000",
    "/a?act=log&g=0&src=chatgpt&i=stuck&at=1790645000000",
    "/a?act=log&g=9007199254740992&src=chatgpt&i=stuck&at=1790645000000",
    "/a?act=log&g=42&src=evil&i=stuck&at=1790645000000",
    "/a?act=log&g=42&src=chatgpt&i=wrong&at=1790645000000",
    "/a?act=log&g=42&src=chatgpt&i=stuck&at=nope",
    "/a?act=log&g=42&src=chatgpt&i=stuck&at=1790645000000#fragment",
    "//evil.example/a?act=log&g=42&src=chatgpt&i=stuck&at=1790645000000",
  ]) assert.equal(aiReturnTargetFromPath(path), null, path);
});

test("allowlists the nine canonical target shapes", () => {
  const cases = [
    [`/users/${UUID_A}/best-games`, "best_games"],
    [`/users/${UUID_A}/diagnosis`, "diagnosis"],
    ["/game/42", "game"],
    [`/game/42?logId=${UUID_A}`, "log"],
    [`/game/42?logId=${UUID_A}&moment=${UUID_B}`, "moment"],
    [`/users/${UUID_A}`, "user"],
    [`/users/${UUID_A}/custom-rankings/${UUID_B}`, "ranking"],
    [`/users/${UUID_A}/tier-lists/${UUID_B}`, "tier_list"],
    [`/users/${UUID_A}/tier-lists/${UUID_B}?remix=1`, "tier_list"],
    [`/catalogs/${UUID_B}`, "catalog"],
  ];

  for (const [path, type] of cases) {
    assert.deepEqual(canonicalTargetFromPath(path), {
      type,
      canonicalPath: path,
      canonicalUrl: `${CANONICAL_ORIGIN}${path}`,
      schemeUrl: `playnavi:/${path}`,
    });
  }
});

test("accepts every PostgreSQL UUID shape without version or variant restrictions", () => {
  assert.equal(canonicalTargetFromPath(`/users/${NIL_UUID}`)?.type, "user");
  assert.equal(
    canonicalTargetFromPath(`/catalogs/${NON_VERSIONED_UUID}`)?.type,
    "catalog",
  );
});

test("rejects arbitrary URLs, schemes, queries, fragments, and short paths", () => {
  for (const value of [
    "https://evil.example/game/42",
    "//evil.example/game/42",
    "javascript:alert(1)",
    `/game/42?logId=${UUID_A}&next=https://evil.example`,
    "/game/42#fragment",
    "/game/9223372036854775808",
    "/game/12345678901234567890",
    `/users/${UUID_A}?x=1`,
    `/users/${UUID_A}/best-games/`,
    `/users/${UUID_A}/best-games?x=1`,
    `/users/${UUID_A}/diagnosis/extra`,
    `/users/${UUID_A}/Diagnosis`,
    `/users/not-a-uuid/best-games`,
    `/users/${UUID_A}/bestgames`,
    `/users/${UUID_A}/tier-lists/${UUID_B}?remix=2`,
    `/users/${UUID_A}/tier-lists/${UUID_B}?remix=1&next=https://evil.example`,
    `/users/${UUID_A}/tier-lists/${UUID_B}?share=1`,
    `/users/${UUID_A}/tier-lists/${UUID_B}#remix`,
    // moment (TASK-20261017-002): only ?logId=&moment= in this order, two uuids, nothing else.
    `/game/42?moment=${UUID_B}&logId=${UUID_A}`,
    `/game/42?moment=${UUID_B}`,
    `/game/42?logId=${UUID_A}&moment=not-a-uuid`,
    `/game/42?logId=${UUID_A}&moment=${UUID_B}&next=https://evil.example`,
    `/game/42?logId=${UUID_A}&moment=${UUID_B}#x`,
    `/game/42?logId=${UUID_A}&moment=${UUID_B}&moment=${UUID_B}`,
    `/game/9223372036854775808?logId=${UUID_A}&moment=${UUID_B}`,
    `/s/${CODE}`,
  ]) {
    assert.equal(canonicalTargetFromPath(value), null, value);
  }
});

test("resolver consumes canonical_path and never trusts an absolute URL", async () => {
  const target = await resolveShortLink(CODE, {
    fetchImpl: async (url, options) => {
      assert.equal(url, `/api/share-links/${CODE}`);
      assert.equal(options.method, "GET");
      assert.equal(options.cache, "no-store");
      assert.equal(options.credentials, "omit");
      return new Response(JSON.stringify({
        status: "ok",
        code: CODE,
        target_type: "game",
        canonical_path: "/game/42",
        canonical_url: "https://evil.example/game/42",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  assert.equal(target.canonicalUrl, `${CANONICAL_ORIGIN}/game/42`);

  await assert.rejects(
    resolveShortLink(CODE, {
      fetchImpl: async () =>
        new Response(JSON.stringify({
          status: "ok",
          code: CODE,
          target_type: "game",
          canonical_path: "https://evil.example/game/42",
        }), {
          status: 200,
        }),
    }),
    (error) => error instanceof ResolveError && error.kind === "temporary",
  );
});

test("resolver fails closed on status, code, or target_type mismatches", async () => {
  for (const body of [
    { status: "not_found", code: CODE, target_type: "game", canonical_path: "/game/42" },
    { status: "ok", code: "OtherCode1234_-x", target_type: "game", canonical_path: "/game/42" },
    { status: "ok", code: CODE, target_type: "user", canonical_path: "/game/42" },
  ]) {
    await assert.rejects(
      resolveShortLink(CODE, {
        fetchImpl: async () => new Response(JSON.stringify(body), { status: 200 }),
      }),
      (error) => error.kind === "temporary",
    );
  }
});

test("maps unavailable and retryable resolver failures separately", async () => {
  await assert.rejects(
    resolveShortLink(CODE, { fetchImpl: async () => new Response(null, { status: 404 }) }),
    (error) => error.kind === "unavailable" && error.status === 404,
  );
  for (const status of [400, 401, 403, 429, 500, 503]) {
    await assert.rejects(
      resolveShortLink(CODE, { fetchImpl: async () => new Response(null, { status }) }),
      (error) => error.kind === "temporary" && error.status === status,
    );
  }
  await assert.rejects(
    resolveShortLink(CODE, {
      fetchImpl: async () => {
        throw new Error("offline");
      },
    }),
    (error) => error.kind === "temporary",
  );
});

// TASK-20261020-004: the app's current return links (playnavi-app lib/aiLaunch.ts) must open the
// browser fallback too. act=inbox is TASK-20260930-006 (links #35) and is not covered here.
test("AI return link accepts act=game with the exact five-key contract", () => {
  const path = "/a?act=game&g=42&src=chatgpt&i=stuck&at=1790645000000";
  assert.deepEqual(aiReturnTargetFromPath(path), {
    canonicalPath: path,
    canonicalUrl: `${AI_RETURN_ORIGIN}${path}`,
    schemeUrl: `playnavi:/${path}`,
  });
  for (const bad of [
    "/a?act=game&g=42&src=chatgpt&at=1790645000000",
    "/a?act=game&g=42&src=chatgpt&i=stuck&at=1790645000000&t=x",
    "/a?act=game&g=42&src=chatgpt&i=stuck&at=1790645000000&s=0123ABCD&f=1",
  ]) assert.equal(aiReturnTargetFromPath(bad), null, bad);
});

test("AI return link for a review keeps only the comment text as data", () => {
  const comment = "良かった点: 戦闘 & 音楽。気になった点: 序盤が長い";
  const target = aiReturnTargetFromPath(`/a?t=${encodeURIComponent(comment)}&at=1790645000000&src=claude&g=42&act=review`);
  assert.equal(target?.canonicalPath,
    `/a?act=review&g=42&src=claude&at=1790645000000&${new URLSearchParams({ t: comment })}`);
  assert.equal(new URL(target.canonicalUrl).searchParams.get("t"), comment);
  assert.equal(target.schemeUrl, `playnavi:/${target.canonicalPath}`);
  // The AI may return the link as handed out (empty t) or drop t; the app then opens an empty comment.
  assert.equal(aiReturnTargetFromPath("/a?act=review&g=42&src=chatgpt&at=1790645000000&t=")?.canonicalPath,
    "/a?act=review&g=42&src=chatgpt&at=1790645000000&t=");
  assert.equal(aiReturnTargetFromPath("/a?act=review&g=42&src=chatgpt&at=1790645000000")?.canonicalPath,
    "/a?act=review&g=42&src=chatgpt&at=1790645000000");
  // Up to twice the app's 2,000-character cut is let through; the app trims it.
  assert.ok(aiReturnTargetFromPath(`/a?act=review&g=42&src=chatgpt&at=1790645000000&t=${"🎮".repeat(4000)}`));
});

test("AI return link for a review rejects missing, extra, repeated and malformed keys", () => {
  for (const path of [
    "/a?act=review&src=chatgpt&at=1790645000000&t=x",
    "/a?act=review&g=42&at=1790645000000&t=x",
    "/a?act=review&g=42&src=chatgpt&t=x",
    "/a?act=review&g=42&src=chatgpt&at=1790645000000&s=0123ABCD&t=x",
    "/a?act=review&g=42&src=chatgpt&at=1790645000000&s=0123ABCD&f=1&t=x",
    "/a?act=review&g=42&src=chatgpt&i=stuck&at=1790645000000&t=x",
    "/a?act=review&g=42&src=chatgpt&at=1790645000000&next=https://evil.example&t=x",
    "/a?act=review&g=42&src=chatgpt&at=1790645000000&t=a&t=b",
    "/a?act=review&act=moment&g=42&src=chatgpt&at=1790645000000&t=x",
    `/a?act=review&g=42&src=chatgpt&at=1790645000000&t=${"x".repeat(4001)}`,
    "/a?act=review&g=0&src=chatgpt&at=1790645000000&t=x",
    "/a?act=review&g=42&src=evil&at=1790645000000&t=x",
    "/a?act=review&g=42&src=chatgpt&at=179064500000&t=x",
    "/a?act=review&g=42&src=chatgpt&at=1790645000000&t=x#fragment",
    "/a?act=__proto__&g=42&src=chatgpt&at=1790645000000",
    "/a?act=constructor&g=42&src=chatgpt&i=stuck&at=1790645000000",
  ]) assert.equal(aiReturnTargetFromPath(path), null, path);
});

test("AI return link for a moment keeps f=1 (finish the play) only together with a session", () => {
  const text = "やっと倒せた";
  const target = aiReturnTargetFromPath(
    `/a?f=1&t=${encodeURIComponent(text)}&s=0123ABCD&at=1790645000000&src=perplexity&g=42&act=moment`);
  assert.equal(target?.canonicalPath,
    `/a?act=moment&g=42&src=perplexity&at=1790645000000&s=0123ABCD&f=1&${new URLSearchParams({ t: text })}`);
  assert.equal(new URL(target.canonicalUrl).searchParams.get("f"), "1");
  for (const path of [
    "/a?act=moment&g=42&src=chatgpt&at=1790645000000&f=1&t=x",
    "/a?act=moment&g=42&src=chatgpt&at=1790645000000&s=0123ABCD&f=2&t=x",
    "/a?act=moment&g=42&src=chatgpt&at=1790645000000&s=0123ABCD&f=&t=x",
    "/a?act=moment&g=42&src=chatgpt&at=1790645000000&s=0123ABCD&f=true&t=x",
    "/a?act=moment&g=42&src=chatgpt&at=1790645000000&s=0123ABCD&f=1&f=1&t=x",
    "/a?act=moment&g=42&src=chatgpt&at=1790645000000&s=bad&f=1&t=x",
    "/a?act=log&g=42&src=chatgpt&i=stuck&at=1790645000000&f=1",
    `/a?act=moment&g=42&src=chatgpt&at=1790645000000&s=0123ABCD&f=1&t=${"x".repeat(2001)}`,
  ]) assert.equal(aiReturnTargetFromPath(path), null, path);
});

test("contract: every return link the app builds today opens unchanged (playnavi-app lib/aiLaunch.ts)", () => {
  // Fixed samples copied from the app's own tests, then the AI's text appended to the trailing t=
  // the way the prompt asks (URL-encoded):
  //  - lib/__tests__/aiLaunch.test.ts:30          buildAiReturnUrl("game", …)        act=game (at= fixed here)
  //  - lib/__tests__/aiLaunch.test.ts:117         buildAiMomentReturnUrl(…, true)    act=moment … &s=…&f=1&t=
  //  - lib/__tests__/aiLaunch.test.ts:228         buildAiMomentReturnUrl(…, false)   act=moment … &s=…&t=
  //  - lib/__tests__/aiV4ScreenParams.test.ts:90  buildAiReviewReturnUrl(…)          act=review … &t=
  // log / wishlist and moment without s are what buildAiReturnUrl / buildAiMomentReturnUrl(null) return.
  const appLinks = [
    "https://playnavi.app/a?act=game&g=123&src=chatgpt&i=reviews_no_spoiler&at=1800000000000",
    "https://playnavi.app/a?act=log&g=42&src=claude&i=similar&at=1800000000000",
    "https://playnavi.app/a?act=wishlist&g=42&src=gemini&i=fit_for_me&at=1800000000000",
    "https://playnavi.app/a?act=moment&g=42&src=chatgpt&at=1800000000000&s=0123ABCD&f=1&t=",
    "https://playnavi.app/a?act=moment&g=42&src=chatgpt&at=1800000000000&s=0123ABCD&t=",
    "https://playnavi.app/a?act=moment&g=42&src=chatgpt&at=1800000000000&t=",
    "https://playnavi.app/a?act=review&g=42&src=chatgpt&at=1800000000000&t=",
  ];
  for (const link of appLinks) {
    for (const appended of ["", encodeURIComponent("今日は港町まで。ボスが強かった")]) {
      if (appended && !link.endsWith("&t=")) continue;
      const url = new URL(link + appended);
      const target = aiReturnTargetFromPath(`${url.pathname}${url.search}`);
      assert.ok(target, link + appended);
      assert.equal(target.canonicalUrl, link + appended);
    }
  }
});
