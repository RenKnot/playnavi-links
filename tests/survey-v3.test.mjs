import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseSurveyRead,
  SurveyContractError,
  validateVoiceV3Answers,
  VOICE_V3_ANSWER_KEYS,
} from "../assets/survey-contract.mjs";
import { validAnswers, validSubmission } from "../api/surveys/[surveySlug]/responses.mjs";
import { surveyV3Payload } from "./fixtures/survey-v3-payload.mjs";

const SLUG = surveyV3Payload.survey.slug;

function blankAnswers(voice) {
  return {
    usage_30d: "",
    overall_satisfaction: "",
    unprompted_need: "",
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
  const candidates = voice.futureOptions.slice(0, 2);
  Object.assign(values, {
    usage_30d: "days_15_plus",
    overall_satisfaction: "somewhat_satisfied",
    unprompted_need: "短い非誘導コメント",
    valuable_features: [voice.features[0].id, voice.features[4].id],
    unused_feature: voice.features[1].id,
    unused_reason: "no_opportunity",
    primary_problem: "slow",
    problem_comment: "一覧を開いたとき",
    problem_outcome: "completed",
    future_role: "news",
    future_candidates: candidates.map(({ id }) => id),
    future_priority: candidates[1].id,
    future_priority_mode: "explicit",
    future_detail_a: voice.futureDetailOptions[candidates[1].id].aOptions[0].id,
    future_detail_b: voice.futureDetailOptions[candidates[1].id].bOptions[0].id,
    improvement_vs_candidate: "improvement",
  });
  return values;
}

test("parses only the exact reviewed schema-v3 definition", () => {
  const survey = parseSurveyRead(surveyV3Payload, SLUG);
  assert.equal(survey.schemaVersion, 3);
  assert.equal(survey.voice.kind, "playnavi_voice_2026_reviewed");
  assert.equal(survey.voice.categories.length, 7);
  assert.equal(survey.voice.features.length, 26);
  assert.equal(survey.voice.futureOptions.length, 12);
  assert.match(survey.voice.futureOptions.find(({ id }) => id === "pc_web").description, /アプリとは異なるPC向けUI/);
  assert.deepEqual(
    survey.voice.futureDetailOptions.pc_web.aOptions.slice(0, 5).map(({ id }) => id),
    ["bulk_edit_logs", "bulk_edit_wishlist", "long_text", "compare_research", "profile_posts"],
  );
  assert.throws(() => parseSurveyRead({
    ...surveyV3Payload,
    survey: {
      ...surveyV3Payload.survey,
      questions: { ...surveyV3Payload.survey.questions, unexpected: true },
    },
  }, SLUG), SurveyContractError);
});

test("validates the exact 22-key current-user route and display orders", () => {
  const voice = parseSurveyRead(surveyV3Payload, SLUG).voice;
  const result = validateVoiceV3Answers(voice, currentAnswers(voice));
  assert.deepEqual(result.missing, []);
  assert.equal(result.structurallyInvalid, false);
  assert.deepEqual(Object.keys(result.answers), VOICE_V3_ANSWER_KEYS);

  const missingOptionalKey = currentAnswers(voice);
  delete missingOptionalKey.future_other;
  assert.equal(validateVoiceV3Answers(voice, missingOptionalKey).structurallyInvalid, true);

  const badOrder = currentAnswers(voice);
  badOrder.future_display_order[0] = badOrder.future_display_order[1];
  assert.equal(validateVoiceV3Answers(voice, badOrder).structurallyInvalid, true);
});

test("keeps never-used, dormant, exclusive, inherited, and optional-detail branches distinct", () => {
  const voice = parseSurveyRead(surveyV3Payload, SLUG).voice;

  const never = blankAnswers(voice);
  Object.assign(never, {
    usage_30d: "never_used",
    future_role: "unknown",
    future_candidates: ["none"],
  });
  assert.deepEqual(validateVoiceV3Answers(voice, never), {
    answers: never,
    missing: [],
    structurallyInvalid: false,
  });

  const dormant = blankAnswers(voice);
  Object.assign(dormant, {
    usage_30d: "inactive_30d",
    overall_satisfaction: "neutral",
    valuable_features: ["none"],
    dormant_reason: "forgot",
    future_role: "record",
    future_candidates: [voice.futureOptions[0].id],
    future_priority: voice.futureOptions[0].id,
    future_priority_mode: "inherited",
  });
  const result = validateVoiceV3Answers(voice, dormant);
  assert.deepEqual(result.missing, []);
  assert.equal(result.structurallyInvalid, false);
  assert.equal(result.answers.problem_outcome, "");
  assert.equal(result.answers.improvement_vs_candidate, "");
});

test("rejects stale branch answers, ranked Q9 semantics, and non-exact POST bodies", () => {
  const voice = parseSurveyRead(surveyV3Payload, SLUG).voice;
  const stale = currentAnswers(voice);
  stale.future_candidates = ["none"];
  assert.equal(validateVoiceV3Answers(voice, stale).structurallyInvalid, true);

  const duplicate = currentAnswers(voice);
  duplicate.valuable_features = [voice.features[0].id, voice.features[0].id];
  assert.equal(validateVoiceV3Answers(voice, duplicate).structurallyInvalid, true);

  const answers = validateVoiceV3Answers(voice, currentAnswers(voice)).answers;
  const token = "A".repeat(43);
  assert.equal(validAnswers(answers), true);
  assert.equal(validSubmission({ answers, submission_token: token }), true);
  assert.equal(validSubmission({ answers }), false);
  assert.equal(validSubmission({ answers, submission_token: "short" }), false);
  assert.equal(validSubmission({ answers, submission_token: token, unexpected: true }), false);
  assert.equal(validAnswers({ ...answers, unexpected: "x" }), false);
  const missingAnswer = { ...answers };
  delete missingAnswer.future_detail_b;
  assert.equal(validAnswers(missingAnswer), false);
});

test("reviewed wizard preserves deliberate multi-select, branch pruning, privacy, and token contracts", async () => {
  const source = await readFile(new URL("../assets/survey-app.mjs", import.meta.url), "utf8");
  assert.match(source, /function buildVoiceV3Pages/);
  assert.match(source, /function pruneVoiceV3/);
  assert.match(source, /values\.improvement_vs_candidate = "";/);
  assert.match(source, /最大3つで、順位は付きません/);
  assert.match(source, /future_priority_mode = "explicit"/);
  assert.match(source, /回答データにUIDを保存せず、UIDは称号付与だけに使い/);
  assert.match(source, /\^\[A-Za-z0-9_-\]\{43\}\$/);
  assert.match(source, /JSON\.stringify\(\{ answers: result\.answers, submission_token: submissionToken \}\)/);
  assert.doesNotMatch(source.slice(source.indexOf("function v3MultiGroup"), source.indexOf("function v3ReviewRow")), /updateOrderedSelection/);
});
