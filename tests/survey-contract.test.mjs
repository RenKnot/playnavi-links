import assert from "node:assert/strict";
import test from "node:test";

import {
  SurveyContractError,
  parseSubmitResult,
  parseSurveyPreview,
  parseSurveyRead,
  validateAnswers,
} from "../assets/survey-contract.mjs";

const surveyPayload = {
  status: "ok",
  survey: {
    slug: "launch-2026",
    title: "PlayNaviアンケート",
    description: "ご意見をお聞かせください。",
    opens_at: "2026-08-31T00:00:00Z",
    closes_at: "2026-09-07T00:00:00Z",
    reward: { title_id: "title-id", name_ja: "調査協力者", rarity: "common", icon_url: null },
    questions: [
      { id: "q1", type: "single_choice", label: "1つ選択", required: true, options: ["A", "B"] },
      { id: "q2", type: "multiple_choice", label: "複数選択", required: false, options: ["C", "D"] },
      { id: "q3", type: "short_text", label: "自由入力", required: true, max_length: 50 },
    ],
  },
  response: null,
};

test("parses only the public title and optional guide", () => {
  assert.deepEqual(parseSurveyPreview({
    status: "ok",
    survey: {
      slug: "launch-2026",
      title: "ユーザーアンケート",
      description: "回答時間は約5分です。",
    },
  }, "launch-2026"), {
    title: "ユーザーアンケート",
    description: "回答時間は約5分です。",
  });
  assert.throws(() => parseSurveyPreview({
    status: "ok",
    survey: { slug: "launch-2026", title: "x", questions: [] },
  }, "launch-2026"), SurveyContractError);
});

test("parses the fixed survey-read contract", () => {
  const survey = parseSurveyRead(surveyPayload, "launch-2026");
  assert.equal(survey.status, "ok");
  assert.deepEqual(survey.questions[0].options, [
    { value: "A", label: "A" },
    { value: "B", label: "B" },
  ]);
  assert.equal(survey.questions[2].maxLength, 50);
});
test("marks a non-null response as already answered", () => {
  const parsed = parseSurveyRead({
    ...surveyPayload,
    response: { answers: { q1: "A", q3: "done" }, submitted_at: "2026-08-31T01:00:00Z" },
  }, "launch-2026");
  assert.equal(parsed.status, "already_answered");
  assert.equal(parsed.titleAwarded, false);
});

test("fails closed on slug, option, and question-type drift", () => {
  assert.throws(() => parseSurveyRead(surveyPayload, "another"), SurveyContractError);
  assert.throws(
    () => parseSurveyRead({
      ...surveyPayload,
      survey: { ...surveyPayload.survey, questions: [{ id: "q", type: "rating", label: "x" }] },
    }, "launch-2026"),
    SurveyContractError,
  );
  assert.throws(
    () => parseSurveyRead({
      ...surveyPayload,
      survey: {
        ...surveyPayload.survey,
        questions: [{ id: "q", type: "single_choice", label: "x", options: ["same", "same"] }],
      },
    }, "launch-2026"),
    SurveyContractError,
  );
});

test("builds the exact answer object and reports missing required questions", () => {
  const survey = parseSurveyRead(surveyPayload, "launch-2026");
  assert.deepEqual(validateAnswers(survey.questions, {
    q1: "A",
    q2: ["D", "bad", "D"],
    q3: "  feedback  ",
  }), {
    answers: { q1: "A", q2: ["D"], q3: "feedback" },
    missing: [],
  });
  assert.deepEqual(validateAnswers(survey.questions, {}), {
    answers: {},
    missing: ["q1", "q3"],
  });
});

test("parses submit status, idempotency, and reward", () => {
  assert.deepEqual(parseSubmitResult({
    status: "ok",
    submission: { submitted_at: "2026-08-31T01:00:00Z", already_submitted: false },
    reward: { title_id: "title-id", name_ja: "調査協力者", rarity: "common", icon_url: null, awarded: true },
  }), {
    status: "submitted",
    titleAwarded: true,
    titleName: "調査協力者",
  });
  assert.equal(parseSubmitResult({
    status: "ok",
    submission: { submitted_at: "2026-08-31T01:00:00Z", already_submitted: true },
    reward: null,
  }).status, "already_answered");
});

// TASK-20260930-006 B2: 記名式 (回答を PlayNavi のアカウントに結び付ける) と「確認しました」のチェック
const identifiedPayload = {
  status: "ok",
  survey: {
    slug: "identified-test",
    title: "テストアンケート",
    description: "記名式の試し",
    schema_version: 1,
    identity_mode: "identified",
    opens_at: "2026-10-31T00:00:00Z",
    closes_at: "2026-11-07T00:00:00Z",
    reward: null,
    questions: [
      { id: "agree_notice", type: "consent", required: true, label: "注意事項を読みました" },
      { id: "plan", type: "single_choice", required: true, label: "プラン", options: ["Plus", "Pro"] },
    ],
  },
  response: null,
};

test("記名式の読み取り: identity_mode は identified の時だけ記名式、無ければ匿名", () => {
  assert.equal(parseSurveyRead(identifiedPayload, "identified-test").identityMode, "identified");
  const anonymous = structuredClone(identifiedPayload);
  delete anonymous.survey.identity_mode;
  assert.equal(parseSurveyRead(anonymous, "identified-test").identityMode, "anonymous");
});

test("記名式の入口: 公開の情報の identity_mode は identified だけ受け、ほかの値は弾く", () => {
  const preview = { status: "ok", survey: { slug: "identified-test", title: "テストアンケート", description: "", identity_mode: "identified" } };
  assert.equal(parseSurveyPreview(preview, "identified-test").identityMode, "identified");
  assert.equal(parseSurveyPreview({ status: "ok", survey: { slug: "s", title: "t", description: "" } }, "s").identityMode, undefined);
  assert.throws(() => parseSurveyPreview({ status: "ok", survey: { slug: "s", title: "t", identity_mode: "anonymous" } }, "s"), SurveyContractError);
});

test("確認しました: true だけを送り、付けていなければ必須の抜け", () => {
  const { questions } = parseSurveyRead(identifiedPayload, "identified-test");
  assert.deepEqual(validateAnswers(questions, { agree_notice: true, plan: "Pro" }), { answers: { agree_notice: true, plan: "Pro" }, missing: [] });
  assert.deepEqual(validateAnswers(questions, { agree_notice: false, plan: "Pro" }).missing, ["agree_notice"]);
  assert.deepEqual(validateAnswers(questions, { agree_notice: "true", plan: "Pro" }).missing, ["agree_notice"]);
});
