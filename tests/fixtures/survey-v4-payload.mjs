import { surveyV3Payload } from "./survey-v3-payload.mjs";

const options = (entries) => entries.map(([id, label]) => ({ id, label }));

export const surveyV4Payload = structuredClone(surveyV3Payload);
Object.assign(surveyV4Payload.survey, {
  slug: "playnavi-voice-2026-stg-review-v2",
  schema_version: 4,
  description: "普段のゲームとの関わり方、PlayNaviで役立っていること・困っていること、これから期待することを教えてください。",
});
Object.assign(surveyV4Payload.survey.questions, {
  kind: "playnavi_voice_2026_reviewed_segments",
  play_time_options: options([
    ["none", "この4週間は遊んでいない"],
    ["lt_1h", "週1時間未満"],
    ["h1_lt3", "週1時間以上〜3時間未満"],
    ["h3_lt7", "週3時間以上〜7時間未満"],
    ["h7_lt14", "週7時間以上〜14時間未満"],
    ["h14_plus", "週14時間以上"],
    ["unknown", "分からない"],
    ["prefer_not", "答えたくない"],
  ]),
  primary_device_options: options([
    ["nintendo", "任天堂のゲーム機（Switchなど）"],
    ["playstation", "PlayStation"],
    ["xbox", "Xbox"],
    ["pc", "PC"],
    ["mobile", "スマートフォン・タブレット"],
    ["other", "その他"],
    ["tie", "複数を同じくらい使った"],
    ["unknown", "覚えていない"],
    ["prefer_not", "答えたくない"],
  ]),
  info_seek_options: options([
    ["days_0", "0日"],
    ["days_1_4", "1〜4日"],
    ["days_5_14", "5〜14日"],
    ["days_15_plus", "15日以上"],
    ["unknown", "覚えていない"],
    ["prefer_not", "答えたくない"],
  ]),
  recording_preference_options: options([
    ["none", "特に記録を残したいとは思わない"],
    ["simple", "遊んだタイトルやプレイ状況が簡単に残せればよい"],
    ["detailed", "感想・プレイ時間・実績なども詳しく残したい"],
    ["depends", "作品によって違う"],
    ["unknown", "判断できない"],
    ["prefer_not", "答えたくない"],
  ]),
  reference_period_days: 28,
  reference_period_timezone: "Asia/Tokyo",
  reference_period_end_offset_days: 1,
});
