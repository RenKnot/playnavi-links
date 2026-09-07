const QUESTION_TYPES = new Set(["single_choice", "multiple_choice", "short_text"]);
const VOICE_KIND = "playnavi_voice_2026";
const VOICE_V3_KIND = "playnavi_voice_2026_reviewed";
const VOICE_V4_KIND = "playnavi_voice_2026_reviewed_segments";
const VOICE_V5_KIND = "playnavi_voice_2026_reviewed_monthly";
const VOICE_ANSWER_KEYS = [
  "usage_frequency",
  "overall_satisfaction",
  "feature_priorities",
  "feature_comments",
  "category_top",
  "feature_details",
  "future_interest",
  "future_top",
];
export const VOICE_V3_ANSWER_KEYS = [
  "usage_30d",
  "overall_satisfaction",
  "unprompted_need",
  "valuable_features",
  "unused_feature",
  "unused_reason",
  "primary_problem",
  "dormant_reason",
  "problem_comment",
  "problem_outcome",
  "future_role",
  "future_role_other",
  "future_candidates",
  "future_other",
  "future_priority",
  "future_priority_mode",
  "future_detail_a",
  "future_detail_b",
  "future_detail_other",
  "improvement_vs_candidate",
  "feature_display_order",
  "future_display_order",
];
export const VOICE_V4_ANSWER_KEYS = [
  "play_time_4w",
  "primary_play_device_4w",
  "reference_period_end_on",
  "usage_30d",
  "overall_satisfaction",
  "unprompted_need",
  "info_seek_days_4w",
  "recording_preference",
  "valuable_features",
  "unused_feature",
  "unused_reason",
  "primary_problem",
  "dormant_reason",
  "problem_comment",
  "problem_outcome",
  "future_role",
  "future_role_other",
  "future_candidates",
  "future_other",
  "future_priority",
  "future_priority_mode",
  "future_detail_a",
  "future_detail_b",
  "future_detail_other",
  "improvement_vs_candidate",
  "feature_display_order",
  "future_display_order",
];
export const VOICE_V5_ANSWER_KEYS = [
  "play_frequency_1m",
  "primary_play_device_1m",
  "reference_period_end_on",
  "usage_1m",
  "overall_satisfaction",
  "unprompted_need",
  "info_seek_days_1m",
  "recording_preference",
  "valuable_features",
  "valuable_feature_reasons",
  "unused_features",
  "unused_feature_reason_by_feature",
  "primary_problem",
  "dormant_reason",
  "problem_comment",
  "problem_outcome",
  "future_role",
  "future_role_other",
  "future_candidates",
  "future_other",
  "future_priority",
  "future_priority_mode",
  "future_detail_a",
  "future_detail_b",
  "future_detail_other",
  "improvement_vs_candidate",
  "feature_display_order",
  "future_display_order",
  "answer_notes",
];
const ID_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
const VOICE_V3_STABLE_IDS = {
  usage: ["days_15_plus", "days_5_14", "days_1_4", "inactive_30d", "never_used", "unknown"],
  overallSatisfaction: [
    "very_satisfied", "somewhat_satisfied", "neutral", "somewhat_dissatisfied", "very_dissatisfied", "unknown",
  ],
  categoryFeatures: {
    news_deals: ["game_news", "events", "subscriptions", "sales"],
    research: ["catalog_coverage", "game_summary", "game_videos"],
    discovery: ["for_you", "rankings", "featured_games", "upcoming_games"],
    library: ["play_log", "wishlist", "bulk_edit", "external_import"],
    social_creation: ["social", "catalog_creation", "custom_rankings"],
    reflection_share: ["my_best", "game_poster", "gamer_diagnosis", "profile_stats"],
    profile: ["profile_games", "profile_wishlist", "honor_titles", "avatar_cover"],
  },
  q4Exclusive: ["none", "unknown"],
  unusedReason: [
    "not_needed", "alternative", "no_opportunity", "dont_know_how", "hard_to_use", "newly_discovered", "other", "unknown",
  ],
  problem: [
    "slow", "errors", "navigation", "not_found", "bad_data", "library_input", "discovery", "social", "overloaded",
    "other", "none", "unknown",
  ],
  dormantReason: [
    "less_gaming", "finished", "alternative", "missing", "confusing", "quality", "forgot", "other", "none", "unknown",
  ],
  problemOutcome: ["completed", "alternative", "abandoned", "forgot"],
  futureRole: [
    "news", "recommend", "research", "record", "wishlist", "read_posts", "publish", "discuss", "other", "none", "unknown",
  ],
  future: [
    "news_curation", "game_database", "game_achievements", "playnavi_challenges", "discover_user_posts",
    "promote_own_posts", "creator_discovery", "creator_originals", "game_communities", "pc_web", "guide_ai", "library_ai",
  ],
  futureExclusive: ["none", "unknown"],
  futureDetails: {
    news_curation: {
      a: ["aggregate", "personalize", "digest", "reactions", "save", "other", "unknown"],
      b: ["media", "video", "social", "news_app", "playnavi", "none", "other", "unknown"],
    },
    game_database: {
      a: ["coverage", "aliases", "editions", "accuracy", "corrections", "other", "unknown"],
      b: ["multiple", "once", "none", "forgot", "other", "unknown"],
    },
    game_achievements: {
      a: ["earned", "remaining", "platforms", "profile", "other", "unknown"],
      b: ["manual_ok", "automatic_only", "other", "unknown"],
    },
    playnavi_challenges: {
      a: ["personal", "theme", "streak", "limited", "other", "unknown"],
      b: ["private", "share", "together", "compete", "other", "unknown"],
    },
    discover_user_posts: {
      a: ["similar", "reviews", "catalogs", "rankings", "fanart", "other", "unknown"],
      b: ["playnavi", "social", "video", "blog", "store", "none", "other", "unknown"],
    },
    promote_own_posts: {
      a: ["same_game", "similar", "collection", "reactions", "external", "other", "unknown"],
      b: ["playnavi", "social", "video", "blog", "never", "other", "unknown"],
    },
    creator_discovery: {
      a: ["following", "discover", "compare", "themes", "other", "unknown"],
      b: ["video", "social", "article", "audio", "playnavi", "none", "other", "unknown"],
    },
    creator_originals: {
      a: ["themes", "deep_review", "interview", "compare", "participatory", "other", "unknown"],
      b: ["multiple", "once", "none", "forgot", "other", "unknown"],
    },
    game_communities: {
      a: ["read", "discuss", "questions", "match", "other", "unknown"],
      b: ["spoilers", "moderation", "mute", "privacy", "none", "other", "unknown"],
    },
    pc_web: {
      a: ["bulk_edit_logs", "bulk_edit_wishlist", "long_text", "compare_research", "profile_posts", "other", "unknown"],
      b: ["smartphone", "pc", "both", "other", "unknown"],
    },
    guide_ai: {
      a: ["hint", "next", "build", "completion", "other", "unknown"],
      b: ["site", "video", "social", "ai", "self", "none", "other", "unknown"],
    },
    library_ai: {
      a: ["add_log", "summarize", "add_wishlist", "organize", "other", "unknown"],
      b: ["text", "voice", "both", "other", "unknown"],
    },
  },
};
const VOICE_V4_SEGMENT_IDS = {
  playTime: [
    "none", "lt_1h", "h1_lt3", "h3_lt7", "h7_lt14", "h14_plus", "unknown", "prefer_not",
  ],
  primaryPlayDevice: [
    "nintendo", "playstation", "xbox", "pc", "mobile", "other", "tie", "unknown", "prefer_not",
  ],
  infoSeekDays: ["days_0", "days_1_4", "days_5_14", "days_15_plus", "unknown", "prefer_not"],
  recordingPreference: ["none", "simple", "detailed", "depends", "unknown", "prefer_not"],
};
const VOICE_V5_IDS = {
  usage: ["days_15_plus", "days_5_14", "days_1_4", "inactive_1m", "never_used", "unknown"],
  playFrequency: [
    "none", "less_than_weekly", "days_1_2_per_week", "days_3_4_per_week",
    "days_5_6_per_week", "daily", "unknown", "prefer_not",
  ],
  futureRole: [
    "news", "recommend", "research", "record", "wishlist", "read_posts", "publish", "discuss",
    "other", "no_expectation", "current_is_fine", "unknown",
  ],
};
export const VOICE_V5_ANSWER_NOTE_KEYS = [
  "play_frequency_1m", "primary_play_device_1m", "usage_1m", "overall_satisfaction",
  "info_seek_days_1m", "recording_preference", "valuable_features", "unused_features",
  "primary_problem", "dormant_reason", "problem_outcome", "future_role", "future_candidates",
  "future_priority", "future_detail_a", "future_detail_b", "improvement_vs_candidate",
];

