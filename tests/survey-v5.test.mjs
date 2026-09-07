import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseSurveyPreview,
  parseSurveyRead,
  SurveyContractError,
  validateVoiceV5Answers,
  VOICE_V5_ANSWER_KEYS,
  VOICE_V5_ANSWER_NOTE_KEYS,
} from "../assets/survey-contract.mjs";
import { validAnswers, validSubmission } from "../api/surveys/[surveySlug]/responses.mjs";
import { surveyV5Payload } from "./fixtures/survey-v5-payload.mjs";

const SLUG = surveyV5Payload.survey.slug;

function blankAnswers(voice) {
  return {
    play_frequency_1m: "",
    primary_play_device_1m: "",
    reference_period_end_on: "2026-09-06",
    usage_1m: "",
    overall_satisfaction: "",
    unprompted_need: "",
    info_seek_days_1m: "",
    recording_preference: "",
    valuable_features: [],
    valuable_feature_reasons: {},
    unused_features: [],
    unused_feature_reason_by_feature: {},
    primary_problem: "",
    dormant_reason: "",
    problem_comment: "",
    problem_outcome: "",
    future_role: "",
    future_role_other: "",
    future_candidates: [],
    future_other: "",
    future_priority: "",
    future_priority_mode: "",
    future_detail_a: "",
    future_detail_b: "",
    future_detail_other: "",
    improvement_vs_candidate: "",
    feature_display_order: voice.features.map(({ id }) => id),
    future_display_order: voice.futureOptions.map(({ id }) => id),
    answer_notes: Object.fromEntries(VOICE_V5_ANSWER_NOTE_KEYS.map((key) => [key, ""])),
  };
}

function currentAnswers(voice) {
  return Object.assign(blankAnswers(voice), {
    play_frequency_1m: "days_3_4_per_week",
    primary_play_device_1m: "pc",
    usage_1m: "days_1_4",
    overall_satisfaction: "somewhat_satisfied",
    info_seek_days_1m: "days_5_14",
    recording_preference: "simple",
    valuable_features: ["play_log"],
    unused_features: ["avatar_cover"],
    unused_feature_reason_by_feature: { avatar_cover: "not_needed" },
    primary_problem: "library_input",
    problem_outcome: "completed",
    future_role: "record",
    future_candidates: ["pc_web", "library_ai"],
    future_priority: "pc_web",
    future_priority_mode: "explicit",
    future_detail_a: "bulk_edit_logs",
    future_detail_b: "pc",
    improvement_vs_candidate: "candidate",
  });
}

test("parses only the exact reviewed monthly schema-v5 definition", () => {
  const survey = parseSurveyRead(surveyV5Payload, SLUG);
  assert.equal(survey.schemaVersion, 5);
  assert.equal(survey.voice.kind, "playnavi_voice_2026_reviewed_monthly");
  assert.equal(survey.voice.referencePeriodDays, 30);
  assert.equal(survey.voice.valuableReasonMaxLength, 400);
  assert.equal(survey.voice.answerNoteMaxLength, 400);
  assert.equal(survey.voice.features.length, 26);
  assert.equal(survey.voice.futureOptions.length, 12);
  assert.deepEqual(survey.voice.futureRoleOptions.map(({ id }) => id), [
    "news", "recommend", "research", "record", "wishlist", "read_posts", "publish", "discuss",
    "other", "no_expectation", "current_is_fine", "unknown",
  ]);

  const typo = structuredClone(surveyV5Payload);
  typo.survey.questions.play_frequency_options[0].id = "never";
  assert.throws(() => parseSurveyRead(typo, SLUG), SurveyContractError);
  const extra = structuredClone(surveyV5Payload);
  extra.survey.questions.unexpected = true;
  assert.throws(() => parseSurveyRead(extra, SLUG), SurveyContractError);
});

test("preview accepts schema_version 5 for v5-only login copy and preserves old previews", () => {
  assert.equal(parseSurveyPreview({
    status: "ok",
    survey: { slug: SLUG, title: "題", description: "説明", schema_version: 5 },
  }, SLUG).schemaVersion, 5);
  assert.equal(parseSurveyPreview({
    status: "ok",
    survey: { slug: SLUG, title: "題", description: "説明" },
  }, SLUG).schemaVersion, undefined);
});

test("validates the exact 29-key v5 route", () => {
  const voice = parseSurveyRead(surveyV5Payload, SLUG).voice;
  const result = validateVoiceV5Answers(voice, currentAnswers(voice));
  assert.deepEqual(result.missing, []);
  assert.equal(result.structurallyInvalid, false);
  assert.deepEqual(Object.keys(result.answers), VOICE_V5_ANSWER_KEYS);
  assert.deepEqual(Object.keys(result.answers.answer_notes), VOICE_V5_ANSWER_NOTE_KEYS);
  assert.equal(result.answers.problem_comment, "");
  assert.equal(validAnswers(result.answers), true);
  assert.equal(validSubmission({ answers: result.answers, submission_token: "A".repeat(43) }), true);
  assert.equal(validAnswers({ ...result.answers, unexpected: "x" }), false);
});

