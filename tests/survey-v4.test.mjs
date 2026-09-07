import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseSurveyRead,
  SurveyContractError,
  validateVoiceV4Answers,
  VOICE_V4_ANSWER_KEYS,
} from "../assets/survey-contract.mjs";
import { validAnswers, validSubmission } from "../api/surveys/[surveySlug]/responses.mjs";
import { surveyV4Payload } from "./fixtures/survey-v4-payload.mjs";

const SLUG = surveyV4Payload.survey.slug;

function blankAnswers(voice) {
  return {
    play_time_4w: "",
    primary_play_device_4w: "",
    reference_period_end_on: "2026-09-06",
    usage_30d: "",
    overall_satisfaction: "",
    unprompted_need: "",
    info_seek_days_4w: "",
    recording_preference: "",
    valuable_features: [],
    unused_feature: "",
    unused_reason: "",
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
  };
}

function currentAnswers(voice) {
  const values = blankAnswers(voice);
  Object.assign(values, {
    play_time_4w: "h3_lt7",
    primary_play_device_4w: "pc",
    usage_30d: "days_1_4",
    overall_satisfaction: "somewhat_satisfied",
    info_seek_days_4w: "days_5_14",
    recording_preference: "simple",
    valuable_features: ["play_log"],
    primary_problem: "library_input",
    problem_outcome: "completed",
    future_role: "record",
    future_candidates: ["pc_web", "library_ai"],
    future_priority: "pc_web",
    future_priority_mode: "explicit",
    future_detail_a: "bulk_edit_logs",
    future_detail_b: "both",
    improvement_vs_candidate: "candidate",
  });
  return values;
}

test("parses only the exact segmented schema-v4 definition without changing v3", () => {
  const survey = parseSurveyRead(surveyV4Payload, SLUG);
  assert.equal(survey.schemaVersion, 4);
  assert.equal(survey.voice.kind, "playnavi_voice_2026_reviewed_segments");
  assert.equal(survey.voice.referencePeriodDays, 28);
  assert.equal(survey.voice.referencePeriodTimezone, "Asia/Tokyo");
  assert.equal(survey.voice.referencePeriodEndOffsetDays, 1);
  assert.deepEqual(survey.voice.playTimeOptions.map(({ id }) => id), [
    "none", "lt_1h", "h1_lt3", "h3_lt7", "h7_lt14", "h14_plus", "unknown", "prefer_not",
  ]);
  assert.deepEqual(survey.voice.primaryDeviceOptions.map(({ id }) => id), [
    "nintendo", "playstation", "xbox", "pc", "mobile", "other", "tie", "unknown", "prefer_not",
  ]);
  assert.deepEqual(survey.voice.recordingPreferenceOptions.map(({ id }) => id), [
    "none", "simple", "detailed", "depends", "unknown", "prefer_not",
  ]);
  assert.match(survey.voice.futureOptions.find(({ id }) => id === "pc_web").description, /アプリとは異なるPC向けUI/);

  const typo = structuredClone(surveyV4Payload);
  typo.survey.questions.play_time_options[0].id = "none_typo";
  assert.throws(() => parseSurveyRead(typo, SLUG), SurveyContractError);
  const extra = structuredClone(surveyV4Payload);
  extra.survey.questions.unexpected = true;
  assert.throws(() => parseSurveyRead(extra, SLUG), SurveyContractError);
});

test("rejects reordered v4 segment options", () => {
  const swappedPlayTime = structuredClone(surveyV4Payload);
  [
    swappedPlayTime.survey.questions.play_time_options[0],
    swappedPlayTime.survey.questions.play_time_options[1],
  ] = [
    swappedPlayTime.survey.questions.play_time_options[1],
    swappedPlayTime.survey.questions.play_time_options[0],
  ];
  assert.throws(() => parseSurveyRead(swappedPlayTime, SLUG), SurveyContractError);

  const swappedInfoSeek = structuredClone(surveyV4Payload);
  [
    swappedInfoSeek.survey.questions.info_seek_options[1],
    swappedInfoSeek.survey.questions.info_seek_options[2],
  ] = [
    swappedInfoSeek.survey.questions.info_seek_options[2],
    swappedInfoSeek.survey.questions.info_seek_options[1],
  ];
  assert.throws(() => parseSurveyRead(swappedInfoSeek, SLUG), SurveyContractError);
});

