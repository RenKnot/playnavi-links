import {
  classifySubmitConflict,
  parseSubmitResult,
  parseSurveyRead,
  parseSurveyPreview,
  updateOrderedSelection,
  validateAnswers,
  validateVoiceAnswers,
  validateVoiceV3Answers,
} from "./survey-contract.mjs";

const elements = {
  linkView: document.getElementById("link-view"),
  view: document.getElementById("survey-view"),
  loading: document.getElementById("survey-loading"),
  title: document.getElementById("survey-title"),
  description: document.getElementById("survey-description"),
  login: document.getElementById("survey-login"),
  google: document.getElementById("google-login"),
  apple: document.getElementById("apple-login"),
  guest: document.getElementById("guest-login"),
  guide: document.getElementById("survey-guide"),
  form: document.getElementById("survey-form"),
  questions: document.getElementById("survey-questions"),
  step: document.getElementById("survey-step"),
  progressLabel: document.getElementById("survey-progress-label"),
  progressTrack: document.getElementById("survey-progress-track"),
  progressBar: document.getElementById("survey-progress-bar"),
  back: document.getElementById("survey-back"),
  next: document.getElementById("survey-next"),
  error: document.getElementById("survey-error"),
  submit: document.getElementById("survey-submit"),
  result: document.getElementById("survey-result"),
  resultIcon: document.getElementById("result-icon"),
  resultHeading: document.getElementById("result-heading"),
  resultDescription: document.getElementById("result-description"),
  reward: document.getElementById("title-reward"),
  titleName: document.getElementById("title-name"),
  retry: document.getElementById("survey-retry"),
};

const setVisible = (element, visible) => element?.classList.toggle("hidden", !visible);
const draftKey = (slug) => `pn_survey_draft:${slug}`;
const submissionTokenKey = (slug) => `pn_survey_submission:${slug}`;
const QUESTIONS_PER_STEP = 4;
const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
const compactPriorityLabels = ["最優先", "優先", "急がない", "現状", "不明"];
let lastPointerInteractionAt = 0;

window.addEventListener("pointerdown", () => {
  lastPointerInteractionAt = Date.now();
}, { capture: true, passive: true });
window.addEventListener("keydown", () => {
  lastPointerInteractionAt = 0;
}, { capture: true });

function setPage({ title, description, loading = false, descriptionTone = "default" }) {
  if (elements.title) elements.title.textContent = title;
  if (elements.description) {
    elements.description.textContent = description;
    elements.description.classList.toggle("auth-warning", descriptionTone === "warning");
    if (descriptionTone === "warning") elements.description.setAttribute("role", "alert");
    else elements.description.removeAttribute("role");
  }
  setVisible(elements.loading, loading);
}

function hideStates() {
  elements.view?.classList.remove("survey-in-progress");
  for (const element of [elements.login, elements.form, elements.result, elements.retry]) {
    setVisible(element, false);
  }
}

function showLogin(slug, preview, failed = false) {
  hideStates();
  setPage({
    title: preview?.title || "アンケート",
    description: failed
      ? "ログインを完了できませんでした。PlayNaviで利用しているアカウントでもう一度お試しください。"
      : "",
    descriptionTone: failed ? "warning" : "default",
  });
  if (elements.guide) {
    elements.guide.textContent = preview?.description || "";
    setVisible(elements.guide, Boolean(preview?.description));
  }
  const returnTo = `/surveys/${slug}`;
  if (elements.google) {
    elements.google.href = `/api/auth/start?provider=google&returnTo=${encodeURIComponent(returnTo)}`;
  }
  if (elements.apple) {
    elements.apple.href = `/api/auth/start?provider=apple&returnTo=${encodeURIComponent(returnTo)}`;
  }
  if (elements.guest) {
    elements.guest.onclick = () => createGuestSession(slug, elements.guest);
  }
  setVisible(elements.login, true);
}

async function createGuestSession(slug, button) {
  button.disabled = true;
  try {
    const response = await fetch("/api/survey/session/guest", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      body: JSON.stringify({ survey_slug: slug }),
    });
    if (!response.ok) throw new Error("guest session failed");
    return loadSurvey(slug);
  } catch {
    return showUnavailable(() => loadSurvey(slug));
  } finally {
    button.disabled = false;
  }
}

function showUnavailable(retry, message = "一時的にアンケートを開けません。時間をおいてもう一度お試しください。") {
  hideStates();
  setPage({ title: "アンケートを開けません", description: message });
  if (elements.retry) elements.retry.onclick = retry;
  setVisible(elements.retry, true);
}

function showResult(result) {
  hideStates();
  const closed = result.status === "closed";
  const already = result.status === "already_answered";
  setPage({
    title: closed ? "アンケートは終了しました" : "回答ありがとうございました",
    description: closed ? "このアンケートの受付は終了しています。" : "回答を受け付けました。",
  });
  if (elements.resultIcon) elements.resultIcon.textContent = closed ? "–" : "✓";
  if (elements.resultHeading) {
    elements.resultHeading.textContent = closed
      ? "受付終了"
      : already
        ? "回答済みです"
        : "回答ありがとうございました";
  }
  if (elements.resultDescription) {
    elements.resultDescription.textContent = closed
      ? "ご協力ありがとうございました。"
      : already
        ? "このアンケートへの回答はすでに完了しています。"
        : "ご協力ありがとうございました。";
  }
  const hasReward = result.titleAwarded && result.titleName;
  if (hasReward && elements.titleName) elements.titleName.textContent = result.titleName;
  setVisible(elements.reward, Boolean(hasReward));
  setVisible(elements.result, true);
}