export class SurveyContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "SurveyContractError";
  }
}
function text(value, maxLength) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength
    ? value
    : null;
}
const hasOnlyKeys = (value, allowed) =>
  value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).every((key) => allowed.includes(key));

function normalizeOptions(options) {
  if (!Array.isArray(options) || options.length < 1 || options.length > 100) return null;
  const normalized = options.map((option) => ({ value: text(option, 500), label: text(option, 500) }));
  if (normalized.some((option) => !option.value || !option.label)) return null;
  if (new Set(normalized.map((option) => option.value)).size !== normalized.length) return null;
  return normalized;
}

function normalizeQuestion(question) {
  const id = text(question?.id, 100);
  const type = question?.type;
  const prompt = text(question?.label, 1_000);
  if (!id || !QUESTION_TYPES.has(type) || !prompt) return null;

  const options = type === "short_text" ? [] : normalizeOptions(question.options);
  if (options === null) return null;
  const configuredMax = Number.isInteger(question.max_length) ? question.max_length : 500;
  const maxLength = Math.max(1, Math.min(2_000, configuredMax));
  return {
    id,
    type,
    prompt,
    required: question.required === true,
    options,
    maxLength,
  };
}

function normalizeNamedOptions(options, expectedLength = null, description = false) {
  if (
    !Array.isArray(options) ||
    options.length < 1 ||
    options.length > 12 ||
    (expectedLength !== null && options.length !== expectedLength)
  ) return null;
  const optionKeys = description ? ["id", "label", "description"] : ["id", "label"];
  if (options.some((option) => !hasOnlyKeys(option, optionKeys))) return null;
  const normalized = options.map((option) => ({
    id: text(option?.id, 40),
    label: text(option?.label, 120),
    ...(description ? { description: text(option?.description, 240) } : {}),
  }));
  if (
    normalized.some((option) => !option.id || !ID_PATTERN.test(option.id) || !option.label || (description && !option.description)) ||
    new Set(normalized.map((option) => option.id)).size !== normalized.length
  ) return null;
  return normalized;
}

function hasStableIds(options, expectedIds) {
  return options.length === expectedIds.length &&
    options.every((option) => expectedIds.includes(option.id));
}

function hasStableIdOrder(options, expectedIds) {
  return options.length === expectedIds.length &&
    options.every((option, index) => option.id === expectedIds[index]);
}

function normalizeVoiceV3Categories(categories) {
  if (!Array.isArray(categories) || categories.length !== 7) return null;
  const normalized = categories.map((category) => {
    if (!hasOnlyKeys(category, ["id", "label", "features"])) return null;
    const id = text(category.id, 40);
    const label = text(category.label, 120);
    const features = normalizeNamedOptions(category.features, null, true);
    if (!id || !ID_PATTERN.test(id) || !label || !features || features.length < 3 || features.length > 4) return null;
    return { id, label, features };
  });
  if (normalized.some((category) => !category)) return null;
  const features = normalized.flatMap((category) => category.features);
  const stableCategoryIds = Object.keys(VOICE_V3_STABLE_IDS.categoryFeatures);
  if (
    new Set(normalized.map((category) => category.id)).size !== 7 ||
    features.length !== 26 ||
    new Set(features.map((feature) => feature.id)).size !== 26 ||
    !hasStableIds(normalized, stableCategoryIds) ||
    normalized.some((category) => !hasStableIds(
      category.features,
      VOICE_V3_STABLE_IDS.categoryFeatures[category.id] || [],
    ))
  ) return null;
  return { categories: normalized, features };
}

function normalizeVoiceV3Details(details, futureIds) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  if (Object.keys(details).length !== futureIds.length || !futureIds.every((id) => Object.hasOwn(details, id))) return null;
  const normalized = {};
  for (const id of futureIds) {
    const detail = details[id];
    if (!hasOnlyKeys(detail, ["a_prompt", "b_prompt", "a_options", "b_options"])) return null;
    const aPrompt = text(detail.a_prompt, 500);
    const bPrompt = text(detail.b_prompt, 500);
    const aOptions = normalizeNamedOptions(detail.a_options);
    const bOptions = normalizeNamedOptions(detail.b_options);
    const stableDetail = VOICE_V3_STABLE_IDS.futureDetails[id];
    if (
      !aPrompt || !bPrompt || !aOptions || !bOptions || !stableDetail ||
      !hasStableIds(aOptions, stableDetail.a) || !hasStableIds(bOptions, stableDetail.b)
    ) return null;
    normalized[id] = { aPrompt, bPrompt, aOptions, bOptions };
  }
  return normalized;
}

const VOICE_V3_DEFINITION_KEYS = [
  "kind", "usage_options", "overall_satisfaction_options", "categories",
  "q4_exclusive_options", "unused_reason_options", "problem_options",
  "dormant_reason_options", "problem_outcome_options", "future_role_options",
  "future_options", "future_exclusive_options", "future_detail_options",
  "unprompted_max_length", "problem_comment_max_length", "other_max_length",
  "valuable_feature_max", "future_candidate_max",
];