test("validates the exact 27-key current-user route and unchanged Q1-Q12 contract", () => {
  const voice = parseSurveyRead(surveyV4Payload, SLUG).voice;
  const result = validateVoiceV4Answers(voice, currentAnswers(voice));
  assert.deepEqual(result.missing, []);
  assert.equal(result.structurallyInvalid, false);
  assert.deepEqual(Object.keys(result.answers), VOICE_V4_ANSWER_KEYS);
  assert.equal(result.answers.future_priority, "pc_web");
  assert.equal(result.answers.future_detail_a, "bulk_edit_logs");

  const token = "A".repeat(43);
  assert.equal(validAnswers(result.answers), true);
  assert.equal(validSubmission({ answers: result.answers, submission_token: token }), true);
  assert.equal(validAnswers({ ...result.answers, unexpected: "x" }), false);
});

test("requires S2 only after a positive S1 band and distinguishes hidden, unknown, and declined", () => {
  const voice = parseSurveyRead(surveyV4Payload, SLUG).voice;
  for (const playTime of ["none", "unknown", "prefer_not"]) {
    const values = blankAnswers(voice);
    Object.assign(values, {
      play_time_4w: playTime,
      info_seek_days_4w: "prefer_not",
      recording_preference: "prefer_not",
      usage_30d: "never_used",
      future_role: "unknown",
      future_candidates: ["none"],
    });
    const result = validateVoiceV4Answers(voice, values);
    assert.deepEqual(result.missing, [], playTime);
    assert.equal(result.structurallyInvalid, false, playTime);
    assert.equal(result.answers.primary_play_device_4w, "");
  }

  const positive = blankAnswers(voice);
  Object.assign(positive, {
    info_seek_days_4w: "days_0",
    recording_preference: "none",
    usage_30d: "never_used",
    future_role: "none",
    future_candidates: ["unknown"],
  });
  for (const playTime of ["lt_1h", "h1_lt3", "h3_lt7", "h7_lt14", "h14_plus"]) {
    positive.play_time_4w = playTime;
    positive.primary_play_device_4w = "";
    assert.ok(validateVoiceV4Answers(voice, positive).missing.includes("primary_play_device_4w"), playTime);
    positive.primary_play_device_4w = "tie";
    assert.deepEqual(validateVoiceV4Answers(voice, positive).missing, [], playTime);
  }

  positive.play_time_4w = "none";
  assert.equal(validateVoiceV4Answers(voice, positive).structurallyInvalid, true, "a hidden S2 answer is stale");
});

test("rejects invalid period dates and missing S3/S4 values", () => {
  const voice = parseSurveyRead(surveyV4Payload, SLUG).voice;
  const values = currentAnswers(voice);
  values.reference_period_end_on = "2026-02-30";
  assert.equal(validateVoiceV4Answers(voice, values).structurallyInvalid, true);
  values.reference_period_end_on = "2026-09-06";
  values.info_seek_days_4w = "";
  values.recording_preference = "";
  assert.deepEqual(validateVoiceV4Answers(voice, values).missing, ["info_seek_days_4w", "recording_preference"]);
});

test("v4 wizard keeps the reviewed privacy, draft, and ordering boundaries", async () => {
  const source = await readFile(new URL("../assets/survey-app.mjs", import.meta.url), "utf8");
  assert.match(source, /function buildVoiceV4Pages/);
  assert.match(source, /function pruneVoiceV4/);
  assert.match(source, /referencePeriodEndInJst/);
  assert.match(source, /回答データにUIDを保存せず、UIDは称号付与だけに使い/);
  assert.match(source, /schemaVersion === 4/);
  assert.match(source, /"lt_1h", "h1_lt3", "h3_lt7", "h7_lt14", "h14_plus"/);
});