function readDraft(slug) {
  try {
    const value = JSON.parse(sessionStorage.getItem(draftKey(slug)) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function saveDraft(slug, values) {
  try {
    sessionStorage.setItem(draftKey(slug), JSON.stringify(values));
  } catch {
    // Draft persistence is a convenience; private browsing may disable it.
  }
}

function clearDraft(slug) {
  try {
    sessionStorage.removeItem(draftKey(slug));
    sessionStorage.removeItem(submissionTokenKey(slug));
  } catch {
    // No action needed.
  }
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function legacySubmissionToken(slug) {
  try {
    const existing = sessionStorage.getItem(submissionTokenKey(slug));
    if (existing && /^[A-Za-z0-9_-]{43}$/.test(existing)) return existing;
    const created = randomToken();
    sessionStorage.setItem(submissionTokenKey(slug), created);
    return created;
  } catch {
    return randomToken();
  }
}

function shuffled(values) {
  const result = [...values];
  const random = new Uint32Array(Math.max(1, result.length));
  crypto.getRandomValues(random);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = random[index] % (index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function saveVoiceV3Draft(slug, submissionToken, values) {
  try {
    sessionStorage.setItem(draftKey(slug), JSON.stringify({
      schema_version: 3,
      submission_token: submissionToken,
      values,
    }));
  } catch {
    // Draft persistence is a convenience; private browsing may disable it.
  }
}

function choiceInput(question, option, value, onChange) {
  const label = document.createElement("label");
  label.className = "choice";
  const input = document.createElement("input");
  input.type = question.type === "single_choice" ? "radio" : "checkbox";
  input.name = `question-${question.id}`;
  input.value = option.value;
  input.checked = question.type === "single_choice"
    ? value === option.value
    : Array.isArray(value) && value.includes(option.value);
  input.addEventListener("change", onChange);
  const text = document.createElement("span");
  text.textContent = option.label;
  label.append(input, text);
  return label;
}

function renderQuestions(slug, survey) {
  const values = readDraft(slug);
  elements.questions.replaceChildren();

  const updateDraft = () => saveDraft(slug, values);
  const pages = [];
  for (let offset = 0; offset < survey.questions.length; offset += QUESTIONS_PER_STEP) {
    const pageQuestions = survey.questions.slice(offset, offset + QUESTIONS_PER_STEP);
    const page = document.createElement("section");
    page.className = "survey-step-page";
    page.dataset.step = String(pages.length);
    page.hidden = pages.length !== 0;
    pages.push({ element: page, questions: pageQuestions });

    for (const question of pageQuestions) {
      const fieldset = document.createElement("fieldset");
      fieldset.className = "question question-card";
      fieldset.dataset.questionId = question.id;
      const legend = document.createElement("legend");
      legend.textContent = question.prompt;
      if (question.required) {
        const required = document.createElement("span");
        required.className = "required";
        required.textContent = "必須";
        legend.append(required);
      }
      fieldset.append(legend);

      if (question.type === "short_text") {
        const input = document.createElement("textarea");
        input.maxLength = question.maxLength;
        input.value = typeof values[question.id] === "string" ? values[question.id] : "";
        input.addEventListener("input", () => {
          values[question.id] = input.value;
          updateDraft();
        });
        const hint = document.createElement("p");
        hint.className = "hint";
        const updateCount = () => {
          hint.textContent = `${input.value.length} / ${question.maxLength}文字`;
        };
        updateCount();
        input.addEventListener("input", updateCount);
        fieldset.append(input, hint);
      } else {
        for (const option of question.options) {
          const input = choiceInput(question, option, values[question.id], (event) => {
            if (question.type === "single_choice") {
              values[question.id] = event.currentTarget.value;
            } else {
              const selected = new Set(Array.isArray(values[question.id]) ? values[question.id] : []);
              event.currentTarget.checked
                ? selected.add(event.currentTarget.value)
                : selected.delete(event.currentTarget.value);
              values[question.id] = [...selected];
            }
            updateDraft();
          });
          fieldset.append(input);
        }
      }
      page.append(fieldset);
    }
    elements.questions.append(page);
  }
  return { values, pages };
}

function missingOnPage(page, values) {
  return validateAnswers(page.questions, values).missing;
}

function markMissing(missing) {
  for (const fieldset of elements.questions.querySelectorAll(".question")) {
    fieldset.removeAttribute("aria-invalid");
    fieldset.removeAttribute("aria-describedby");
  }
  for (const id of missing) {
    const fieldset = elements.questions.querySelector(`[data-question-id="${CSS.escape(id)}"]`);
    fieldset?.setAttribute("aria-invalid", "true");
    fieldset?.setAttribute("aria-describedby", "survey-error");
  }
}

function focusQuestion(id) {
  const fieldset = elements.questions.querySelector(
    `[data-question-id="${CSS.escape(id)}"]`,
  );
  fieldset?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
  fieldset?.querySelector("input, textarea")?.focus({ preventScroll: true });
}

function createStepController(pages, values) {
  let current = 0;
  const show = (index) => {
    current = Math.max(0, Math.min(index, pages.length - 1));
    pages.forEach((page, pageIndex) => {
      page.element.hidden = pageIndex !== current;
    });
    const stepNumber = current + 1;
    if (elements.step) elements.step.textContent = `${stepNumber} / ${pages.length}`;
    if (elements.progressLabel) {
      elements.progressLabel.textContent = current === pages.length - 1
        ? "最後のステップ"
        : "回答の進捗";
    }
    if (elements.progressBar) {
      elements.progressBar.style.width = `${Math.round((stepNumber / pages.length) * 100)}%`;
    }
    elements.progressTrack?.setAttribute("aria-valuemax", String(pages.length));
    elements.progressTrack?.setAttribute("aria-valuenow", String(stepNumber));
    setVisible(elements.back, current > 0);
    setVisible(elements.next, current < pages.length - 1);
    setVisible(elements.submit, current === pages.length - 1);
    elements.error.textContent = "";
    setVisible(elements.error, false);
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  };

  elements.back.onclick = () => show(current - 1);
  elements.next.onclick = () => {
    const missing = missingOnPage(pages[current], values);
    markMissing(missing);
    if (missing.length > 0) {
      elements.error.textContent = "この画面の必須項目に回答してください。";
      setVisible(elements.error, true);
      focusQuestion(missing[0]);
      return;
    }
    show(current + 1);
  };
  show(0);
  return { show };
}

function voiceValues(slug, voice) {
  const draft = readDraft(slug);
  const featureIds = new Set(voice.features.map((feature) => feature.id));
  const categoryIds = new Set(voice.categories.map((category) => category.id));
  const priorities = draft.feature_priorities && typeof draft.feature_priorities === "object"
    ? Object.fromEntries(Object.entries(draft.feature_priorities).filter(([id]) => featureIds.has(id)))
    : {};
  const comments = draft.feature_comments && typeof draft.feature_comments === "object"
    ? Object.fromEntries(Object.entries(draft.feature_comments).filter(([id]) => featureIds.has(id)))
    : {};
  const categoryTop = [];
  if (Array.isArray(draft.category_top)) {
    for (const id of draft.category_top.slice(0, 2)) {
      if (!categoryIds.has(id) || categoryTop.includes(id)) break;
      categoryTop.push(id);
    }
  }
  const detailIds = new Set(voice.categories
    .filter((category) => categoryTop.includes(category.id))
    .flatMap((category) => category.features.map((feature) => feature.id)));
  const details = draft.feature_details && typeof draft.feature_details === "object"
    ? Object.fromEntries(Object.entries(draft.feature_details).filter(([id]) => detailIds.has(id)))
    : {};
  const futureIds = new Set(voice.futureOptions.map((option) => option.id));
  return {
    usage_frequency: typeof draft.usage_frequency === "string" ? draft.usage_frequency : "",
    overall_satisfaction: typeof draft.overall_satisfaction === "string" ? draft.overall_satisfaction : "",
    feature_priorities: priorities,
    feature_comments: comments,
    category_top: categoryTop,
    feature_details: details,
    future_interest: typeof draft.future_interest === "string" ? draft.future_interest : "",
    future_top: (() => {
      const ordered = [];
      if (!Array.isArray(draft.future_top)) return ordered;
      for (const id of draft.future_top.slice(0, 3)) {
        if (!futureIds.has(id) || ordered.includes(id)) break;
        ordered.push(id);
      }
      return ordered;
    })(),
  };
}

function appendRequired(legend) {
  const required = document.createElement("span");
  required.className = "required";
  required.textContent = "必須";
  legend.append(required);
}

function voiceFieldset(errorId, label, { required = true, className = "" } = {}) {
  const fieldset = document.createElement("fieldset");
  fieldset.className = `question question-card ${className}`.trim();
  fieldset.dataset.errorId = errorId;
  fieldset.dataset.required = String(required);
  const legend = document.createElement("legend");
  legend.textContent = label;
  if (required) appendRequired(legend);
  fieldset.append(legend);
  return fieldset;
}

function fieldsetHasAnswer(fieldset) {
  const radio = fieldset.querySelector('input[type="radio"]:checked');
  if (radio) return true;
  if (fieldset.querySelector('[aria-pressed="true"]')) return true;
  const select = fieldset.querySelector("select");
  if (select) return select.disabled || Boolean(select.value);
  return false;
}

function moveToVoiceTarget(target) {
  if (!target) return;
  target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
  const control = target.matches?.("button, input, select, textarea, [tabindex]")
    ? target
    : target.querySelector?.("input, select, textarea, button, [tabindex]");
  control?.focus({ preventScroll: true });
}

function moveToNextVoiceQuestion(currentErrorId) {
  // Preserve native radio/select keyboard behavior. Automatic movement is a
  // convenience for taps/clicks, while keyboard and assistive-tech users keep
  // explicit control of focus with Tab/arrow keys.
  if (Date.now() - lastPointerInteractionAt > 3000) return;
  // Let callbacks finish any small DOM rebuild (rank selectors) before resolving
  // the next target. One tap should lead naturally to the next unanswered item.
  window.requestAnimationFrame(() => {
    const fields = [...elements.questions.querySelectorAll("[data-error-id]")];
    const current = fields.findIndex((field) => field.dataset.errorId === currentErrorId);
    const next = fields.slice(Math.max(0, current + 1)).find((field) => !fieldsetHasAnswer(field));
    if (next) {
      moveToVoiceTarget(next);
      return;
    }
    elements.next?.classList.add("ready");
    moveToVoiceTarget(elements.next);
    window.setTimeout(() => elements.next?.classList.remove("ready"), 700);
  });
}

function voiceChoiceGroup(fieldset, name, options, value, onChange, compact = false, className = "") {
  const choices = document.createElement("div");
  choices.className = `${compact ? "choice-grid compact-options" : "choice-grid"} ${className}`.trim();
  options.forEach((option, index) => {
    const label = document.createElement("label");
    label.className = "choice";
    if (compact) label.title = option.label;
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = option.id;
    input.checked = value === option.id;
    if (compact) input.setAttribute("aria-label", option.label);
    input.addEventListener("change", () => {
      onChange(option.id);
      moveToNextVoiceQuestion(fieldset.dataset.errorId);
    });
    const copy = document.createElement("span");
    if (compact) {
      copy.className = "rating-copy";
      const number = document.createElement("span");
      number.className = "rating-number";
      number.textContent = String(index + 1);
      const shortLabel = document.createElement("span");
      shortLabel.className = "rating-label";
      shortLabel.textContent = compactPriorityLabels[index] || option.label;
      copy.append(number, shortLabel);
    } else {
      copy.textContent = option.label;
    }
    label.append(input, copy);
    choices.append(label);
  });
  fieldset.append(choices);
}

function voiceScaleKey(options) {
  const key = document.createElement("ol");
  key.className = "scale-key";
  options.forEach((option, index) => {
    const item = document.createElement("li");
    item.textContent = `${index + 1}: ${option.label}`;
    key.append(item);
  });
  return key;
}

function voiceComment(feature, values, save, reused = false) {
  const details = document.createElement("details");
  details.className = "comment-details";
  const summary = document.createElement("summary");
  summary.textContent = reused
    ? "ひとこと要望を確認・編集（任意）"
    : "ひとこと要望を書く（任意）";
  const textarea = document.createElement("textarea");
  textarea.maxLength = 200;
  textarea.rows = 3;
  textarea.value = typeof values.feature_comments[feature.id] === "string"
    ? values.feature_comments[feature.id]
    : "";
  const count = document.createElement("span");
  count.className = "hint comment-count";
  const updateCount = () => { count.textContent = `${textarea.value.length} / 200文字`; };
  textarea.addEventListener("input", () => {
    values.feature_comments[feature.id] = textarea.value;
    updateCount();
    save();
  });
  updateCount();
  if (textarea.value) details.open = true;
  details.append(summary, textarea, count);
  return details;
}

function pageIntro() {
  const section = document.createElement("section");
  section.className = "voice-intro question-card";
  const heading = document.createElement("h2");
  heading.tabIndex = -1;
  heading.textContent = "ご回答の前に";
  const copy = document.createElement("p");
  copy.textContent = "選択式の質問が中心です。タップすると次の未回答項目へ進みます。";
  const list = document.createElement("ul");
  for (const message of [
    "全26機能は、各機能につき1回のタップで回答できます",
    "任意コメントを書かなくても、回答完了と称号の受取に影響しません",
    "入力内容はこの端末のタブ内に一時保存されます",
  ]) {
    const item = document.createElement("li");
    item.textContent = message;
    list.append(item);
  }
  section.append(heading, copy, list);
  return section;
}

function voiceTapRanking(errorId, labelText, options, selected, maxLength, onChange) {
  const fieldset = voiceFieldset(errorId, labelText, { className: "ranking-card" });
  const hint = document.createElement("p");
  hint.className = "ranking-hint";
  hint.textContent = `候補を希望順にタップ（最大${maxLength}件）。選択済みを再タップすると、その順位以降を解除します。`;
  const choices = document.createElement("div");
  choices.className = "ranking-options";
  for (const option of options) {
    const rankIndex = selected.indexOf(option.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ranking-option";
    button.dataset.optionId = option.id;
    button.disabled = rankIndex < 0 && selected.length >= maxLength;
    button.setAttribute("aria-pressed", String(rankIndex >= 0));
    button.setAttribute("aria-label", rankIndex >= 0
      ? `${option.label}、${rankIndex + 1}位。再タップでこの順位以降を解除`
      : `${option.label}、未選択`);
    const label = document.createElement("span");
    label.className = "ranking-option-copy";
    label.textContent = option.label;
    if (option.description) {
      const description = document.createElement("small");
      description.textContent = option.description;
      label.append(description);
    }
    const badge = document.createElement("span");
    badge.className = "rank-badge";
    badge.textContent = rankIndex >= 0 ? `${rankIndex + 1}位` : "+";
    button.append(label, badge);
    button.addEventListener("click", () => {
      const next = rankIndex >= 0
        ? updateOrderedSelection(selected, rankIndex, "", maxLength)
        : updateOrderedSelection(selected, selected.length, option.id, maxLength);
      if (next.length === selected.length && next.every((id, index) => id === selected[index])) return;
      onChange(next, option.id);
    });
    choices.append(button);
  }
  fieldset.append(hint, choices);
  return fieldset;
}

function voicePageTitle(title, description = "") {
  const fragment = document.createDocumentFragment();
  const heading = document.createElement("h2");
  heading.className = "voice-page-title";
  heading.tabIndex = -1;
  heading.textContent = title;
  fragment.append(heading);
  if (description) {
    const copy = document.createElement("p");
    copy.className = "voice-page-description";
    copy.textContent = description;
    fragment.append(copy);
  }
  return fragment;
}

function pruneVoiceDetails(voice, values) {
  const allowed = new Set(voice.categories
    .filter((category) => values.category_top.includes(category.id))
    .flatMap((category) => category.features.map((feature) => feature.id)));
  for (const featureId of Object.keys(values.feature_details)) {
    if (!allowed.has(featureId)) delete values.feature_details[featureId];
  }
}

function buildVoicePages(slug, survey, values) {
  const { voice } = survey;
  const save = () => saveDraft(slug, values);
  const pages = [
    {
      key: "intro",
      render: (page) => page.append(pageIntro()),
      validate: () => [],
    },
    {
      key: "basic",
      render: (page) => {
        page.append(voicePageTitle("まず、普段の利用について", "近いものを1つずつ選んでください。"));
        const usage = voiceFieldset("usage_frequency", "PlayNaviの利用頻度");
        voiceChoiceGroup(usage, "usage-frequency", voice.usageOptions, values.usage_frequency, (id) => {
          values.usage_frequency = id;
          save();
        });
        const satisfaction = voiceFieldset("overall_satisfaction", "PlayNavi全体への満足度");
        voiceChoiceGroup(satisfaction, "overall-satisfaction", voice.overallSatisfactionOptions, values.overall_satisfaction, (id) => {
          values.overall_satisfaction = id;
          save();
        });
        page.append(usage, satisfaction);
      },
      validate: () => validateVoiceAnswers(voice, values).missing
        .filter((id) => ["usage_frequency", "overall_satisfaction"].includes(id)),
    },
  ];

  voice.categories.forEach((category, categoryIndex) => {
    pages.push({
      key: `category:${category.id}`,
      render: (page) => {
        page.append(voicePageTitle(
          `${categoryIndex + 1}. ${category.label}`,
          "今後の改善・強化の優先度を、各機能1タップで選んでください。",
        ));
        page.append(voiceScaleKey(voice.priorityOptions));
        for (const feature of category.features) {
          const fieldset = voiceFieldset(`priority:${feature.id}`, feature.label, { className: "feature-card" });
          voiceChoiceGroup(
            fieldset,
            `priority-${feature.id}`,
            voice.priorityOptions,
            values.feature_priorities[feature.id],
            (id) => {
              values.feature_priorities[feature.id] = id;
              save();
            },
            true,
          );
          fieldset.append(voiceComment(feature, values, save));
          page.append(fieldset);
        }
      },
      validate: () => validateVoiceAnswers(voice, values).missing
        .filter((id) => category.features.some((feature) => id === `priority:${feature.id}`)),
    });
  });

  pages.push({
    key: "category_top",
    render: (page) => {
      page.append(voicePageTitle("力を入れてほしいカテゴリ", "1位は必須、2位は任意です。すべてを順位付けする必要はありません。"));
      const options = voice.categories.map(({ id, label }) => ({ id, label }));
      const rankings = document.createElement("div");
      rankings.className = "category-rankings";
      const renderRankings = (focusOptionId = "") => {
        rankings.replaceChildren(voiceTapRanking(
          "category_top:0",
          "希望するカテゴリ",
          options,
          values.category_top,
          2,
          (next, changedOptionId) => {
            values.category_top = next;
            pruneVoiceDetails(voice, values);
            save();
            renderRankings(changedOptionId);
          },
        ));
        if (focusOptionId) {
          rankings.querySelector(`[data-option-id="${CSS.escape(focusOptionId)}"]`)?.focus();
        }
      };
      page.append(rankings);
      renderRankings();
    },
    validate: () => {
      const missing = [];
      if (!values.category_top[0]) missing.push("category_top:0");
      if (values.category_top[0] && values.category_top[0] === values.category_top[1]) {
        missing.push("category_top:1");
      }
      return missing;
    },
  });

  for (const categoryId of values.category_top) {
    const category = voice.categories.find((item) => item.id === categoryId);
    if (!category) continue;
    pages.push({
      key: `detail:${category.id}`,
      render: (page) => {
        page.append(voicePageTitle(`${category.label}を詳しく`, "選んだカテゴリだけ、重要度と現在の満足度を教えてください。"));
        for (const feature of category.features) {
          const detail = values.feature_details[feature.id] || {};
          values.feature_details[feature.id] = detail;
          const card = document.createElement("section");
          card.className = "detail-feature question-card";
          const heading = document.createElement("h3");
          heading.textContent = feature.label;
          const importance = voiceFieldset(`importance:${feature.id}`, "あなたにとっての重要度", { className: "nested-question" });
          voiceChoiceGroup(
            importance,
            `importance-${feature.id}`,
            voice.importanceOptions,
            detail.importance,
            (id) => {
              detail.importance = id;
              save();
            },
            false,
            "detail-options",
          );
          const satisfaction = voiceFieldset(`satisfaction:${feature.id}`, "現在の満足度", { className: "nested-question" });
          voiceChoiceGroup(
            satisfaction,
            `satisfaction-${feature.id}`,
            voice.detailSatisfactionOptions,
            detail.satisfaction,
            (id) => {
              detail.satisfaction = id;
              save();
            },
            false,
            "detail-options",
          );
          card.append(heading, importance, satisfaction, voiceComment(feature, values, save, true));
          page.append(card);
        }
      },
      validate: () => validateVoiceAnswers(voice, values).missing.filter((id) =>
        category.features.some((feature) => id === `importance:${feature.id}` || id === `satisfaction:${feature.id}`)
      ),
    });
  }

  pages.push({
    key: "future",
    render: (page) => {
      page.append(voicePageTitle("これから期待する機能", "期待する候補がある場合だけ、最大3つまで順位を選べます。"));
      const interest = voiceFieldset("future_interest", "期待する機能はありますか？");
      voiceChoiceGroup(interest, "future-interest", [
        { id: "yes", label: "ある" },
        { id: "none", label: "今はない" },
        { id: "unsure", label: "判断できない" },
      ], values.future_interest, (id) => {
        values.future_interest = id;
        if (id !== "yes") values.future_top = [];
        save();
        renderRankings();
      });
      const rankings = document.createElement("div");
      rankings.className = "future-rankings";
      const renderRankings = (focusOptionId = "") => {
        rankings.replaceChildren();
        setVisible(rankings, values.future_interest === "yes");
        if (values.future_interest !== "yes") return;
        rankings.append(voiceTapRanking(
          "future_top:0",
          "期待する機能",
          voice.futureOptions,
          values.future_top,
          3,
          (next, changedOptionId) => {
            values.future_top = next;
            save();
            renderRankings(changedOptionId);
          },
        ));
        if (focusOptionId) {
          rankings.querySelector(`[data-option-id="${CSS.escape(focusOptionId)}"]`)?.focus();
        }
      };
      page.append(interest, rankings);
      renderRankings();
    },
    validate: () => {
      const missing = [];
      if (!["yes", "none", "unsure"].includes(values.future_interest)) missing.push("future_interest");
      if (values.future_interest === "yes") {
        if (!values.future_top[0]) missing.push("future_top:0");
        if (new Set(values.future_top).size !== values.future_top.length) {
          const duplicateIndex = values.future_top.findIndex((id, index) => id && values.future_top.indexOf(id) !== index);
          missing.push(`future_top:${Math.max(1, duplicateIndex)}`);
        }
      }
      return missing;
    },
  });

  pages.push({
    key: "review",
    render: (page) => {
      page.append(voicePageTitle("回答内容の確認", "入力は完了です。送信前に、回答漏れがないことを確認しました。"));
      const review = document.createElement("section");
      review.className = "review-card question-card";
      const answered = document.createElement("strong");
      answered.textContent = "26機能の優先度をすべて回答済み";
      const categories = document.createElement("p");
      categories.textContent = `重点カテゴリ: ${values.category_top.map((id) => voice.categories.find((item) => item.id === id)?.label).join("、")}`;
      const future = document.createElement("p");
      future.textContent = values.future_interest === "yes"
        ? `将来機能Top${values.future_top.length}: ${values.future_top.map((id) => voice.futureOptions.find((item) => item.id === id)?.label).join("、")}`
        : "将来機能: 順位選択なし";
      const note = document.createElement("p");
      note.textContent = "「回答を送信」を押すまで、回答はサーバーへ送られません。";
      review.append(answered, categories, future, note);
      page.append(review);
    },
    validate: () => [],
  });
  return pages;
}

function voiceV3Values(slug, voice) {
  const stored = readDraft(slug);
  const source = stored.schema_version === 3 && stored.values && typeof stored.values === "object"
    ? stored.values
    : {};
  const featureIds = voice.features.map((feature) => feature.id);
  const futureIds = voice.futureOptions.map((option) => option.id);
  const exactOrder = (value, expected) => Array.isArray(value) && value.length === expected.length &&
    new Set(value).size === expected.length && value.every((id) => expected.includes(id));
  const string = (key) => typeof source[key] === "string" ? source[key] : "";
  const exactSelection = (key, allowed, exclusive, maxLength) => {
    const selected = source[key];
    if (
      !Array.isArray(selected) || selected.length > maxLength ||
      new Set(selected).size !== selected.length || selected.some((id) => !allowed.includes(id)) ||
      (selected.some((id) => exclusive.includes(id)) && selected.length !== 1)
    ) return [];
    return [...selected];
  };
  const q4ExclusiveIds = voice.q4ExclusiveOptions.map(({ id }) => id);
  const futureExclusiveIds = voice.futureExclusiveOptions.map(({ id }) => id);
  const values = {
    usage_30d: string("usage_30d"),
    overall_satisfaction: string("overall_satisfaction"),
    unprompted_need: string("unprompted_need"),
    valuable_features: exactSelection(
      "valuable_features", [...featureIds, ...q4ExclusiveIds], q4ExclusiveIds, voice.valuableFeatureMax,
    ),
    unused_feature: string("unused_feature"),
    unused_reason: string("unused_reason"),
    primary_problem: string("primary_problem"),
    dormant_reason: string("dormant_reason"),
    problem_comment: string("problem_comment"),
    problem_outcome: string("problem_outcome"),
    future_role: string("future_role"),
    future_role_other: string("future_role_other"),
    future_candidates: exactSelection(
      "future_candidates", [...futureIds, "other", ...futureExclusiveIds], futureExclusiveIds, voice.futureCandidateMax,
    ),
    future_other: string("future_other"),
    future_priority: string("future_priority"),
    future_priority_mode: string("future_priority_mode"),
    future_detail_a: string("future_detail_a"),
    future_detail_b: string("future_detail_b"),
    future_detail_other: string("future_detail_other"),
    improvement_vs_candidate: string("improvement_vs_candidate"),
    feature_display_order: exactOrder(source.feature_display_order, featureIds)
      ? [...source.feature_display_order] : shuffled(featureIds),
    future_display_order: exactOrder(source.future_display_order, futureIds)
      ? [...source.future_display_order] : shuffled(futureIds),
  };
  const submissionToken = typeof stored.submission_token === "string" && /^[A-Za-z0-9_-]{43}$/.test(stored.submission_token)
    ? stored.submission_token
    : randomToken();
  return { values, submissionToken };
}

const experiencedUsage = (usage) => Boolean(usage) && usage !== "never_used";
const currentUsage = (usage) => ["days_15_plus", "days_5_14", "days_1_4"].includes(usage);
const concreteProblem = (problem) => Boolean(problem) && !["none", "unknown"].includes(problem);

function pruneVoiceV3(voice, values, previousPriority = values.future_priority) {
  const hasExperience = experiencedUsage(values.usage_30d);
  const dormant = values.usage_30d === "inactive_30d";
  if (!hasExperience) {
    values.overall_satisfaction = "";
    values.valuable_features = [];
    values.unused_feature = "";
    values.unused_reason = "";
    values.primary_problem = "";
    values.dormant_reason = "";
    values.problem_comment = "";
    values.problem_outcome = "";
  } else if (dormant) {
    values.primary_problem = "";
    values.problem_comment = "";
    values.problem_outcome = "";
  } else {
    values.dormant_reason = "";
    if (!concreteProblem(values.primary_problem)) {
      values.problem_comment = "";
      values.problem_outcome = "";
    }
  }
  if (!values.unused_feature) values.unused_reason = "";
  if (values.future_role !== "other") values.future_role_other = "";
  if (!values.future_candidates.includes("other")) values.future_other = "";
  const futureIds = new Set(voice.futureOptions.map((option) => option.id));
  const rankable = values.future_candidates.filter((id) => futureIds.has(id) || id === "other");
  if (rankable.length === 1) {
    values.future_priority = rankable[0];
    values.future_priority_mode = "inherited";
  } else if (rankable.length > 1) {
    if (!rankable.includes(values.future_priority)) values.future_priority = "";
    values.future_priority_mode = "explicit";
  } else {
    values.future_priority = "";
    values.future_priority_mode = "";
  }
  if (previousPriority !== values.future_priority) {
    values.future_detail_a = "";
    values.future_detail_b = "";
    values.future_detail_other = "";
    values.improvement_vs_candidate = "";
  }
  if (values.future_priority !== "other") values.future_detail_other = "";
  if (!currentUsage(values.usage_30d) || !concreteProblem(values.primary_problem) || !futureIds.has(values.future_priority)) {
    values.improvement_vs_candidate = "";
  }
}

function voiceTextarea(fieldset, value, maxLength, onInput, rows = 3) {
  const textarea = document.createElement("textarea");
  textarea.maxLength = maxLength;
  textarea.rows = rows;
  textarea.value = value;
  const count = document.createElement("span");
  count.className = "hint comment-count";
  const update = () => { count.textContent = `${textarea.value.length} / ${maxLength}文字`; };
  textarea.addEventListener("input", () => {
    onInput(textarea.value);
    update();
  });
  update();
  fieldset.append(textarea, count);
}

function v3ChoiceGroup(fieldset, name, options, value, onChange) {
  const choices = document.createElement("div");
  choices.className = "choice-grid";
  for (const option of options) {
    const label = document.createElement("label");
    label.className = "choice described-choice";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = option.id;
    input.checked = value === option.id;
    input.addEventListener("change", () => {
      onChange(option.id);
      moveToNextVoiceQuestion(fieldset.dataset.errorId);
    });
    const copy = document.createElement("span");
    copy.textContent = option.label;
    if (option.description) {
      const description = document.createElement("small");
      description.textContent = option.description;
      copy.append(description);
    }
    label.append(input, copy);
    choices.append(label);
  }
  fieldset.append(choices);
}

function v3MultiGroup(fieldset, groups, exclusiveOptions, selected, maxLength, onChange) {
  const exclusiveIds = new Set(exclusiveOptions.map((option) => option.id));
  const allGroups = [...groups, { id: "exclusive", label: "", options: exclusiveOptions }];
  const controls = [];
  for (const group of allGroups) {
    const section = document.createElement("section");
    section.className = "option-section";
    if (group.label) {
      const heading = document.createElement("h3");
      heading.textContent = group.label;
      section.append(heading);
    }
    const choices = document.createElement("div");
    choices.className = "choice-grid";
    for (const option of group.options) {
      const label = document.createElement("label");
      label.className = "choice described-choice";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = fieldset.dataset.errorId;
      input.value = option.id;
      input.checked = selected.includes(option.id);
      const copy = document.createElement("span");
      copy.textContent = option.label;
      if (option.description) {
        const description = document.createElement("small");
        description.textContent = option.description;
        copy.append(description);
      }
      input.addEventListener("change", () => {
        let next = [...selected];
        if (input.checked && exclusiveIds.has(option.id)) next = [option.id];
        else if (input.checked) next = [...next.filter((id) => !exclusiveIds.has(id)), option.id].slice(0, maxLength);
        else next = next.filter((id) => id !== option.id);
        onChange(next);
      });
      controls.push(input);
      label.append(input, copy);
      choices.append(label);
    }
    section.append(choices);
    fieldset.append(section);
  }
  const normalCount = selected.filter((id) => !exclusiveIds.has(id)).length;
  for (const input of controls) {
    if (!input.checked && !exclusiveIds.has(input.value)) input.disabled = normalCount >= maxLength;
  }
}

function v3ReviewRow(label, value) {
  const row = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;
  row.append(strong, document.createTextNode(value));
  return row;
}

function buildVoiceV3Pages(slug, survey, values, submissionToken, rerender) {
  const { voice } = survey;
  const save = () => saveVoiceV3Draft(slug, submissionToken, values);
  const change = (callback, { rebuild = false, previousPriority = values.future_priority } = {}) => {
    callback();
    pruneVoiceV3(voice, values, previousPriority);
    save();
    if (rebuild) rerender();
  };
  const pages = [{
    key: "intro",
    render: (page) => {
      const intro = pageIntro();
      intro.querySelector("p").textContent = "選択式が中心です。文章の入力は任意で、回答は送信するまでサーバーへ送られません。";
      intro.querySelector("ul").replaceChildren();
      for (const message of [
        "必要な数を埋めるために、無理に候補を選ぶ必要はありません",
        "アカウント回答では、回答内容や任意入力の有無で、称号の受取条件は変わりません",
        "回答データにUIDを保存せず、UIDは称号付与だけに使い、回答内容とは紐づけません",
        "入力内容はこの端末のタブ内に一時保存されます",
      ]) {
        const item = document.createElement("li");
        item.textContent = message;
        intro.querySelector("ul").append(item);
      }
      page.append(intro);
    },
    validate: () => [],
  }, {
    key: "basic",
    render: (page) => {
      page.append(voicePageTitle("最近の利用状況", "直近30日間のおおよその日数でお答えください。"));
      const usage = voiceFieldset("usage_30d", "直近30日間で、PlayNaviを使った日数はどれくらいですか？");
      v3ChoiceGroup(usage, "v3-usage", voice.usageOptions, values.usage_30d, (id) => change(() => {
        values.usage_30d = id;
      }, { rebuild: true }));
      page.append(usage);
      if (experiencedUsage(values.usage_30d)) {
        const satisfaction = voiceFieldset("overall_satisfaction", "PlayNavi全体に、どのくらい満足していますか？");
        if (values.usage_30d === "inactive_30d") {
          const hint = document.createElement("p");
          hint.className = "question-hint";
          hint.textContent = "最後に使った頃の印象でお答えください。";
          satisfaction.append(hint);
        }
        v3ChoiceGroup(satisfaction, "v3-satisfaction", voice.overallSatisfactionOptions, values.overall_satisfaction, (id) => change(() => {
          values.overall_satisfaction = id;
        }));
        page.append(satisfaction);
      }
    },
    validate: () => validateVoiceV3Answers(voice, values).missing.filter((id) => ["usage_30d", "overall_satisfaction"].includes(id)),
  }, {
    key: "unprompted",
    render: (page) => {
      page.append(voicePageTitle("候補を見る前に", "思いつかなければ、空欄のまま次へ進めます。"));
      const field = voiceFieldset("unprompted_need", "最近のゲーム生活で、『こうできたら、もっとよいのに』と感じたことはありますか？", { required: false });
      const hint = document.createElement("p");
      hint.className = "question-hint";
      hint.textContent = "PlayNavi以外での出来事でもかまいません。短いひとことで大丈夫です。";
      field.append(hint);
      voiceTextarea(field, values.unprompted_need, voice.unpromptedMaxLength, (value) => change(() => {
        values.unprompted_need = value;
      }));
      page.append(field);
    },
    validate: () => [],
  }];

  if (experiencedUsage(values.usage_30d)) pages.push({
    key: "valuable",
    render: (page) => {
      page.append(voicePageTitle("今も役立っている機能", "最大3つです。3つを埋める必要はありません。"));
      const field = voiceFieldset("valuable_features", "これからも使いたい、役に立っていると感じる機能を選んでください。");
      const groups = voice.categories.map((category) => ({
        id: category.id,
        label: category.label,
        options: [...category.features].sort((left, right) =>
          values.feature_display_order.indexOf(left.id) - values.feature_display_order.indexOf(right.id)),
      }));
      v3MultiGroup(field, groups, voice.q4ExclusiveOptions, values.valuable_features, voice.valuableFeatureMax, (next) => change(() => {
        values.valuable_features = next;
      }, { rebuild: true }));
      page.append(field);

      const optional = document.createElement("details");
      optional.className = "optional-panel question-card";
      const summary = document.createElement("summary");
      summary.textContent = "あまり使っていない機能についても伝える（任意）";
      const unused = voiceFieldset("unused_feature", "理由を伝えたい機能があれば1つ選んでください。", { required: false, className: "nested-question" });
      const unusedOptions = voice.categories.flatMap((category) => category.features);
      v3ChoiceGroup(unused, "v3-unused-feature", unusedOptions, values.unused_feature, (id) => change(() => {
        values.unused_feature = id;
      }, { rebuild: true }));
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "text-button";
      clear.textContent = "この任意回答を取り消す";
      clear.addEventListener("click", () => change(() => { values.unused_feature = ""; }, { rebuild: true }));
      optional.append(summary, unused, clear);
      if (values.unused_feature) {
        optional.open = true;
        const reason = voiceFieldset("unused_reason", "その機能をあまり使っていない主な理由は何ですか？", { className: "nested-question" });
        v3ChoiceGroup(reason, "v3-unused-reason", voice.unusedReasonOptions, values.unused_reason, (id) => change(() => {
          values.unused_reason = id;
        }));
        optional.append(reason);
      }
      page.append(optional);
    },
    validate: () => validateVoiceV3Answers(voice, values).missing.filter((id) => ["valuable_features", "unused_reason"].includes(id)),
  });

  if (experiencedUsage(values.usage_30d)) pages.push({
    key: "problem",
    render: (page) => {
      const dormant = values.usage_30d === "inactive_30d";
      page.append(voicePageTitle(dormant ? "最近使っていない理由" : "最も改善してほしいこと", "近いものを1つ選んでください。"));
      if (dormant) {
        const field = voiceFieldset("dormant_reason", "最近PlayNaviを使っていない、いちばんの理由は何ですか？");
        v3ChoiceGroup(field, "v3-dormant", voice.dormantReasonOptions, values.dormant_reason, (id) => change(() => {
          values.dormant_reason = id;
        }));
        page.append(field);
      } else {
        const field = voiceFieldset("primary_problem", "最近PlayNaviを使っていて、いちばん改善してほしいと感じたことは何ですか？");
        v3ChoiceGroup(field, "v3-problem", voice.problemOptions, values.primary_problem, (id) => change(() => {
          values.primary_problem = id;
          values.improvement_vs_candidate = "";
        }, { rebuild: true }));
        page.append(field);
        if (concreteProblem(values.primary_problem)) {
          const comment = voiceFieldset("problem_comment", "どの画面で、何をしようとしたときですか？（任意）", { required: false });
          const hint = document.createElement("p");
          hint.className = "question-hint";
          hint.textContent = "個人情報・パスワード等は書かないでください。ひとことでもかまいません。";
          comment.append(hint);
          voiceTextarea(comment, values.problem_comment, voice.problemCommentMaxLength, (value) => change(() => {
            values.problem_comment = value;
          }));
          page.append(comment);
        }
      }
    },
    validate: () => validateVoiceV3Answers(voice, values).missing.filter((id) => ["primary_problem", "dormant_reason"].includes(id)),
  });

  if (experiencedUsage(values.usage_30d) && values.usage_30d !== "inactive_30d" && concreteProblem(values.primary_problem)) pages.push({
    key: "outcome",
    render: (page) => {
      page.append(voicePageTitle("困りごとの実際の影響"));
      const field = voiceFieldset("problem_outcome", "その問題が起きた直近の場面では、どうしましたか？");
      v3ChoiceGroup(field, "v3-outcome", voice.problemOutcomeOptions, values.problem_outcome, (id) => change(() => {
        values.problem_outcome = id;
      }));
      page.append(field);
    },
    validate: () => validateVoiceV3Answers(voice, values).missing.filter((id) => id === "problem_outcome"),
  });

  pages.push({
    key: "future_role",
    render: (page) => {
      page.append(voicePageTitle("これから期待する役割"));
      const field = voiceFieldset("future_role", "これからのPlayNaviで、特に充実してほしいことを1つ選ぶとしたら、どれですか？");
      v3ChoiceGroup(field, "v3-future-role", voice.futureRoleOptions, values.future_role, (id) => change(() => {
        values.future_role = id;
      }, { rebuild: true }));
      page.append(field);
      if (values.future_role === "other") {
        const other = voiceFieldset("future_role_other", "その他の内容（任意）", { required: false });
        voiceTextarea(other, values.future_role_other, voice.otherMaxLength, (value) => change(() => {
          values.future_role_other = value;
        }));
        page.append(other);
      }
    },
    validate: () => validateVoiceV3Answers(voice, values).missing.filter((id) => id === "future_role"),
  }, {
    key: "future_candidates",
    render: (page) => {
      page.append(voicePageTitle("追加・強化してほしい候補", "実現方法や時期は未定です。最大3つで、順位は付きません。"));
      const field = voiceFieldset("future_candidates", "実現したら使ってみたい、またはもっと充実してほしいものを選んでください。");
      const ordered = values.future_display_order.map((id) => voice.futureOptions.find((option) => option.id === id));
      v3MultiGroup(field, [{ id: "future", label: "", options: [...ordered, { id: "other", label: "その他の希望がある", description: "内容の記述は任意です" }] }], voice.futureExclusiveOptions, values.future_candidates, voice.futureCandidateMax, (next) => change(() => {
        values.future_candidates = next;
      }, { rebuild: true }));
      page.append(field);
      if (values.future_candidates.includes("other")) {
        const other = voiceFieldset("future_other", "その他の希望（任意）", { required: false });
        voiceTextarea(other, values.future_other, voice.otherMaxLength, (value) => change(() => {
          values.future_other = value;
        }));
        page.append(other);
      }
    },
    validate: () => validateVoiceV3Answers(voice, values).missing.filter((id) => id === "future_candidates"),
  });

  const futureIds = new Set(voice.futureOptions.map((option) => option.id));
  const rankable = values.future_candidates.filter((id) => futureIds.has(id) || id === "other");
  if (rankable.length > 1) pages.push({
    key: "future_priority",
    render: (page) => {
      page.append(voicePageTitle("選んだ候補の最優先", "2位・3位の順位は付けません。"));
      const options = rankable.map((id) => id === "other"
        ? { id: "other", label: "その他の希望" }
        : voice.futureOptions.find((option) => option.id === id));
      const field = voiceFieldset("future_priority", "選んだ中で、いちばん期待するものはどれですか？");
      v3ChoiceGroup(field, "v3-priority", options, values.future_priority, (id) => change(() => {
        values.future_priority = id;
        values.future_priority_mode = "explicit";
      }, { previousPriority: values.future_priority }));
      page.append(field);
    },
    validate: () => validateVoiceV3Answers(voice, values).missing.filter((id) => id === "future_priority"),
  });

  if (values.future_priority) pages.push({
    key: "future_detail",
    render: (page) => {
      const candidate = voice.futureOptions.find((option) => option.id === values.future_priority);
      page.append(voicePageTitle("最優先候補をもう少し詳しく", candidate?.label || "その他の希望"));
      if (values.future_priority === "other") {
        const field = voiceFieldset("future_detail_other", "伝えたいことがあれば教えてください（任意）", { required: false });
        voiceTextarea(field, values.future_detail_other || values.future_other, voice.otherMaxLength, (value) => change(() => {
          values.future_detail_other = value;
        }));
        page.append(field);
        return;
      }
      const detail = voice.futureDetailOptions[values.future_priority];
      const a = voiceFieldset("future_detail_a", detail.aPrompt, { required: false });
      v3ChoiceGroup(a, "v3-detail-a", detail.aOptions, values.future_detail_a, (id) => change(() => {
        values.future_detail_a = id;
      }));
      const b = voiceFieldset("future_detail_b", detail.bPrompt, { required: false });
      v3ChoiceGroup(b, "v3-detail-b", detail.bOptions, values.future_detail_b, (id) => change(() => {
        values.future_detail_b = id;
      }));
      page.append(a, b);
    },
    validate: () => [],
  });

  if (currentUsage(values.usage_30d) && concreteProblem(values.primary_problem) && futureIds.has(values.future_priority)) pages.push({
    key: "compare",
    render: (page) => {
      const problem = voice.problemOptions.find((option) => option.id === values.primary_problem)?.label || "目の前の問題";
      const candidate = voice.futureOptions.find((option) => option.id === values.future_priority)?.label || "新しい候補";
      page.append(voicePageTitle("目の前の改善と新しい候補"));
      const field = voiceFieldset("improvement_vs_candidate", "先に取り組んでほしいのは、どちらですか？");
      v3ChoiceGroup(field, "v3-comparison", [
        { id: "improvement", label: `「${problem}」の改善` },
        { id: "candidate", label: `「${candidate}」の追加・強化` },
        { id: "tie", label: "どちらともいえない" },
      ], values.improvement_vs_candidate, (id) => change(() => {
        values.improvement_vs_candidate = id;
      }));
      page.append(field);
    },
    validate: () => validateVoiceV3Answers(voice, values).missing.filter((id) => id === "improvement_vs_candidate"),
  });

  pages.push({
    key: "review",
    render: (page) => {
      page.append(voicePageTitle("回答内容の確認", "修正する場合は「戻る」で各設問へ戻れます。"));
      const review = document.createElement("section");
      review.className = "review-card question-card";
      const usage = voice.usageOptions.find((option) => option.id === values.usage_30d)?.label || "未回答";
      const role = voice.futureRoleOptions.find((option) => option.id === values.future_role)?.label || "未回答";
      const problem = values.usage_30d === "inactive_30d"
        ? voice.dormantReasonOptions.find((option) => option.id === values.dormant_reason)?.label
        : voice.problemOptions.find((option) => option.id === values.primary_problem)?.label;
      const candidateLabels = values.future_candidates.map((id) => {
        if (id === "other") return "その他の希望";
        return voice.futureOptions.find((option) => option.id === id)?.label ||
          voice.futureExclusiveOptions.find((option) => option.id === id)?.label || id;
      });
      const priority = voice.futureOptions.find((option) => option.id === values.future_priority)?.label ||
        (values.future_priority === "other" ? "その他の希望" : "最優先なし");
      review.append(
        v3ReviewRow("最近の利用", usage),
        ...(experiencedUsage(values.usage_30d) ? [v3ReviewRow(
          values.usage_30d === "inactive_30d" ? "最近使っていない理由" : "最も改善してほしいこと",
          problem || "未回答",
        )] : []),
        v3ReviewRow("これから期待する役割", role),
        v3ReviewRow("追加・強化候補", candidateLabels.join("、") || "未回答"),
        v3ReviewRow("最優先候補", priority),
      );
      const privacy = document.createElement("p");
      privacy.className = "privacy-note";
      privacy.textContent = "回答データにUIDは保存されません。UIDは称号付与だけに使い、回答内容とは紐づけません。";
      const note = document.createElement("p");
      note.textContent = "「回答を送信」を押すまで、回答はサーバーへ送られません。";
      review.append(privacy, note);
      page.append(review);
    },
    validate: () => [],
  });
  return pages;
}

function createVoiceV3Controller(slug, survey, values, submissionToken) {
  let currentKey = "intro";
  const render = (requestedKey = currentKey, { focusHeading = true } = {}) => {
    pruneVoiceV3(survey.voice, values);
    saveVoiceV3Draft(slug, submissionToken, values);
    const rerender = () => render(currentKey, { focusHeading: false });
    let pages = buildVoiceV3Pages(slug, survey, values, submissionToken, rerender);
    let current = pages.findIndex((page) => page.key === requestedKey);
    if (current < 0) current = Math.max(0, pages.findIndex((page) => page.key === currentKey));
    if (current < 0) current = 0;
    currentKey = pages[current].key;
    const container = document.createElement("section");
    container.className = "survey-step-page voice-step-page reviewed-voice-step";
    container.dataset.step = currentKey;
    pages[current].render(container);
    elements.questions.replaceChildren(container);
    elements.view?.classList.toggle("survey-in-progress", currentKey !== "intro");
    const stepNumber = current + 1;
    elements.step.textContent = `${stepNumber} / ${pages.length}`;
    elements.progressLabel.textContent = currentKey === "review" ? "入力完了" : "回答の進捗";
    elements.progressBar.style.width = `${Math.round((stepNumber / pages.length) * 100)}%`;
    elements.progressTrack.setAttribute("aria-valuemax", String(pages.length));
    elements.progressTrack.setAttribute("aria-valuenow", String(stepNumber));
    elements.progressTrack.setAttribute("aria-valuetext", `${pages.length}ステップ中${stepNumber}ステップ目`);
    setVisible(elements.back, current > 0);
    setVisible(elements.next, current < pages.length - 1);
    setVisible(elements.submit, currentKey === "review");
    elements.next.textContent = currentKey === "intro" ? "回答を始める" : "次へ";
    elements.error.textContent = "";
    setVisible(elements.error, false);
    if (focusHeading) window.requestAnimationFrame(() => {
      container.querySelector(".voice-page-title, .voice-intro h2")?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
    });
    elements.back.onclick = () => render(pages[Math.max(0, current - 1)].key);
    elements.next.onclick = () => {
      const missing = pages[current].validate();
      markVoiceMissing(missing);
      if (missing.length) {
        elements.error.textContent = "この画面の必須項目に回答してください。";
        setVisible(elements.error, true);
        focusVoiceError(missing[0]);
        return;
      }
      pages = buildVoiceV3Pages(slug, survey, values, submissionToken, () => {});
      const fresh = pages.findIndex((page) => page.key === currentKey);
      render(pages[Math.min(fresh + 1, pages.length - 1)].key);
    };
  };
  render();
  return {
    showError(id, message) {
      const pages = buildVoiceV3Pages(slug, survey, values, submissionToken, () => {});
      const target = pages.find((page) => page.validate().includes(id));
      render(target?.key || "basic", { focusHeading: false });
      elements.error.textContent = message;
      setVisible(elements.error, true);
      markVoiceMissing([id]);
      focusVoiceError(id);
    },
  };
}

function markVoiceMissing(missing) {
  for (const fieldset of elements.questions.querySelectorAll("[data-error-id]")) {
    fieldset.removeAttribute("aria-invalid");
    fieldset.removeAttribute("aria-describedby");
  }
  for (const id of missing) {
    const fieldset = elements.questions.querySelector(`[data-error-id="${CSS.escape(id)}"]`);
    fieldset?.setAttribute("aria-invalid", "true");
    fieldset?.setAttribute("aria-describedby", "survey-error");
  }
}

function focusVoiceError(id) {
  const fieldset = elements.questions.querySelector(`[data-error-id="${CSS.escape(id)}"]`);
  fieldset?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
  fieldset?.querySelector("input, select, textarea")?.focus({ preventScroll: true });
}

function pageKeyForVoiceError(voice, values, id) {
  if (["usage_frequency", "overall_satisfaction"].includes(id)) return "basic";
  const [, featureId] = id.split(":");
  if (id.startsWith("priority:")) {
    return `category:${voice.categories.find((category) => category.features.some((feature) => feature.id === featureId))?.id}`;
  }
  if (id.startsWith("category_top:")) return "category_top";
  if (id.startsWith("importance:") || id.startsWith("satisfaction:")) {
    return `detail:${voice.categories.find((category) => category.features.some((feature) => feature.id === featureId))?.id}`;
  }
  if (id.startsWith("future_")) return "future";
  return "basic";
}

function createVoiceController(slug, survey, values) {
  let currentKey = "intro";
  const render = (requestedKey = currentKey, { focusHeading = true } = {}) => {
    const pages = buildVoicePages(slug, survey, values);
    let current = pages.findIndex((page) => page.key === requestedKey);
    if (current < 0) current = Math.max(0, pages.findIndex((page) => page.key === currentKey));
    if (current < 0) current = 0;
    currentKey = pages[current].key;
    const container = document.createElement("section");
    container.className = "survey-step-page voice-step-page";
    container.dataset.step = currentKey;
    pages[current].render(container);
    elements.questions.replaceChildren(container);
    elements.view?.classList.toggle("survey-in-progress", currentKey !== "intro");
    const stepNumber = current + 1;
    elements.step.textContent = `${stepNumber} / ${pages.length}`;
    elements.progressLabel.textContent = currentKey === "review" ? "入力完了" : "回答の進捗";
    elements.progressBar.style.width = `${Math.round((stepNumber / pages.length) * 100)}%`;
    elements.progressTrack.setAttribute("aria-valuemax", String(pages.length));
    elements.progressTrack.setAttribute("aria-valuenow", String(stepNumber));
    elements.progressTrack.setAttribute("aria-valuetext", `${pages.length}ステップ中${stepNumber}ステップ目`);
    setVisible(elements.back, current > 0);
    setVisible(elements.next, current < pages.length - 1);
    setVisible(elements.submit, currentKey === "review");
    elements.next.textContent = currentKey === "intro" ? "回答を始める" : "次へ";
    elements.error.textContent = "";
    setVisible(elements.error, false);

    if (focusHeading) {
      window.requestAnimationFrame(() => {
        const heading = container.querySelector(".voice-page-title, .voice-intro h2");
        heading?.focus({ preventScroll: true });
        window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
      });
    }

    elements.back.onclick = () => render(pages[Math.max(0, current - 1)].key);
    elements.next.onclick = () => {
      const missing = pages[current].validate();
      markVoiceMissing(missing);
      if (missing.length > 0) {
        elements.error.textContent = missing.some((id) => id.includes("top:1") || id.includes("top:2"))
          ? "同じ項目を複数の順位には選べません。"
          : "この画面の必須項目に回答してください。";
        setVisible(elements.error, true);
        focusVoiceError(missing[0]);
        return;
      }
      const freshPages = buildVoicePages(slug, survey, values);
      const freshIndex = freshPages.findIndex((page) => page.key === currentKey);
      render(freshPages[Math.min(freshIndex + 1, freshPages.length - 1)].key);
      window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
    };
  };
  render();
  return {
    showError(id, message) {
      currentKey = pageKeyForVoiceError(survey.voice, values, id);
      render(currentKey, { focusHeading: false });
      elements.error.textContent = message;
      setVisible(elements.error, true);
      markVoiceMissing([id]);
      focusVoiceError(id);
    },
  };
}

function showSubmitConflict(payload) {
  elements.error.textContent = classifySubmitConflict(payload) === "answers_conflict"
    ? "このアンケートには別の回答がすでに保存されています。入力内容は保持しています。再送せず、サポートへお問い合わせください。"
    : "回答を送信できませんでした。入力内容は保持しています。時間をおいてもう一度お試しください。";
  setVisible(elements.error, true);
}

async function submitSurvey(slug, survey, values, stepController, submissionToken) {
  const result = validateAnswers(survey.questions, values);
  elements.error.textContent = "";
  setVisible(elements.error, false);
  markMissing(result.missing);
  if (result.missing.length > 0) {
    const pageIndex = survey.questions.findIndex((question) => question.id === result.missing[0]);
    stepController.show(Math.floor(pageIndex / QUESTIONS_PER_STEP));
    elements.error.textContent = "必須の質問に回答してください。";
    setVisible(elements.error, true);
    focusQuestion(result.missing[0]);
    return;
  }

  elements.submit.disabled = true;
  elements.submit.textContent = "送信しています…";
  try {
    const response = await fetch(`/api/surveys/${encodeURIComponent(slug)}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      body: JSON.stringify({ answers: result.answers, submission_token: submissionToken }),
    });
    if (response.status === 401) return loadSurvey(slug);
    const payload = await response.json();
    if (response.status === 409) {
      return showSubmitConflict(payload);
    }
    if ([404, 410].includes(response.status)) return showResult({ status: "closed" });
    if (!response.ok) throw new Error("submit failed");
    const parsed = parseSubmitResult(payload);
    if (["submitted", "already_answered"].includes(parsed.status)) clearDraft(slug);
    showResult(parsed);
  } catch {
    elements.error.textContent = "回答を送信できませんでした。入力内容はこの画面に保持されています。";
    setVisible(elements.error, true);
  } finally {
    elements.submit.disabled = false;
    elements.submit.textContent = "回答を送信";
  }
}

async function submitVoiceSurvey(slug, survey, values, controller, submissionToken) {
  const result = validateVoiceAnswers(survey.voice, values);
  if (result.missing.length > 0 || result.structurallyInvalid) {
    const first = result.missing[0] || "usage_frequency";
    controller.showError(first, result.structurallyInvalid
      ? "入力内容を確認してください。古い一時保存データがある場合は、該当項目を選び直してください。"
      : "必須の質問に回答してください。");
    return;
  }

  elements.submit.disabled = true;
  elements.submit.textContent = "送信しています…";
  try {
    const response = await fetch(`/api/surveys/${encodeURIComponent(slug)}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      body: JSON.stringify({ answers: result.answers, submission_token: submissionToken }),
    });
    if (response.status === 401) return loadSurvey(slug);
    const payload = await response.json();
    if (response.status === 409) {
      return showSubmitConflict(payload);
    }
    if ([404, 410].includes(response.status)) return showResult({ status: "closed" });
    if (!response.ok) throw new Error("submit failed");
    const parsed = parseSubmitResult(payload);
    if (["submitted", "already_answered"].includes(parsed.status)) clearDraft(slug);
    showResult(parsed);
  } catch {
    elements.error.textContent = "回答を送信できませんでした。入力内容はこの画面に保持されています。";
    setVisible(elements.error, true);
  } finally {
    elements.submit.disabled = false;
    elements.submit.textContent = "回答を送信";
  }
}

async function submitVoiceV3Survey(slug, survey, values, controller, submissionToken) {
  pruneVoiceV3(survey.voice, values);
  const result = validateVoiceV3Answers(survey.voice, values);
  if (result.missing.length > 0 || result.structurallyInvalid) {
    const first = result.missing[0] || "usage_30d";
    controller.showError(first, result.structurallyInvalid
      ? "入力内容を確認してください。古い一時保存データがある場合は、該当項目を選び直してください。"
      : "必須の質問に回答してください。");
    return;
  }
  elements.submit.disabled = true;
  elements.submit.textContent = "送信しています…";
  try {
    const response = await fetch(`/api/surveys/${encodeURIComponent(slug)}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      body: JSON.stringify({ answers: result.answers, submission_token: submissionToken }),
    });
    if (response.status === 401) return loadSurvey(slug);
    const payload = await response.json();
    if (response.status === 409) return showSubmitConflict(payload);
    if ([404, 410].includes(response.status)) return showResult({ status: "closed" });
    if (!response.ok) throw new Error("submit failed");
    const parsed = parseSubmitResult(payload);
    if (["submitted", "already_answered"].includes(parsed.status)) clearDraft(slug);
    showResult(parsed);
  } catch {
    elements.error.textContent = "回答を送信できませんでした。入力内容はこの画面に保持されています。";
    setVisible(elements.error, true);
  } finally {
    elements.submit.disabled = false;
    elements.submit.textContent = "回答を送信";
  }
}

function showSurveyForm(slug, survey) {
  hideStates();
  setPage({ title: survey.title, description: survey.description });
  if (survey.schemaVersion === 3) {
    const { values, submissionToken } = voiceV3Values(slug, survey.voice);
    pruneVoiceV3(survey.voice, values);
    saveVoiceV3Draft(slug, submissionToken, values);
    const controller = createVoiceV3Controller(slug, survey, values, submissionToken);
    elements.form.onsubmit = (event) => {
      event.preventDefault();
      submitVoiceV3Survey(slug, survey, values, controller, submissionToken);
    };
    setVisible(elements.form, true);
    return;
  }
  if (survey.schemaVersion === 2) {
    const submissionToken = legacySubmissionToken(slug);
    const values = voiceValues(slug, survey.voice);
    const controller = createVoiceController(slug, survey, values);
    elements.form.onsubmit = (event) => {
      event.preventDefault();
      submitVoiceSurvey(slug, survey, values, controller, submissionToken);
    };
    setVisible(elements.form, true);
    return;
  }
  const { values, pages } = renderQuestions(slug, survey);
  const submissionToken = legacySubmissionToken(slug);
  const stepController = createStepController(pages, values);
  elements.form.onsubmit = (event) => {
    event.preventDefault();
    submitSurvey(slug, survey, values, stepController, submissionToken);
  };
  setVisible(elements.form, true);
}

async function loadSurvey(slug, authFailed = false) {
  hideStates();
  setPage({ title: "PlayNaviアンケート", description: "アンケートを準備しています。", loading: true });
  try {
    const response = await fetch(`/api/surveys/${encodeURIComponent(slug)}`, {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    if (response.status === 401) {
      const preview = parseSurveyPreview(await response.json(), slug);
      return showLogin(slug, preview, authFailed);
    }
    if (response.status === 403) {
      return showLogin(slug, null, true);
    }
    if (response.status === 404 || response.status === 410) {
      return showResult({ status: "closed" });
    }
    if (!response.ok) throw new Error("read failed");
    const survey = parseSurveyRead(await response.json(), slug);
    return survey.status === "ok" ? showSurveyForm(slug, survey) : showResult(survey);
  } catch {
    return showUnavailable(() => loadSurvey(slug));
  }
}

async function exchangeHandoff(code, currentSlug) {
  try {
    const response = await fetch("/api/survey/session/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      body: JSON.stringify({ code }),
    });
    if (!response.ok) return false;
    const payload = await response.json();
    if (payload?.status !== "ok" || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(payload.survey_slug)) {
      return false;
    }
    if (payload.survey_slug !== currentSlug) {
      window.location.replace(`/surveys/${encodeURIComponent(payload.survey_slug)}`);
      return null;
    }
    return true;
  } catch {
    return false;
  }
}

export async function startSurvey(slug) {
  setVisible(elements.linkView, false);
  setVisible(elements.view, true);

  const params = new URLSearchParams(window.location.search);
  const authFailed = params.get("auth") === "failed";
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const handoff = fragment.get("handoff");

  // Remove every fragment value before any network call. The handoff code is
  // retained only in this local variable and is never written to storage/DOM.
  if (window.location.hash || authFailed) {
    window.history.replaceState(null, "", window.location.pathname);
  }

  if (handoff) {
    setPage({ title: "PlayNaviアンケート", description: "ログイン情報を確認しています。", loading: true });
    const exchanged = await exchangeHandoff(handoff, slug);
    if (exchanged === null) return;
    if (!exchanged) return loadSurvey(slug, true);
  }
  return loadSurvey(slug, authFailed);
}