function normalizeVoiceV3Definition(questions) {
  if (
    !hasOnlyKeys(questions, VOICE_V3_DEFINITION_KEYS) ||
    Object.keys(questions).length !== VOICE_V3_DEFINITION_KEYS.length ||
    questions.kind !== VOICE_V3_KIND
  ) return null;
  const usageOptions = normalizeNamedOptions(questions.usage_options, 6);
  const overallSatisfactionOptions = normalizeNamedOptions(questions.overall_satisfaction_options, 6);
  const categoryResult = normalizeVoiceV3Categories(questions.categories);
  const q4ExclusiveOptions = normalizeNamedOptions(questions.q4_exclusive_options, 2);
  const unusedReasonOptions = normalizeNamedOptions(questions.unused_reason_options, 8);
  const problemOptions = normalizeNamedOptions(questions.problem_options, 12);
  const dormantReasonOptions = normalizeNamedOptions(questions.dormant_reason_options, 10);
  const problemOutcomeOptions = normalizeNamedOptions(questions.problem_outcome_options, 4);
  const futureRoleOptions = normalizeNamedOptions(questions.future_role_options, 11);
  const futureOptions = normalizeNamedOptions(questions.future_options, 12, true);
  const futureExclusiveOptions = normalizeNamedOptions(questions.future_exclusive_options, 2);
  if (
    !usageOptions || !overallSatisfactionOptions || !categoryResult || !q4ExclusiveOptions ||
    !unusedReasonOptions || !problemOptions || !dormantReasonOptions || !problemOutcomeOptions ||
    !futureRoleOptions || !futureOptions || !futureExclusiveOptions ||
    !hasStableIds(usageOptions, VOICE_V3_STABLE_IDS.usage) ||
    !hasStableIds(overallSatisfactionOptions, VOICE_V3_STABLE_IDS.overallSatisfaction) ||
    !hasStableIds(q4ExclusiveOptions, VOICE_V3_STABLE_IDS.q4Exclusive) ||
    !hasStableIds(unusedReasonOptions, VOICE_V3_STABLE_IDS.unusedReason) ||
    !hasStableIds(problemOptions, VOICE_V3_STABLE_IDS.problem) ||
    !hasStableIds(dormantReasonOptions, VOICE_V3_STABLE_IDS.dormantReason) ||
    !hasStableIds(problemOutcomeOptions, VOICE_V3_STABLE_IDS.problemOutcome) ||
    !hasStableIds(futureRoleOptions, VOICE_V3_STABLE_IDS.futureRole) ||
    !hasStableIds(futureOptions, VOICE_V3_STABLE_IDS.future) ||
    !hasStableIds(futureExclusiveOptions, VOICE_V3_STABLE_IDS.futureExclusive) ||
    questions.unprompted_max_length !== 400 || questions.problem_comment_max_length !== 300 ||
    questions.other_max_length !== 400 || questions.valuable_feature_max !== 3 ||
    questions.future_candidate_max !== 3
  ) return null;
  const futureDetailOptions = normalizeVoiceV3Details(
    questions.future_detail_options,
    futureOptions.map((option) => option.id),
  );
  if (!futureDetailOptions) return null;
  return {
    kind: VOICE_V3_KIND,
    usageOptions,
    overallSatisfactionOptions,
    ...categoryResult,
    q4ExclusiveOptions,
    unusedReasonOptions,
    problemOptions,
    dormantReasonOptions,
    problemOutcomeOptions,
    futureRoleOptions,
    futureOptions,
    futureExclusiveOptions,
    futureDetailOptions,
    unpromptedMaxLength: 400,
    problemCommentMaxLength: 300,
    otherMaxLength: 400,
    valuableFeatureMax: 3,
    futureCandidateMax: 3,
  };
}

function normalizeVoiceV4Definition(questions) {
  const segmentKeys = [
    "play_time_options", "primary_device_options", "info_seek_options",
    "recording_preference_options", "reference_period_days", "reference_period_timezone",
    "reference_period_end_offset_days",
  ];
  const keys = [...VOICE_V3_DEFINITION_KEYS, ...segmentKeys];
  if (
    !hasOnlyKeys(questions, keys) || Object.keys(questions).length !== keys.length ||
    questions.kind !== VOICE_V4_KIND
  ) return null;
  const baseQuestions = Object.fromEntries(VOICE_V3_DEFINITION_KEYS.map((key) => [key, questions[key]]));
  baseQuestions.kind = VOICE_V3_KIND;
  const base = normalizeVoiceV3Definition(baseQuestions);
  const playTimeOptions = normalizeNamedOptions(questions.play_time_options, 8);
  const primaryDeviceOptions = normalizeNamedOptions(questions.primary_device_options, 9);
  const infoSeekOptions = normalizeNamedOptions(questions.info_seek_options, 6);
  const recordingPreferenceOptions = normalizeNamedOptions(questions.recording_preference_options, 6);
  if (
    !base || !playTimeOptions || !primaryDeviceOptions || !infoSeekOptions ||
    !recordingPreferenceOptions ||
    !hasStableIdOrder(playTimeOptions, VOICE_V4_SEGMENT_IDS.playTime) ||
    !hasStableIdOrder(primaryDeviceOptions, VOICE_V4_SEGMENT_IDS.primaryPlayDevice) ||
    !hasStableIdOrder(infoSeekOptions, VOICE_V4_SEGMENT_IDS.infoSeekDays) ||
    !hasStableIdOrder(recordingPreferenceOptions, VOICE_V4_SEGMENT_IDS.recordingPreference) ||
    questions.reference_period_days !== 28 || questions.reference_period_timezone !== "Asia/Tokyo" ||
    questions.reference_period_end_offset_days !== 1
  ) return null;
  return {
    ...base,
    kind: VOICE_V4_KIND,
    playTimeOptions,
    primaryDeviceOptions,
    infoSeekOptions,
    recordingPreferenceOptions,
    referencePeriodDays: 28,
    referencePeriodTimezone: "Asia/Tokyo",
    referencePeriodEndOffsetDays: 1,
  };
}

const VOICE_V5_DEFINITION_KEYS = [
  "kind", "usage_options", "overall_satisfaction_options", "categories",
  "q4_exclusive_options", "unused_reason_options", "problem_options",
  "dormant_reason_options", "problem_outcome_options", "future_role_options",
  "future_options", "future_exclusive_options", "future_detail_options",
  "unprompted_max_length", "problem_comment_max_length", "other_max_length",
  "future_candidate_max", "play_frequency_options", "primary_device_options",
  "info_seek_options", "recording_preference_options", "reference_period_days",
  "reference_period_timezone", "reference_period_end_offset_days",
  "valuable_reason_max_length", "answer_note_max_length",
];