test("valuable reasons are an optional sparse subset and reject stale or blank keys", () => {
  const voice = parseSurveyRead(surveyV5Payload, SLUG).voice;
  const withoutReason = currentAnswers(voice);
  assert.equal(validateVoiceV5Answers(voice, withoutReason).structurallyInvalid, false);

  const withReason = currentAnswers(voice);
  withReason.valuable_feature_reasons = { play_log: "振り返りに役立つ" };
  assert.deepEqual(validateVoiceV5Answers(voice, withReason).answers.valuable_feature_reasons, withReason.valuable_feature_reasons);

  const stale = currentAnswers(voice);
  stale.valuable_feature_reasons = { activity: "未選択の機能" };
  assert.equal(validateVoiceV5Answers(voice, stale).structurallyInvalid, true);
  const blank = currentAnswers(voice);
  blank.valuable_feature_reasons = { play_log: "   " };
  assert.equal(validateVoiceV5Answers(voice, blank).structurallyInvalid, true);
});

test("v5 map and note text use trimmed Unicode code points, not UTF-16 length", () => {
  const voice = parseSurveyRead(surveyV5Payload, SLUG).voice;
  const emoji201 = "😀".repeat(201);
  const accepted = currentAnswers(voice);
  accepted.valuable_feature_reasons = { play_log: `  ${emoji201}  ` };
  accepted.answer_notes.valuable_features = `\n${emoji201}\t`;
  const result = validateVoiceV5Answers(voice, accepted);
  assert.equal(result.structurallyInvalid, false);
  assert.equal(result.answers.valuable_feature_reasons.play_log, emoji201);
  assert.equal(result.answers.answer_notes.valuable_features, emoji201);

  const reason401 = currentAnswers(voice);
  reason401.valuable_feature_reasons = { play_log: ` ${"😀".repeat(401)} ` };
  assert.equal(validateVoiceV5Answers(voice, reason401).structurallyInvalid, true);

  const note401 = currentAnswers(voice);
  note401.answer_notes.valuable_features = ` ${"😀".repeat(401)} `;
  assert.equal(validateVoiceV5Answers(voice, note401).structurallyInvalid, true);
});

test("requires one unused reason per selected feature and keeps problem_comment empty", () => {
  const voice = parseSurveyRead(surveyV5Payload, SLUG).voice;
  const missingReason = currentAnswers(voice);
  missingReason.unused_feature_reason_by_feature = {};
  assert.deepEqual(validateVoiceV5Answers(voice, missingReason).missing, ["unused_reasons"]);

  const staleComment = currentAnswers(voice);
  staleComment.problem_comment = "旧P8コメント";
  assert.equal(validateVoiceV5Answers(voice, staleComment).structurallyInvalid, true);
});

test("keeps P5 and P6 unlimited for all 26 normal features", () => {
  const voice = parseSurveyRead(surveyV5Payload, SLUG).voice;
  const featureIds = voice.features.map(({ id }) => id);
  const values = currentAnswers(voice);
  values.valuable_features = featureIds.slice(0, 4);
  values.unused_features = featureIds.slice(0, 4);
  values.unused_feature_reason_by_feature = Object.fromEntries(values.unused_features.map((id) => [id, "not_needed"]));
  assert.equal(validateVoiceV5Answers(voice, values).structurallyInvalid, false, "four normal features remain valid");

  values.valuable_features = [...featureIds];
  values.unused_features = [...featureIds];
  values.unused_feature_reason_by_feature = Object.fromEntries(featureIds.map((id) => [id, "not_needed"]));
  const allFeatures = validateVoiceV5Answers(voice, values);
  assert.deepEqual(allFeatures.missing, []);
  assert.equal(allFeatures.structurallyInvalid, false, "all 26 normal features remain valid");
});

test("caps future candidates at three and keeps v5 copy scoped", async () => {
  const voice = parseSurveyRead(surveyV5Payload, SLUG).voice;
  const tooMany = currentAnswers(voice);
  tooMany.future_candidates = ["pc_web", "library_ai", "game_database", "news_curation"];
  assert.equal(validateVoiceV5Answers(voice, tooMany).structurallyInvalid, true);

  const app = await readFile(new URL("../assets/survey-app.mjs", import.meta.url), "utf8");
  const css = await readFile(new URL("../assets/site.css", import.meta.url), "utf8");
  const v5Copy = app.slice(app.indexOf("function buildVoiceV5Pages"), app.indexOf("function createVoiceV3Controller"));
  assert.match(app, /回答について補足する（任意）/);
  assert.match(app, /選んだ内容について、具体的に伝えたいことがあれば教えてください。（任意）/);
  assert.match(app, /この機能が役立っている理由や、今後も残してほしい点（任意）/);
  assert.match(app, /補足したいことがあれば入力してください。/);
  assert.match(app, /あまり使っていない機能はない/);
  assert.match(app, /報酬なしでログインせず回答する/);
  assert.match(css, /\.survey-schema-v5 > #survey-title/);
  assert.match(css, /\.schema-v5-step \.v5-question-heading/);
  assert.match(css, /\.schema-v5-step \.v5-question-controls[^}]*border: 0/);
  assert.doesNotMatch(v5Copy, /この4週間|直近30日|対象期間は|合計して4で割る|所有している機器/);
  assert.equal(surveyV5Payload.survey.title, "ユーザーアンケート 2026.09");
  assert.doesNotMatch(JSON.stringify(surveyV5Payload.survey.questions), /この4週間|直近30日/);
});