function normalizeVoiceV5Definition(questions) {
  if (
    !hasOnlyKeys(questions, VOICE_V5_DEFINITION_KEYS) ||
    Object.keys(questions).length !== VOICE_V5_DEFINITION_KEYS.length ||
    questions.kind !== VOICE_V5_KIND
  ) return null;
  const baseQuestions = {
    ...Object.fromEntries(VOICE_V3_DEFINITION_KEYS
      .filter((key) => key !== "valuable_feature_max")
      .map((key) => [key, questions[key]])),
    kind: VOICE_V3_KIND,
    valuable_feature_max: 3,
    usage_options: questions.usage_options.map((option) => ({
      ...option,
      id: option.id === "inactive_1m" ? "inactive_30d" : option.id,
    })),
    future_role_options: questions.future_role_options
      .filter((option) => option.id !== "current_is_fine")
      .map((option) => ({ ...option, id: option.id === "no_expectation" ? "none" : option.id })),
  };
  const base = normalizeVoiceV3Definition(baseQuestions);
  const playFrequencyOptions = normalizeNamedOptions(questions.play_frequency_options, 8);
  const primaryDeviceOptions = normalizeNamedOptions(questions.primary_device_options, 9);
  const infoSeekOptions = normalizeNamedOptions(questions.info_seek_options, 6);
  const recordingPreferenceOptions = normalizeNamedOptions(questions.recording_preference_options, 6);
  const futureRoleOptions = normalizeNamedOptions(questions.future_role_options, 12);
  if (
    !base || !playFrequencyOptions || !primaryDeviceOptions || !infoSeekOptions ||
    !recordingPreferenceOptions || !futureRoleOptions ||
    !hasStableIdOrder(questions.usage_options, VOICE_V5_IDS.usage) ||
    !hasStableIdOrder(playFrequencyOptions, VOICE_V5_IDS.playFrequency) ||
    !hasStableIdOrder(primaryDeviceOptions, VOICE_V4_SEGMENT_IDS.primaryPlayDevice) ||
    !hasStableIdOrder(infoSeekOptions, VOICE_V4_SEGMENT_IDS.infoSeekDays) ||
    !hasStableIdOrder(recordingPreferenceOptions, VOICE_V4_SEGMENT_IDS.recordingPreference) ||
    !hasStableIdOrder(futureRoleOptions, VOICE_V5_IDS.futureRole) ||
    questions.reference_period_days !== 30 || questions.reference_period_timezone !== "Asia/Tokyo" ||
    questions.reference_period_end_offset_days !== 1 || questions.valuable_reason_max_length !== 400 ||
    questions.answer_note_max_length !== 400
  ) return null;
  return {
    ...base,
    kind: VOICE_V5_KIND,
    usageOptions: normalizeNamedOptions(questions.usage_options, 6),
    futureRoleOptions,
    playFrequencyOptions,
    primaryDeviceOptions,
    infoSeekOptions,
    recordingPreferenceOptions,
    valuableFeatureMax: 26,
    referencePeriodDays: 30,
    referencePeriodTimezone: "Asia/Tokyo",
    referencePeriodEndOffsetDays: 1,
    valuableReasonMaxLength: 400,
    answerNoteMaxLength: 400,
    answerNoteKeys: [...VOICE_V5_ANSWER_NOTE_KEYS],
  };
}

function normalizeVoiceDefinition(questions) {
  if (!questions || typeof questions !== "object" || Array.isArray(questions)) return null;
  if (!hasOnlyKeys(questions, [
    "kind",
    "usage_options",
    "overall_satisfaction_options",
    "priority_options",
    "importance_options",
    "detail_satisfaction_options",
    "categories",
    "future_options",
    "comment_max_length",
    "second_category_optional",
    "future_top_max",
  ])) return null;
  const usageOptions = normalizeNamedOptions(questions.usage_options, 6);
  const overallSatisfactionOptions = normalizeNamedOptions(questions.overall_satisfaction_options, 6);
  const priorityOptions = normalizeNamedOptions(questions.priority_options, 5);
  const importanceOptions = normalizeNamedOptions(questions.importance_options, 6);
  const detailSatisfactionOptions = normalizeNamedOptions(questions.detail_satisfaction_options, 7);
  const futureOptions = normalizeNamedOptions(questions.future_options, 7, true);
  if (
    !usageOptions || !overallSatisfactionOptions ||
    !priorityOptions || !importanceOptions || !detailSatisfactionOptions || !futureOptions ||
    questions.kind !== VOICE_KIND ||
    questions.comment_max_length !== 200 ||
    questions.second_category_optional !== true ||
    questions.future_top_max !== 3 ||
    !Array.isArray(questions.categories) || questions.categories.length !== 7
  ) return null;

  if (questions.categories.some((category) =>
    !hasOnlyKeys(category, ["id", "label", "features"]) ||
    !Array.isArray(category.features) ||
    category.features.some((feature) => !hasOnlyKeys(feature, ["id", "label"]))
  )) return null;
  const categories = questions.categories.map((category) => ({
    id: text(category?.id, 40),
    label: text(category?.label, 120),
    features: Array.isArray(category?.features)
      ? category.features.map((feature) => ({
        id: text(feature?.id, 40),
        label: text(feature?.label, 120),
      }))
      : null,
  }));
  const features = categories.flatMap((category) => category.features || []);
  if (
    categories.some((category) =>
      !category.id || !ID_PATTERN.test(category.id) || !category.label ||
      !category.features || category.features.length < 3 || category.features.length > 4 ||
      category.features.some((feature) => !feature.id || !ID_PATTERN.test(feature.id) || !feature.label)
    ) ||
    new Set(categories.map((category) => category.id)).size !== 7 ||
    features.length !== 26 ||
    new Set(features.map((feature) => feature.id)).size !== 26
  ) return null;

  return {
    kind: VOICE_KIND,
    usageOptions,
    overallSatisfactionOptions,
    priorityOptions,
    importanceOptions,
    detailSatisfactionOptions,
    categories,
    features,
    futureOptions,
    commentMaxLength: 200,
    secondCategoryOptional: true,
    futureTopMax: 3,
  };
}

export function parseSurveyRead(payload, expectedSlug) {
  if (!payload || typeof payload !== "object") throw new SurveyContractError("invalid payload");
  if (payload.status !== "ok" || !payload.survey || payload.survey.slug !== expectedSlug) {
    throw new SurveyContractError("invalid survey status");
  }
  if (![undefined, 1, 2, 3, 4, 5].includes(payload.survey.schema_version)) {
    throw new SurveyContractError("unsupported schema version");
  }
  if (payload.survey.schema_version === 5) {
    const voice = normalizeVoiceV5Definition(payload.survey.questions);
    if (!voice) throw new SurveyContractError("invalid monthly voice questions");
    return {
      status: payload.response ? "already_answered" : "ok",
      schemaVersion: 5,
      title: text(payload.survey.title, 500),
      description: typeof payload.survey.description === "string"
        ? payload.survey.description.slice(0, 2_000)
        : "",
      voice,
      rewardEligible: payload.survey.reward !== null && payload.survey.reward !== undefined,
      titleName: payload.response ? text(payload.survey.reward?.name_ja, 200) : null,
      titleAwarded: false,
    };
  }
  if (payload.survey.schema_version === 4) {
    const voice = normalizeVoiceV4Definition(payload.survey.questions);
    if (!voice) throw new SurveyContractError("invalid segmented voice questions");
    return {
      status: payload.response ? "already_answered" : "ok",
      schemaVersion: 4,
      title: text(payload.survey.title, 500),
      description: typeof payload.survey.description === "string"
        ? payload.survey.description.slice(0, 2_000)
        : "",
      voice,
      titleName: payload.response ? text(payload.survey.reward?.name_ja, 200) : null,
      titleAwarded: false,
    };
  }
  if (payload.survey.schema_version === 3) {
    const voice = normalizeVoiceV3Definition(payload.survey.questions);
    if (!voice) throw new SurveyContractError("invalid reviewed voice questions");
    return {
      status: payload.response ? "already_answered" : "ok",
      schemaVersion: 3,
      title: text(payload.survey.title, 500),
      description: typeof payload.survey.description === "string"
        ? payload.survey.description.slice(0, 2_000)
        : "",
      voice,
      titleName: payload.response ? text(payload.survey.reward?.name_ja, 200) : null,
      titleAwarded: false,
    };
  }
  if (payload.survey.schema_version === 2) {
    const voice = normalizeVoiceDefinition(payload.survey.questions);
    if (!voice) throw new SurveyContractError("invalid voice questions");
    return {
      status: payload.response ? "already_answered" : "ok",
      schemaVersion: 2,
      title: text(payload.survey.title, 500),
      description: typeof payload.survey.description === "string"
        ? payload.survey.description.slice(0, 2_000)
        : "",
      voice,
      titleName: payload.response ? text(payload.survey.reward?.name_ja, 200) : null,
      titleAwarded: false,
    };
  }

  const questions = Array.isArray(payload.survey.questions)
    ? payload.survey.questions.map(normalizeQuestion)
    : null;
  if (
    !questions ||
    questions.length < 1 ||
    questions.length > 100 ||
    questions.some((question) => !question) ||
    new Set(questions.map((question) => question.id)).size !== questions.length
  ) {
    throw new SurveyContractError("invalid questions");
  }
  return {
    status: payload.response ? "already_answered" : "ok",
    schemaVersion: 1,
    title: text(payload.survey.title, 500),
    description: typeof payload.survey.description === "string"
      ? payload.survey.description.slice(0, 2_000)
      : "",
    questions,
    titleName: payload.response ? text(payload.survey.reward?.name_ja, 200) : null,
    titleAwarded: false,
  };
}

export function parseSurveyPreview(payload, expectedSlug) {
  if (!payload || typeof payload !== "object" || payload.status !== "ok") {
    throw new SurveyContractError("invalid preview status");
  }
  const survey = payload.survey;
  const title = survey?.slug === expectedSlug ? text(survey.title, 120) : null;
  if (!title || !hasOnlyKeys(survey, ["slug", "title", "description", "schema_version"]) ||
    ![undefined, 1, 2, 3, 4, 5].includes(survey.schema_version)) {
    throw new SurveyContractError("invalid survey preview");
  }
  return {
    title,
    description: typeof survey.description === "string"
      ? survey.description.slice(0, 2_000)
      : "",
    ...(survey.schema_version === 5 ? { schemaVersion: 5 } : {}),
  };
}

const optionHas = (options, value) => options.some((option) => option.id === value);
const objectValue = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const exactKeys = (value, allowed) => Object.keys(value).every((key) => allowed.includes(key));

export function validateVoiceAnswers(voice, rawValues) {
  const values = objectValue(rawValues);
  const missing = [];
  const answers = {
    usage_frequency: "",
    overall_satisfaction: "",
    feature_priorities: {},
    feature_comments: {},
    category_top: [],
    feature_details: {},
    future_interest: "",
    future_top: [],
  };
  const featureIds = voice.features.map((feature) => feature.id);
  const categoryIds = voice.categories.map((category) => category.id);
  const futureIds = voice.futureOptions.map((option) => option.id);
  let structurallyInvalid = !exactKeys(values, VOICE_ANSWER_KEYS);

  if (optionHas(voice.usageOptions, values.usage_frequency)) {
    answers.usage_frequency = values.usage_frequency;
  } else missing.push("usage_frequency");
  if (optionHas(voice.overallSatisfactionOptions, values.overall_satisfaction)) {
    answers.overall_satisfaction = values.overall_satisfaction;
  } else missing.push("overall_satisfaction");

  const priorities = objectValue(values.feature_priorities);
  structurallyInvalid ||= !exactKeys(priorities, featureIds);
  for (const featureId of featureIds) {
    if (optionHas(voice.priorityOptions, priorities[featureId])) {
      answers.feature_priorities[featureId] = priorities[featureId];
    } else missing.push(`priority:${featureId}`);
  }

  const comments = objectValue(values.feature_comments);
  structurallyInvalid ||= !exactKeys(comments, featureIds);
  for (const [featureId, value] of Object.entries(comments)) {
    if (typeof value !== "string" || value.length > voice.commentMaxLength) {
      structurallyInvalid = true;
      continue;
    }
    const comment = value.trim();
    if (comment) answers.feature_comments[featureId] = comment;
  }

  const categoryTop = Array.isArray(values.category_top)
    ? values.category_top.filter((id) => categoryIds.includes(id))
    : [];
  if (categoryTop.length < 1) missing.push("category_top:0");
  if (
    categoryTop.length > 2 ||
    new Set(categoryTop).size !== categoryTop.length ||
    categoryTop.length !== (Array.isArray(values.category_top) ? values.category_top.length : 0)
  ) structurallyInvalid = true;
  answers.category_top = [...new Set(categoryTop)].slice(0, 2);

  const expectedDetailIds = voice.categories
    .filter((category) => answers.category_top.includes(category.id))
    .flatMap((category) => category.features.map((feature) => feature.id));
  const details = objectValue(values.feature_details);
  structurallyInvalid ||= !exactKeys(details, expectedDetailIds);
  for (const featureId of expectedDetailIds) {
    const detail = objectValue(details[featureId]);
    if (!exactKeys(detail, ["importance", "satisfaction"])) structurallyInvalid = true;
    const importance = optionHas(voice.importanceOptions, detail.importance) ? detail.importance : "";
    const satisfaction = optionHas(voice.detailSatisfactionOptions, detail.satisfaction)
      ? detail.satisfaction
      : "";
    if (!importance) missing.push(`importance:${featureId}`);
    if (!satisfaction) missing.push(`satisfaction:${featureId}`);
    if (importance && satisfaction) answers.feature_details[featureId] = { importance, satisfaction };
  }
  if (Object.keys(details).length !== expectedDetailIds.length) structurallyInvalid = true;

  if (["yes", "none", "unsure"].includes(values.future_interest)) {
    answers.future_interest = values.future_interest;
  } else missing.push("future_interest");
  const futureTop = Array.isArray(values.future_top)
    ? values.future_top.filter((id) => futureIds.includes(id))
    : [];
  if (answers.future_interest === "yes" && futureTop.length < 1) missing.push("future_top:0");
  if (answers.future_interest !== "yes" && futureTop.length > 0) structurallyInvalid = true;
  if (
    futureTop.length > voice.futureTopMax ||
    new Set(futureTop).size !== futureTop.length ||
    futureTop.length !== (Array.isArray(values.future_top) ? values.future_top.length : 0)
  ) structurallyInvalid = true;
  answers.future_top = answers.future_interest === "yes" ? [...new Set(futureTop)].slice(0, 3) : [];

  return { answers, missing, structurallyInvalid };
}

const cleanText = (value, maxLength) => typeof value === "string" && value.length <= maxLength ? value.trim() : null;
const cleanVoiceV5Text = (value, maxLength) => {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return [...cleaned].length <= maxLength ? cleaned : null;
};
const idsEqual = (actual, expected) =>
  Array.isArray(actual) && actual.length === expected.length &&
  new Set(actual).size === actual.length && actual.every((id) => expected.includes(id));

export function validateVoiceV3Answers(voice, rawValues) {
  const values = objectValue(rawValues);
  const answers = Object.fromEntries(VOICE_V3_ANSWER_KEYS.map((key) => [key, [
    "valuable_features", "feature_display_order", "future_candidates", "future_display_order",
  ].includes(key) ? [] : ""]));
  const missing = [];
  let structurallyInvalid = Object.keys(values).length !== VOICE_V3_ANSWER_KEYS.length ||
    !exactKeys(values, VOICE_V3_ANSWER_KEYS);
  const featureIds = voice.features.map((feature) => feature.id);
  const q4ExclusiveIds = voice.q4ExclusiveOptions.map((option) => option.id);
  const futureIds = voice.futureOptions.map((option) => option.id);
  const futureExclusiveIds = voice.futureExclusiveOptions.map((option) => option.id);
  const optionValue = (options, key, { required = false } = {}) => {
    const value = typeof values[key] === "string" && optionHas(options, values[key]) ? values[key] : "";
    if (required && !value) missing.push(key);
    else if (values[key] !== value) structurallyInvalid = true;
    answers[key] = value;
    return value;
  };
  const textValue = (key, maxLength) => {
    const value = cleanText(values[key], maxLength);
    if (value === null) structurallyInvalid = true;
    answers[key] = value || "";
    return answers[key];
  };

  const usage = optionValue(voice.usageOptions, "usage_30d", { required: true });
  const current = ["days_15_plus", "days_5_14", "days_1_4"].includes(usage);
  const dormant = usage === "inactive_30d";
  const never = usage === "never_used";
  const hasExperience = Boolean(usage) && !never;
  optionValue(voice.overallSatisfactionOptions, "overall_satisfaction", { required: hasExperience });
  if (!hasExperience && values.overall_satisfaction !== "") structurallyInvalid = true;
  textValue("unprompted_need", voice.unpromptedMaxLength);

  const valuable = Array.isArray(values.valuable_features) ? values.valuable_features : [];
  const validValuable = valuable.every((id) => [...featureIds, ...q4ExclusiveIds].includes(id));
  if (hasExperience && valuable.length === 0) missing.push("valuable_features");
  if (
    !hasExperience && valuable.length > 0 || !validValuable || valuable.length > voice.valuableFeatureMax ||
    new Set(valuable).size !== valuable.length ||
    (valuable.some((id) => q4ExclusiveIds.includes(id)) && valuable.length !== 1)
  ) structurallyInvalid = true;
  answers.valuable_features = validValuable ? [...valuable] : [];

  const unusedFeature = typeof values.unused_feature === "string" && featureIds.includes(values.unused_feature)
    ? values.unused_feature : "";
  if (values.unused_feature !== unusedFeature || (!hasExperience && unusedFeature)) structurallyInvalid = true;
  answers.unused_feature = unusedFeature;
  optionValue(voice.unusedReasonOptions, "unused_reason", { required: Boolean(unusedFeature) });
  if (!unusedFeature && values.unused_reason !== "") structurallyInvalid = true;

  const problem = optionValue(voice.problemOptions, "primary_problem", { required: hasExperience && !dormant });
  const dormantReason = optionValue(voice.dormantReasonOptions, "dormant_reason", { required: dormant });
  if (dormant && problem || !dormant && dormantReason) structurallyInvalid = true;
  textValue("problem_comment", voice.problemCommentMaxLength);
  const concreteProblem = Boolean(problem) && !["none", "unknown"].includes(problem);
  if (!concreteProblem && answers.problem_comment) structurallyInvalid = true;
  optionValue(voice.problemOutcomeOptions, "problem_outcome", { required: concreteProblem && !dormant });
  if ((!concreteProblem || dormant) && values.problem_outcome !== "") structurallyInvalid = true;

  const futureRole = optionValue(voice.futureRoleOptions, "future_role", { required: true });
  textValue("future_role_other", voice.otherMaxLength);
  if (futureRole !== "other" && answers.future_role_other) structurallyInvalid = true;

  const futureCandidates = Array.isArray(values.future_candidates) ? values.future_candidates : [];
  const allowedFuture = [...futureIds, "other", ...futureExclusiveIds];
  const validFuture = futureCandidates.every((id) => allowedFuture.includes(id));
  if (futureCandidates.length === 0) missing.push("future_candidates");
  if (
    !validFuture || futureCandidates.length > voice.futureCandidateMax ||
    new Set(futureCandidates).size !== futureCandidates.length ||
    (futureCandidates.some((id) => futureExclusiveIds.includes(id)) && futureCandidates.length !== 1)
  ) structurallyInvalid = true;
  answers.future_candidates = validFuture ? [...futureCandidates] : [];
  textValue("future_other", voice.otherMaxLength);
  if (!futureCandidates.includes("other") && answers.future_other) structurallyInvalid = true;

  const rankableFuture = futureCandidates.filter((id) => futureIds.includes(id) || id === "other");
  const expectedPriority = rankableFuture.length === 1 ? rankableFuture[0] : values.future_priority;
  if (rankableFuture.length === 0) {
    if (values.future_priority !== "" || values.future_priority_mode !== "") structurallyInvalid = true;
  } else if (rankableFuture.length === 1) {
    if (values.future_priority !== expectedPriority || values.future_priority_mode !== "inherited") structurallyInvalid = true;
    answers.future_priority = expectedPriority;
    answers.future_priority_mode = "inherited";
  } else {
    if (!rankableFuture.includes(values.future_priority)) missing.push("future_priority");
    if (values.future_priority_mode !== "explicit") structurallyInvalid = true;
    answers.future_priority = rankableFuture.includes(values.future_priority) ? values.future_priority : "";
    answers.future_priority_mode = "explicit";
  }
  const priority = answers.future_priority;
  const detail = voice.futureDetailOptions[priority];
  if (detail) {
    optionValue(detail.aOptions, "future_detail_a");
    optionValue(detail.bOptions, "future_detail_b");
  } else if (values.future_detail_a !== "" || values.future_detail_b !== "") structurallyInvalid = true;
  textValue("future_detail_other", voice.otherMaxLength);
  if (priority !== "other" && answers.future_detail_other) structurallyInvalid = true;

  const compareRequired = current && concreteProblem && futureIds.includes(priority);
  const comparison = typeof values.improvement_vs_candidate === "string" &&
    ["improvement", "candidate", "tie"].includes(values.improvement_vs_candidate)
    ? values.improvement_vs_candidate : "";
  if (compareRequired && !comparison) missing.push("improvement_vs_candidate");
  if (!compareRequired && values.improvement_vs_candidate !== "") structurallyInvalid = true;
  answers.improvement_vs_candidate = compareRequired ? comparison : "";

  if (!idsEqual(values.feature_display_order, featureIds)) structurallyInvalid = true;
  else answers.feature_display_order = [...values.feature_display_order];
  if (!idsEqual(values.future_display_order, futureIds)) structurallyInvalid = true;
  else answers.future_display_order = [...values.future_display_order];
  return { answers, missing, structurallyInvalid };
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const validIsoDate = (value) => {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
};

export function validateVoiceV4Answers(voice, rawValues) {
  const values = objectValue(rawValues);
  const baseValues = Object.fromEntries(VOICE_V3_ANSWER_KEYS.map((key) => [key, values[key]]));
  const base = validateVoiceV3Answers(voice, baseValues);
  const answers = Object.fromEntries(VOICE_V4_ANSWER_KEYS.map((key) => [key, [
    "valuable_features", "feature_display_order", "future_candidates", "future_display_order",
  ].includes(key) ? [] : ""]));
  for (const key of VOICE_V3_ANSWER_KEYS) answers[key] = base.answers[key];
  const missing = [...base.missing];
  let structurallyInvalid = base.structurallyInvalid ||
    Object.keys(values).length !== VOICE_V4_ANSWER_KEYS.length || !exactKeys(values, VOICE_V4_ANSWER_KEYS);
  const optionValue = (options, key, { required = false } = {}) => {
    const value = typeof values[key] === "string" && optionHas(options, values[key]) ? values[key] : "";
    if (required && !value) missing.push(key);
    else if (values[key] !== value) structurallyInvalid = true;
    answers[key] = value;
    return value;
  };

  if (validIsoDate(values.reference_period_end_on)) answers.reference_period_end_on = values.reference_period_end_on;
  else if (!values.reference_period_end_on) missing.push("reference_period_end_on");
  else structurallyInvalid = true;
  const playTime = optionValue(voice.playTimeOptions, "play_time_4w", { required: true });
  const playedRecently = ["lt_1h", "h1_lt3", "h3_lt7", "h7_lt14", "h14_plus"].includes(playTime);
  optionValue(voice.primaryDeviceOptions, "primary_play_device_4w", { required: playedRecently });
  if (!playedRecently && values.primary_play_device_4w !== "") structurallyInvalid = true;
  optionValue(voice.infoSeekOptions, "info_seek_days_4w", { required: true });
  optionValue(voice.recordingPreferenceOptions, "recording_preference", { required: true });

  return { answers, missing: [...new Set(missing)], structurallyInvalid };
}

export function validateVoiceV5Answers(voice, rawValues) {
  const values = objectValue(rawValues);
  const answers = Object.fromEntries(VOICE_V5_ANSWER_KEYS.map((key) => [key, [
    "valuable_features", "unused_features", "feature_display_order", "future_candidates",
    "future_display_order",
  ].includes(key) ? [] : [
    "valuable_feature_reasons", "unused_feature_reason_by_feature", "answer_notes",
  ].includes(key) ? {} : ""]));
  const missing = [];
  let structurallyInvalid = Object.keys(values).length !== VOICE_V5_ANSWER_KEYS.length ||
    !exactKeys(values, VOICE_V5_ANSWER_KEYS);
  const featureIds = voice.features.map(({ id }) => id);
  const q4ExclusiveIds = voice.q4ExclusiveOptions.map(({ id }) => id);
  const futureIds = voice.futureOptions.map(({ id }) => id);
  const futureExclusiveIds = voice.futureExclusiveOptions.map(({ id }) => id);
  const optionValue = (options, key, { required = false } = {}) => {
    const value = typeof values[key] === "string" && optionHas(options, values[key]) ? values[key] : "";
    if (required && !value) missing.push(key);
    else if (values[key] !== value) structurallyInvalid = true;
    answers[key] = value;
    return value;
  };
  const textValue = (key, maxLength) => {
    const value = cleanText(values[key], maxLength);
    if (value === null) structurallyInvalid = true;
    answers[key] = value || "";
    return answers[key];
  };
  const exactSelection = (key, allowed, exclusive, { required = false, enabled = true } = {}) => {
    const raw = Array.isArray(values[key]) ? values[key] : [];
    const valid = raw.every((id) => allowed.includes(id));
    if (enabled && required && raw.length === 0) missing.push(key);
    if (
      !Array.isArray(values[key]) || !valid || new Set(raw).size !== raw.length ||
      (raw.some((id) => exclusive.includes(id)) && raw.length !== 1) || (!enabled && raw.length)
    ) structurallyInvalid = true;
    answers[key] = enabled && valid ? [...raw] : [];
    return answers[key];
  };

  if (validIsoDate(values.reference_period_end_on)) answers.reference_period_end_on = values.reference_period_end_on;
  else if (!values.reference_period_end_on) missing.push("reference_period_end_on");
  else structurallyInvalid = true;
  const playFrequency = optionValue(voice.playFrequencyOptions, "play_frequency_1m", { required: true });
  const playedRecently = [
    "less_than_weekly", "days_1_2_per_week", "days_3_4_per_week", "days_5_6_per_week", "daily",
  ].includes(playFrequency);
  optionValue(voice.primaryDeviceOptions, "primary_play_device_1m", { required: playedRecently });
  if (!playedRecently && values.primary_play_device_1m !== "") structurallyInvalid = true;
  const usage = optionValue(voice.usageOptions, "usage_1m", { required: true });
  const current = ["days_15_plus", "days_5_14", "days_1_4"].includes(usage);
  const dormant = usage === "inactive_1m";
  const never = usage === "never_used";
  const hasExperience = Boolean(usage) && !never;
  optionValue(voice.overallSatisfactionOptions, "overall_satisfaction", { required: hasExperience });
  if (!hasExperience && values.overall_satisfaction !== "") structurallyInvalid = true;
  textValue("unprompted_need", voice.unpromptedMaxLength);
  optionValue(voice.infoSeekOptions, "info_seek_days_1m", { required: true });
  optionValue(voice.recordingPreferenceOptions, "recording_preference", { required: true });

  const valuable = exactSelection(
    "valuable_features", [...featureIds, ...q4ExclusiveIds], q4ExclusiveIds,
    { required: hasExperience, enabled: hasExperience },
  );
  const valuableFeatureIds = valuable.filter((id) => featureIds.includes(id));
  const valuableReasons = objectValue(values.valuable_feature_reasons);
  if (!exactKeys(valuableReasons, valuableFeatureIds)) structurallyInvalid = true;
  for (const [featureId, rawReason] of Object.entries(valuableReasons)) {
    const value = cleanVoiceV5Text(rawReason, voice.valuableReasonMaxLength);
    if (value === null || !value) structurallyInvalid = true;
    else answers.valuable_feature_reasons[featureId] = value;
  }

  const unused = exactSelection(
    "unused_features", [...featureIds, ...q4ExclusiveIds], q4ExclusiveIds,
    { required: hasExperience, enabled: hasExperience },
  );
  const unusedFeatureIds = unused.filter((id) => featureIds.includes(id));
  const reasonByFeature = objectValue(values.unused_feature_reason_by_feature);
  if (!exactKeys(reasonByFeature, unusedFeatureIds)) structurallyInvalid = true;
  for (const featureId of unusedFeatureIds) {
    const reason = typeof reasonByFeature[featureId] === "string" &&
      optionHas(voice.unusedReasonOptions, reasonByFeature[featureId]) ? reasonByFeature[featureId] : "";
    if (Object.hasOwn(reasonByFeature, featureId) && !reason) structurallyInvalid = true;
    if (!reason && !missing.includes("unused_reasons")) missing.push("unused_reasons");
    else answers.unused_feature_reason_by_feature[featureId] = reason;
  }

  const problem = optionValue(voice.problemOptions, "primary_problem", { required: hasExperience && !dormant });
  const dormantReason = optionValue(voice.dormantReasonOptions, "dormant_reason", { required: dormant });
  if (dormant && problem || !dormant && dormantReason) structurallyInvalid = true;
  textValue("problem_comment", voice.problemCommentMaxLength);
  if (answers.problem_comment) structurallyInvalid = true;
  const hasConcreteProblem = Boolean(problem) && !["none", "unknown"].includes(problem);
  optionValue(voice.problemOutcomeOptions, "problem_outcome", { required: hasConcreteProblem && !dormant });
  if ((!hasConcreteProblem || dormant) && values.problem_outcome !== "") structurallyInvalid = true;

  const futureRole = optionValue(voice.futureRoleOptions, "future_role", { required: true });
  textValue("future_role_other", voice.otherMaxLength);
  if (futureRole !== "other" && answers.future_role_other) structurallyInvalid = true;
  const futureCandidates = exactSelection(
    "future_candidates", [...futureIds, "other", ...futureExclusiveIds], futureExclusiveIds, { required: true },
  );
  if (futureCandidates.length > voice.futureCandidateMax) structurallyInvalid = true;
  textValue("future_other", voice.otherMaxLength);
  if (!futureCandidates.includes("other") && answers.future_other) structurallyInvalid = true;
  const rankable = futureCandidates.filter((id) => futureIds.includes(id) || id === "other");
  if (rankable.length === 0) {
    if (values.future_priority !== "" || values.future_priority_mode !== "") structurallyInvalid = true;
  } else if (rankable.length === 1) {
    if (values.future_priority !== rankable[0] || values.future_priority_mode !== "inherited") structurallyInvalid = true;
    answers.future_priority = rankable[0];
    answers.future_priority_mode = "inherited";
  } else {
    if (!rankable.includes(values.future_priority)) missing.push("future_priority");
    if (values.future_priority_mode !== "explicit") structurallyInvalid = true;
    answers.future_priority = rankable.includes(values.future_priority) ? values.future_priority : "";
    answers.future_priority_mode = "explicit";
  }
  const priority = answers.future_priority;
  const detail = voice.futureDetailOptions[priority];
  if (detail) {
    optionValue(detail.aOptions, "future_detail_a");
    optionValue(detail.bOptions, "future_detail_b");
  } else if (values.future_detail_a !== "" || values.future_detail_b !== "") structurallyInvalid = true;
  textValue("future_detail_other", voice.otherMaxLength);
  if (priority !== "other" && answers.future_detail_other) structurallyInvalid = true;
  const compareRequired = current && hasConcreteProblem && futureIds.includes(priority);
  const comparison = typeof values.improvement_vs_candidate === "string" &&
    ["improvement", "candidate", "tie"].includes(values.improvement_vs_candidate)
    ? values.improvement_vs_candidate : "";
  if (compareRequired && !comparison) missing.push("improvement_vs_candidate");
  if (!compareRequired && values.improvement_vs_candidate !== "") structurallyInvalid = true;
  answers.improvement_vs_candidate = compareRequired ? comparison : "";

  if (!idsEqual(values.feature_display_order, featureIds)) structurallyInvalid = true;
  else answers.feature_display_order = [...values.feature_display_order];
  if (!idsEqual(values.future_display_order, futureIds)) structurallyInvalid = true;
  else answers.future_display_order = [...values.future_display_order];

  const noteValues = objectValue(values.answer_notes);
  if (!exactKeys(noteValues, VOICE_V5_ANSWER_NOTE_KEYS) ||
    Object.keys(noteValues).length !== VOICE_V5_ANSWER_NOTE_KEYS.length) structurallyInvalid = true;
  const activeNotes = new Set([
    "play_frequency_1m", ...(playedRecently ? ["primary_play_device_1m"] : []), "usage_1m",
    ...(hasExperience ? ["overall_satisfaction", "valuable_features", "unused_features"] : []),
    "info_seek_days_1m", "recording_preference", ...(dormant ? ["dormant_reason"] : hasExperience ? ["primary_problem"] : []),
    ...(hasConcreteProblem && !dormant ? ["problem_outcome"] : []), "future_role", "future_candidates",
    ...(rankable.length ? ["future_priority"] : []), ...(detail ? ["future_detail_a", "future_detail_b"] : []),
    ...(compareRequired ? ["improvement_vs_candidate"] : []),
  ]);
  for (const key of VOICE_V5_ANSWER_NOTE_KEYS) {
    const note = cleanVoiceV5Text(noteValues[key] ?? "", voice.answerNoteMaxLength);
    if (note === null || (!activeNotes.has(key) && note)) structurallyInvalid = true;
    answers.answer_notes[key] = activeNotes.has(key) && note ? note : "";
  }
  return { answers, missing: [...new Set(missing)], structurallyInvalid };
}

export function updateOrderedSelection(current, index, value, maxLength) {
  const previous = Array.isArray(current) ? current.slice(0, maxLength) : [];
  if (!Number.isInteger(index) || index < 0 || index >= maxLength) return previous;
  if (index > 0 && !previous[index - 1]) return previous.slice(0, index);
  if (!value) return previous.slice(0, index);
  const next = previous.slice();
  next[index] = value;
  const duplicateAbove = next.slice(0, index).includes(value);
  if (duplicateAbove) return next.slice(0, index);
  const duplicateBelow = next.findIndex((item, itemIndex) => itemIndex > index && item === value);
  return (duplicateBelow >= 0 ? next.slice(0, duplicateBelow) : next).slice(0, maxLength);
}

export function classifySubmitConflict(payload) {
  return payload?.error?.code === "ALREADY_SUBMITTED_CONFLICT"
    ? "answers_conflict"
    : "submit_failed";
}

export function parseSubmitResult(payload) {
  if (!payload || typeof payload !== "object") throw new SurveyContractError("invalid payload");
  if (
    payload.status !== "ok" ||
    !payload.submission ||
    typeof payload.submission.already_submitted !== "boolean"
  ) {
    throw new SurveyContractError("invalid submit status");
  }
  return {
    status: payload.submission.already_submitted ? "already_answered" : "submitted",
    titleAwarded: payload.reward?.awarded === true,
    titleName: text(payload.reward?.name_ja, 200),
  };
}

export function validateAnswers(questions, values) {
  const answers = {};
  const missing = [];
  for (const question of questions) {
    const value = values[question.id];
    if (question.type === "multiple_choice") {
      const selected = Array.isArray(value)
        ? value.filter((item) => question.options.some((option) => option.value === item))
        : [];
      if (question.required && selected.length === 0) missing.push(question.id);
      if (selected.length > 0) answers[question.id] = [...new Set(selected)];
      continue;
    }
    if (question.type === "single_choice") {
      const selected = question.options.some((option) => option.value === value) ? value : "";
      if (question.required && !selected) missing.push(question.id);
      if (selected) answers[question.id] = selected;
      continue;
    }
    const entered = typeof value === "string" ? value.trim().slice(0, question.maxLength) : "";
    if (question.required && !entered) missing.push(question.id);
    if (entered) answers[question.id] = entered;
  }
  return { answers, missing };
}
