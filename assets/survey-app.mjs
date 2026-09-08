import {
  classifySubmitConflict,
  parseSubmitResult,
  parseSurveyRead,
  parseSurveyPreview,
  updateOrderedSelection,
  validateAnswers,
  validateVoiceAnswers,
  validateVoiceV3Answers,
  validateVoiceV4Answers,
  validateVoiceV5Answers,
  validateVoiceV7Answers,
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
  const isVoiceV5 = [5, 6, 7].includes(preview?.schemaVersion);
  elements.view?.classList.toggle("survey-schema-v5", isVoiceV5);
  elements.view?.classList.toggle("survey-schema-v6", [6, 7].includes(preview?.schemaVersion));
  const notice = elements.login?.querySelector(".login-notice");
  elements.login?.querySelector(".login-heading")?.remove();
  if (notice) {
    const guide = elements.guide;
    notice.replaceChildren();
    if (isVoiceV5) {
      const heading = document.createElement("h2");
      heading.className = "login-heading";
      heading.textContent = "回答方法を選択してください";
      elements.login.insertBefore(heading, notice);
      for (const copy of [
        "アカウントで回答すると、回答完了後に報酬（称号）を受け取れます。",
        "ログイン情報は報酬付与の判定にのみ利用し、回答内容には紐づけません。",
        "ログインせずに回答することもできますが、ゲスト回答では報酬を受け取れません。",
      ]) {
        const item = document.createElement("li");
        item.textContent = copy;
        notice.append(item);
      }
      elements.guest.textContent = "報酬なしでログインせず回答する";
    } else {
      for (const copy of [
        "アカウントに紐づく報酬をご提供するため、ログインをお願いします。",
        "回答データにUIDを保存しません。UIDは称号付与だけに使い、回答内容とは紐づけません。回答内容は個人が分からない形で集計・利用します。",
      ]) {
        const item = document.createElement("li");
        item.textContent = copy;
        notice.append(item);
      }
      elements.guest.textContent = "報酬なしでログインせずに回答する";
    }
    if (!isVoiceV5) notice.append(guide);
  }
  setPage({
    title: preview?.title || "アンケート",
    description: failed
      ? "ログインを完了できませんでした。PlayNaviで利用しているアカウントでもう一度お試しください。"
      : isVoiceV5 ? preview?.description || "" : "",
    descriptionTone: failed ? "warning" : "default",
  });
  if (elements.guide && !isVoiceV5) {
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
  const conciseCompletion = [6, 7].includes(result.schemaVersion) || elements.view?.classList.contains("survey-schema-v6");
  if ([6, 7].includes(result.schemaVersion)) {
    elements.view?.classList.add("survey-schema-v5", "survey-schema-v6");
  }
  setPage({
    title: closed
      ? "アンケートは終了しました"
      : already
        ? "回答済みです"
        : conciseCompletion
          ? "回答受け付けました"
          : "回答ありがとうございました",
    description: closed ? "このアンケートの受付は終了しています。" : conciseCompletion ? "" : "回答を受け付けました。",
  });
  if (elements.resultIcon) elements.resultIcon.textContent = closed ? "–" : "✓";
  if (elements.resultHeading) {
    elements.resultHeading.textContent = closed
      ? "受付終了"
      : already
        ? "回答済みです"
        : conciseCompletion
          ? "ご回答いただきありがとうございました"
          : "回答ありがとうございました";
  }
  if (elements.resultDescription) {
    elements.resultDescription.textContent = closed
      ? "ご協力ありがとうございました。"
      : already
        ? "このアンケートへの回答はすでに完了しています。"
        : conciseCompletion
          ? "このまま画面を閉じて構いません。報酬のご提供まで今しばらくお待ちください。"
          : "ご協力ありがとうございました。";
  }
  const hasReward = result.titleAwarded && result.titleName;
  if (hasReward && elements.titleName) elements.titleName.textContent = result.titleName;
  setVisible(elements.reward, Boolean(hasReward) && !conciseCompletion);
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

function saveVoiceV3Draft(slug, submissionToken, values, schemaVersion = 3) {
  try {
    sessionStorage.setItem(draftKey(slug), JSON.stringify({
      schema_version: schemaVersion,
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
  if (className.split(/\s+/).includes("v5-question")) {
    const card = document.createElement("section");
    card.className = `question-card ${className}`.trim();
    card.dataset.errorId = errorId;
    card.dataset.required = String(required);
    const heading = document.createElement("h3");
    heading.className = "v5-question-heading";
    heading.id = `v5-question-${errorId.replace(/[^a-z0-9_-]/gi, "-")}`;
    const headingCopy = document.createElement("span");
    headingCopy.textContent = label;
    heading.append(headingCopy);
    if (required) appendRequired(heading);
    const fieldset = document.createElement("fieldset");
    fieldset.className = "question v5-question-controls";
    fieldset.setAttribute("aria-labelledby", heading.id);
    const legend = document.createElement("legend");
    legend.className = "sr-only";
    legend.textContent = label;
    fieldset.append(legend);
    card.append(heading, fieldset);
    return card;
  }
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

const v5ControlRoot = (card) => card.querySelector?.(":scope > .v5-question-controls") || card;

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
  const block = target.closest?.(".schema-v6-step") ? "start" : "center";
  target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block });
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

function buildVoiceV6Pages(slug, survey, values, submissionToken, rerender) {
  return buildVoiceV5Pages(slug, survey, values, submissionToken, rerender, {
    schemaVersion: 6,
    revisedUi: true,
  });
}

function buildVoiceV7Pages(slug, survey, values, submissionToken, rerender) {
  return buildVoiceV5Pages(slug, survey, values, submissionToken, rerender, {
    schemaVersion: 7,
    revisedUi: true,
  });
}

function validIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function referencePeriodEndInJst(offsetDays = 1, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now).filter(({ type }) => type !== "literal").map(({ type, value }) => [type, value]));
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - offsetDays))
    .toISOString().slice(0, 10);
}

function periodStart(periodEnd, days) {
  const end = new Date(`${periodEnd}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - (days - 1));
  return end.toISOString().slice(0, 10);
}

function displayDate(value) {
  const [year, month, day] = value.split("-");
  return `${year}/${month}/${day}`;
}

function voiceV3Values(slug, voice, schemaVersion = 3) {
  const stored = readDraft(slug);
  const source = stored.schema_version === schemaVersion && stored.values && typeof stored.values === "object"
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
  if (schemaVersion === 4) {
    Object.assign(values, {
      reference_period_end_on: validIsoDate(source.reference_period_end_on)
        ? source.reference_period_end_on : referencePeriodEndInJst(voice.referencePeriodEndOffsetDays),
      play_time_4w: string("play_time_4w"),
      primary_play_device_4w: string("primary_play_device_4w"),
      info_seek_days_4w: string("info_seek_days_4w"),
      recording_preference: string("recording_preference"),
    });
  }
  const submissionToken = typeof stored.submission_token === "string" && /^[A-Za-z0-9_-]{43}$/.test(stored.submission_token)
    ? stored.submission_token
    : randomToken();
  return { values, submissionToken };
}

function voiceV5Values(slug, voice, schemaVersion = 5) {
  const stored = readDraft(slug);
  const source = stored.schema_version === schemaVersion && stored.values && typeof stored.values === "object"
    ? stored.values : {};
  const featureIds = voice.features.map(({ id }) => id);
  const futureIds = voice.futureOptions.map(({ id }) => id);
  const exactOrder = (value, expected) => Array.isArray(value) && value.length === expected.length &&
    new Set(value).size === expected.length && value.every((id) => expected.includes(id));
  const string = (key) => typeof source[key] === "string" ? source[key] : "";
  const selected = (key, allowed, exclusive) => Array.isArray(source[key]) &&
    new Set(source[key]).size === source[key].length && source[key].every((id) => allowed.includes(id)) &&
    (!source[key].some((id) => exclusive.includes(id)) || source[key].length === 1)
    ? [...source[key]] : [];
  const q4ExclusiveIds = voice.q4ExclusiveOptions.map(({ id }) => id);
  const futureExclusiveIds = voice.futureExclusiveOptions.map(({ id }) => id);
  const valuableFeatures = selected("valuable_features", [...featureIds, ...q4ExclusiveIds], q4ExclusiveIds);
  const unusedFeatures = selected("unused_features", [...featureIds, ...q4ExclusiveIds], q4ExclusiveIds);
  const objectStrings = (key, allowedKeys) => {
    const object = source[key] && typeof source[key] === "object" && !Array.isArray(source[key]) ? source[key] : {};
    return Object.fromEntries(Object.entries(object)
      .filter(([id, value]) => allowedKeys.includes(id) && typeof value === "string"));
  };
  const values = {
    play_frequency_1m: string("play_frequency_1m"),
    primary_play_device_1m: string("primary_play_device_1m"),
    reference_period_end_on: validIsoDate(source.reference_period_end_on)
      ? source.reference_period_end_on : referencePeriodEndInJst(voice.referencePeriodEndOffsetDays),
    usage_1m: string("usage_1m"),
    overall_satisfaction: string("overall_satisfaction"),
    unprompted_need: string("unprompted_need"),
    info_seek_days_1m: string("info_seek_days_1m"),
    recording_preference: string("recording_preference"),
    valuable_features: valuableFeatures,
    valuable_feature_reasons: objectStrings("valuable_feature_reasons", valuableFeatures.filter((id) => featureIds.includes(id))),
    unused_features: unusedFeatures,
    unused_feature_reason_by_feature: objectStrings(
      "unused_feature_reason_by_feature", unusedFeatures.filter((id) => featureIds.includes(id)),
    ),
    primary_problem: string("primary_problem"),
    dormant_reason: string("dormant_reason"),
    problem_comment: string("problem_comment"),
    problem_outcome: string("problem_outcome"),
    future_role: string("future_role"),
    future_role_other: string("future_role_other"),
    future_candidates: selected("future_candidates", [...futureIds, "other", ...futureExclusiveIds], futureExclusiveIds).slice(0, 3),
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
    answer_notes: Object.fromEntries(voice.answerNoteKeys.map((key) => [
      key,
      typeof source.answer_notes?.[key] === "string" ? source.answer_notes[key] : "",
    ])),
  };
  if (schemaVersion === 7) {
    delete values.problem_outcome;
    values.final_comment = string("final_comment");
  }
  const submissionToken = typeof stored.submission_token === "string" && /^[A-Za-z0-9_-]{43}$/.test(stored.submission_token)
    ? stored.submission_token : randomToken();
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

const playedInLastFourWeeks = (value) => [
  "lt_1h", "h1_lt3", "h3_lt7", "h7_lt14", "h14_plus",
].includes(value);

function pruneVoiceV4(voice, values, previousPriority = values.future_priority) {
  pruneVoiceV3(voice, values, previousPriority);
  if (!playedInLastFourWeeks(values.play_time_4w)) values.primary_play_device_4w = "";
}

const playedInLastMonth = (value) => [
  "less_than_weekly", "days_1_2_per_week", "days_3_4_per_week", "days_5_6_per_week", "daily",
].includes(value);

function pruneVoiceV5(voice, values, previousPriority = values.future_priority) {
  const hasExperience = Boolean(values.usage_1m) && values.usage_1m !== "never_used";
  const dormant = values.usage_1m === "inactive_1m";
  values.problem_comment = "";
  if (!playedInLastMonth(values.play_frequency_1m)) {
    values.primary_play_device_1m = "";
    values.answer_notes.primary_play_device_1m = "";
  }
  if (!hasExperience) {
    values.overall_satisfaction = "";
    values.valuable_features = [];
    values.valuable_feature_reasons = {};
    values.unused_features = [];
    values.unused_feature_reason_by_feature = {};
    values.primary_problem = "";
    values.dormant_reason = "";
    values.problem_comment = "";
    values.problem_outcome = "";
    for (const key of ["overall_satisfaction", "valuable_features", "unused_features", "primary_problem", "dormant_reason", "problem_outcome"]) {
      values.answer_notes[key] = "";
    }
  } else if (dormant) {
    values.primary_problem = "";
    values.problem_comment = "";
    values.problem_outcome = "";
    values.answer_notes.primary_problem = "";
    values.answer_notes.problem_outcome = "";
  } else {
    values.dormant_reason = "";
    values.answer_notes.dormant_reason = "";
    if (!concreteProblem(values.primary_problem)) {
      values.problem_comment = "";
      values.problem_outcome = "";
      values.answer_notes.problem_outcome = "";
    }
  }
  const selectedValuable = new Set(values.valuable_features.filter((id) => voice.features.some((feature) => feature.id === id)));
  for (const [id, reason] of Object.entries(values.valuable_feature_reasons)) {
    const cleaned = typeof reason === "string" ? reason.trim() : "";
    if (!selectedValuable.has(id) || !cleaned) delete values.valuable_feature_reasons[id];
    else values.valuable_feature_reasons[id] = cleaned;
  }
  const selectedUnused = new Set(values.unused_features.filter((id) => voice.features.some((feature) => feature.id === id)));
  values.unused_feature_reason_by_feature = Object.fromEntries(Object.entries(values.unused_feature_reason_by_feature)
    .filter(([id, reason]) => selectedUnused.has(id) && voice.unusedReasonOptions.some((option) => option.id === reason)));
  if (values.future_role !== "other") values.future_role_other = "";
  if (!values.future_candidates.includes("other")) values.future_other = "";
  const futureIds = new Set(voice.futureOptions.map(({ id }) => id));
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
    for (const key of ["future_detail_a", "future_detail_b", "improvement_vs_candidate"]) values.answer_notes[key] = "";
  }
  if (!rankable.length) values.answer_notes.future_priority = "";
  if (values.future_priority !== "other") values.future_detail_other = "";
  const detail = voice.futureDetailOptions[values.future_priority];
  if (!detail) {
    values.answer_notes.future_detail_a = "";
    values.answer_notes.future_detail_b = "";
  }
  if (!["days_15_plus", "days_5_14", "days_1_4"].includes(values.usage_1m) ||
    !concreteProblem(values.primary_problem) || !futureIds.has(values.future_priority)) {
    values.improvement_vs_candidate = "";
    values.answer_notes.improvement_vs_candidate = "";
  }
}

function pruneVoiceV7(voice, values, previousPriority = values.future_priority) {
  pruneVoiceV5(voice, values, previousPriority);
  delete values.problem_outcome;
  delete values.answer_notes.problem_outcome;
}

function voiceTextarea(fieldset, value, maxLength, onInput, rows = 3, { codePoints = false } = {}) {
  const textarea = document.createElement("textarea");
  if (codePoints) textarea.dataset.maxLength = String(maxLength);
  else textarea.maxLength = maxLength;
  textarea.rows = rows;
  textarea.value = value;
  const count = document.createElement("span");
  count.className = "hint comment-count";
  const update = () => {
    const length = codePoints ? [...textarea.value].length : textarea.value.length;
    count.textContent = `${length} / ${maxLength}文字`;
    if (codePoints) textarea.setAttribute("aria-invalid", String(length > maxLength));
  };
  textarea.addEventListener("input", () => {
    onInput(textarea.value);
    update();
  });
  update();
  v5ControlRoot(fieldset).append(textarea, count);
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

function v5ChoiceGroup(fieldset, name, options, value, onChange, auxiliaryIds = []) {
  const auxiliary = new Set(auxiliaryIds);
  const groups = [
    { className: "primary-option-section", options: options.filter(({ id }) => !auxiliary.has(id)) },
    { className: "exclusive-option-section", options: options.filter(({ id }) => auxiliary.has(id)) },
  ];
  for (const group of groups) {
    if (!group.options.length) continue;
    const section = document.createElement("section");
    section.className = group.className;
    if (group.className === "exclusive-option-section") {
      const heading = document.createElement("h3");
      heading.textContent = "上の選択肢に当てはまらない場合";
      section.append(heading);
    }
    const choices = document.createElement("div");
    choices.className = "choice-grid";
    for (const option of group.options) {
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
    section.append(choices);
    v5ControlRoot(fieldset).append(section);
  }
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

function v5OptionalNote(fieldset, key, values, maxLength, onInput, {
  summaryText = "回答について補足する（任意）",
} = {}) {
  const details = document.createElement("details");
  details.className = "optional-note";
  const summary = document.createElement("summary");
  summary.textContent = summaryText;
  const label = document.createElement("label");
  label.className = "optional-note-label";
  const labelCopy = document.createElement("span");
  labelCopy.textContent = "補足したいことがあれば入力してください。";
  const textarea = document.createElement("textarea");
  textarea.rows = 3;
  textarea.dataset.maxLength = String(maxLength);
  textarea.value = values.answer_notes[key] || "";
  const count = document.createElement("span");
  count.className = "hint comment-count";
  const update = () => {
    const length = [...textarea.value].length;
    count.textContent = `${length} / ${maxLength}文字`;
    textarea.setAttribute("aria-invalid", String(length > maxLength));
  };
  textarea.addEventListener("input", () => {
    values.answer_notes[key] = textarea.value;
    update();
    onInput();
  });
  update();
  if (textarea.value) details.open = true;
  label.append(labelCopy, textarea);
  details.append(summary, label, count);
  v5ControlRoot(fieldset).append(details);
}

function v6OptionalNote(fieldset, key, values, maxLength, onInput, {
  summaryText = "回答について補足する（任意）",
} = {}) {
  const section = document.createElement("section");
  section.className = "optional-note v6-optional-note";
  const heading = document.createElement("h3");
  heading.className = "optional-note-heading";
  heading.textContent = summaryText;
  const label = document.createElement("label");
  label.className = "optional-note-label";
  const labelCopy = document.createElement("span");
  labelCopy.textContent = "補足したいことがあれば入力してください。";
  const textarea = document.createElement("textarea");
  textarea.rows = 3;
  textarea.dataset.maxLength = String(maxLength);
  textarea.value = values.answer_notes[key] || "";
  const count = document.createElement("span");
  count.className = "hint comment-count";
  const update = () => {
    const length = [...textarea.value].length;
    count.textContent = `${length} / ${maxLength}文字`;
    textarea.setAttribute("aria-invalid", String(length > maxLength));
  };
  textarea.addEventListener("input", () => {
    values.answer_notes[key] = textarea.value;
    update();
    onInput();
  });
  update();
  label.append(labelCopy, textarea);
  section.append(heading, label, count);
  v5ControlRoot(fieldset).append(section);
}

function v5FeatureSelection(fieldset, groups, exclusiveOptions, selected, {
  comments = null,
  commentMaxLength = 400,
  maxLength = Number.POSITIVE_INFINITY,
  onChange,
  onComment,
  commentsAfterSelection = false,
  onRenderSelection = null,
}) {
  let currentSelected = [...selected];
  const exclusiveIds = new Set(exclusiveOptions.map(({ id }) => id));
  const normalIds = new Set(groups.flatMap(({ options }) => options.map(({ id }) => id)));
  const content = document.createElement("div");
  const render = (focusId = "") => {
    content.replaceChildren();
    if (Number.isFinite(maxLength)) {
      const limit = document.createElement("p");
      limit.className = "selection-limit-status";
      limit.setAttribute("aria-live", "polite");
      limit.textContent = `${currentSelected.filter((id) => !exclusiveIds.has(id)).length} / ${maxLength}件選択中`;
      content.append(limit);
    }
    for (const group of groups) {
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
        const row = document.createElement("div");
        row.className = "feature-choice-row";
        const label = document.createElement("label");
        label.className = "choice described-choice";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.name = fieldset.dataset.errorId;
        input.value = option.id;
        input.checked = currentSelected.includes(option.id);
        input.disabled = !input.checked && currentSelected.filter((id) => !exclusiveIds.has(id)).length >= maxLength;
        const copy = document.createElement("span");
        copy.textContent = option.label;
        if (option.description) {
          const description = document.createElement("small");
          description.textContent = option.description;
          copy.append(description);
        }
        input.addEventListener("change", () => {
          const next = input.checked
            ? [...currentSelected.filter((id) => !exclusiveIds.has(id)), option.id].slice(0, maxLength)
            : currentSelected.filter((id) => id !== option.id);
          currentSelected = next;
          onChange(next, option.id);
          if (!content.isConnected) return;
          render(option.id);
        });
        label.append(input, copy);
        row.append(label);
        if (comments && input.checked && !commentsAfterSelection) {
          const label = document.createElement("label");
          label.className = "feature-comment-label";
          label.textContent = "この機能が役立っている理由や、今後も残してほしい点（任意）";
          const comment = document.createElement("textarea");
          comment.rows = 3;
          comment.dataset.maxLength = String(commentMaxLength);
          comment.setAttribute("aria-label", `${option.label}が役立っている理由（任意）`);
          comment.value = comments[option.id] || "";
          const count = document.createElement("span");
          count.className = "hint comment-count";
          const updateCount = () => {
            const length = [...comment.value].length;
            count.textContent = `${length} / ${commentMaxLength}文字`;
            comment.setAttribute("aria-invalid", String(length > commentMaxLength));
          };
          comment.addEventListener("input", () => {
            if (comment.value.trim()) comments[option.id] = comment.value;
            else delete comments[option.id];
            updateCount();
            onComment();
          });
          updateCount();
          label.append(comment, count);
          row.append(label);
        }
        choices.append(row);
      }
      section.append(choices);
      content.append(section);
    }
    const exclusive = document.createElement("section");
    exclusive.className = "exclusive-option-section";
    const heading = document.createElement("h3");
    heading.textContent = "当てはまる機能がない場合";
    const choices = document.createElement("div");
    choices.className = "choice-grid";
    for (const option of exclusiveOptions) {
      const label = document.createElement("label");
      label.className = "choice";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = fieldset.dataset.errorId;
      input.value = option.id;
      input.checked = currentSelected.includes(option.id);
      input.addEventListener("change", () => {
        const next = input.checked ? [option.id] : [];
        currentSelected = next;
        onChange(next, option.id);
        if (!content.isConnected) return;
        render(option.id);
      });
      label.append(input, document.createTextNode(option.label));
      choices.append(label);
    }
    exclusive.append(heading, choices);
    content.append(exclusive);
    if (comments && commentsAfterSelection) {
      const optionById = new Map(groups.flatMap(({ options }) => options).map((option) => [option.id, option]));
      const selectedOptions = currentSelected.map((id) => optionById.get(id)).filter(Boolean);
      if (selectedOptions.length) {
        const commentSection = document.createElement("section");
        commentSection.className = "feature-comment-section";
        const commentHeading = document.createElement("h3");
        commentHeading.textContent = "選んだ機能について";
        const commentHelp = document.createElement("p");
        commentHelp.className = "question-hint";
        commentHelp.textContent = "選んだ機能ごとに、役立っている理由や今後も残してほしい点を入力できます。（任意）";
        commentSection.append(commentHeading, commentHelp);
        for (const option of selectedOptions) {
          const label = document.createElement("label");
          label.className = "feature-comment-label";
          const labelCopy = document.createElement("span");
          labelCopy.textContent = `${option.label}（任意）`;
          const comment = document.createElement("textarea");
          comment.rows = 2;
          comment.dataset.maxLength = String(commentMaxLength);
          comment.setAttribute("aria-label", `${option.label}が役立っている理由（任意）`);
          comment.value = comments[option.id] || "";
          const count = document.createElement("span");
          count.className = "hint comment-count";
          const updateCount = () => {
            const length = [...comment.value].length;
            count.textContent = `${length} / ${commentMaxLength}文字`;
            comment.setAttribute("aria-invalid", String(length > commentMaxLength));
          };
          comment.addEventListener("input", () => {
            if (comment.value.trim()) comments[option.id] = comment.value;
            else delete comments[option.id];
            updateCount();
            onComment();
          });
          updateCount();
          label.append(labelCopy, comment, count);
          commentSection.append(label);
        }
        content.append(commentSection);
      }
    }
    onRenderSelection?.([...currentSelected]);
    if (focusId && (normalIds.has(focusId) || exclusiveIds.has(focusId))) {
      content.querySelector(`input[value="${CSS.escape(focusId)}"]`)?.focus();
    }
  };
  v5ControlRoot(fieldset).append(content);
  render();
}

function v6UnusedReasonFields(voice, values, save, selected) {
  const featureById = new Map(voice.features.map((feature) => [feature.id, feature]));
  const selectedIds = selected.filter((id) => featureById.has(id));
  const card = voiceFieldset(
    "unused_reasons",
    selectedIds.length
      ? "選んだ機能をあまり使っていない理由を、それぞれ1つ選んでください。"
      : "補足コメント（任意）",
    { required: Boolean(selectedIds.length), className: "v5-question" },
  );
  const root = v5ControlRoot(card);
  for (const featureId of selectedIds) {
    const group = document.createElement("fieldset");
    group.className = "unused-reason-group";
    const legend = document.createElement("legend");
    legend.textContent = featureById.get(featureId).label;
    const choices = document.createElement("div");
    choices.className = "choice-grid";
    for (const reason of voice.unusedReasonOptions) {
      const label = document.createElement("label");
      label.className = "choice";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = `unused-reason-${featureId}`;
      input.value = reason.id;
      input.checked = values.unused_feature_reason_by_feature[featureId] === reason.id;
      input.addEventListener("change", () => {
        values.unused_feature_reason_by_feature[featureId] = reason.id;
        save();
      });
      label.append(input, document.createTextNode(reason.label));
      choices.append(label);
    }
    group.append(legend, choices);
    root.append(group);
  }
  v6OptionalNote(card, "unused_features", values, voice.answerNoteMaxLength, save, {
    summaryText: "あまり使っていない機能や、その理由について補足があれば教えてください。（任意）",
  });
  return card;
}

function v5ReasonBoard(fieldset, voice, values, save) {
  const featureById = new Map(voice.features.map((feature) => [feature.id, feature]));
  const selectedIds = values.unused_features.filter((id) => featureById.has(id));
  let activeFeatureId = "";
  let lastMove = null;
  const status = document.createElement("p");
  status.className = "sr-only";
  status.setAttribute("aria-live", "polite");
  const board = document.createElement("div");
  board.className = "reason-board";
  const assign = (featureId, reasonId, focusReason = "") => {
    if (!featureById.has(featureId) || !voice.unusedReasonOptions.some(({ id }) => id === reasonId)) return;
    const previous = values.unused_feature_reason_by_feature[featureId] || "";
    if (previous === reasonId) return;
    lastMove = { featureId, previous };
    values.unused_feature_reason_by_feature[featureId] = reasonId;
    activeFeatureId = "";
    save();
    status.textContent = `${featureById.get(featureId).label}を「${voice.unusedReasonOptions.find(({ id }) => id === reasonId).label}」へ分類しました。`;
    render(focusReason);
  };
  const featureChip = (featureId) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "reason-feature-chip";
    button.dataset.featureId = featureId;
    button.setAttribute("aria-pressed", String(activeFeatureId === featureId));
    button.setAttribute("aria-label", `${featureById.get(featureId).label}。選択してから分類先を選べます`);
    const copy = document.createElement("span");
    copy.textContent = featureById.get(featureId).label;
    const handle = document.createElement("span");
    handle.className = "reason-drag-handle";
    handle.draggable = true;
    handle.setAttribute("aria-hidden", "true");
    handle.textContent = "↕";
    const description = document.createElement("span");
    description.className = "sr-only";
    description.id = `reason-feature-help-${featureId}`;
    const currentReason = voice.unusedReasonOptions.find(({ id }) =>
      id === values.unused_feature_reason_by_feature[featureId])?.label;
    description.textContent = currentReason
      ? `現在の分類は「${currentReason}」です。EnterまたはSpaceで選択し、分類先を選ぶと変更できます。Escapeで選択を解除できます。`
      : "現在は未分類です。EnterまたはSpaceで選択し、続けて分類先を選んでください。Escapeで選択を解除できます。";
    button.setAttribute("aria-describedby", description.id);
    button.append(copy, handle, description);
    let suppressClick = false;
    button.addEventListener("click", () => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      activeFeatureId = activeFeatureId === featureId ? "" : featureId;
      const selected = Boolean(activeFeatureId);
      status.textContent = activeFeatureId
        ? `${featureById.get(featureId).label}を選択しました。続けて分類先を選んでください。`
        : "分類する機能の選択を解除しました。";
      render();
      if (selected) board.querySelector(".reason-assign-button:not(:disabled)")?.focus();
      else board.querySelector(`[data-feature-id="${CSS.escape(featureId)}"]`)?.focus();
    });
    button.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        activeFeatureId = "";
        render();
        board.querySelector(`[data-feature-id="${CSS.escape(featureId)}"]`)?.focus();
      }
    });
    handle.addEventListener("dragstart", (event) => {
      activeFeatureId = featureId;
      event.dataTransfer?.setData("text/plain", featureId);
      event.dataTransfer?.setDragImage(button, 12, 12);
      button.classList.add("dragging");
    });
    handle.addEventListener("dragend", () => button.classList.remove("dragging"));
    let pointerStart = null;
    const cancelPointerDrag = () => {
      pointerStart = null;
      button.classList.remove("dragging");
      for (const bucket of board.querySelectorAll("[data-reason-id]")) bucket.classList.remove("drag-over");
    };
    handle.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse") return;
      pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
      handle.setPointerCapture?.(event.pointerId);
    });
    handle.addEventListener("pointermove", (event) => {
      if (!pointerStart || pointerStart.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 8) {
        activeFeatureId = featureId;
        button.classList.add("dragging");
        for (const bucket of board.querySelectorAll("[data-reason-id]")) bucket.classList.remove("drag-over");
        document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-reason-id]")?.classList.add("drag-over");
      }
    });
    handle.addEventListener("pointerup", (event) => {
      if (!pointerStart || pointerStart.id !== event.pointerId) return;
      const moved = button.classList.contains("dragging");
      cancelPointerDrag();
      if (!moved) return;
      const reasonId = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-reason-id]")?.dataset.reasonId;
      if (reasonId) {
        suppressClick = true;
        assign(featureId, reasonId, reasonId);
      }
    });
    handle.addEventListener("pointercancel", () => {
      const cancelled = Boolean(pointerStart) || button.classList.contains("dragging");
      cancelPointerDrag();
      if (cancelled) status.textContent = `${featureById.get(featureId).label}のドラッグをキャンセルしました。`;
    });
    return button;
  };
  const render = (focusReason = "") => {
    board.replaceChildren();
    const help = document.createElement("p");
    help.className = "reason-help";
    help.textContent = "機能を理由の枠へドラッグしてください。機能をタップしてから理由をタップする方法や、Tab・Enterキーでも分類できます。";
    const unassigned = document.createElement("section");
    unassigned.className = "reason-source";
    const sourceHeading = document.createElement("h3");
    const unassignedIds = selectedIds.filter((featureId) => !values.unused_feature_reason_by_feature[featureId]);
    sourceHeading.textContent = `未分類 ${unassignedIds.length}件`;
    const sourceList = document.createElement("div");
    sourceList.className = "reason-chip-list";
    for (const id of unassignedIds) {
      sourceList.append(featureChip(id));
    }
    if (!sourceList.childElementCount) {
      const done = document.createElement("p");
      done.className = "reason-empty";
      done.textContent = "すべて分類できました。";
      sourceList.append(done);
    }
    unassigned.append(sourceHeading, sourceList);
    const buckets = document.createElement("div");
    buckets.className = "reason-buckets";
    for (const reason of voice.unusedReasonOptions) {
      const bucket = document.createElement("section");
      bucket.className = "reason-bucket";
      bucket.dataset.reasonId = reason.id;
      bucket.addEventListener("dragover", (event) => {
        event.preventDefault();
        bucket.classList.add("drag-over");
      });
      bucket.addEventListener("dragleave", () => bucket.classList.remove("drag-over"));
      bucket.addEventListener("drop", (event) => {
        event.preventDefault();
        bucket.classList.remove("drag-over");
        assign(event.dataTransfer?.getData("text/plain") || activeFeatureId, reason.id, reason.id);
      });
      const heading = document.createElement("h3");
      const assignedIds = selectedIds.filter((featureId) => values.unused_feature_reason_by_feature[featureId] === reason.id);
      heading.textContent = `${reason.label} (${assignedIds.length}件)`;
      const assignButton = document.createElement("button");
      assignButton.type = "button";
      assignButton.className = "reason-assign-button";
      assignButton.dataset.assignReasonId = reason.id;
      assignButton.disabled = !activeFeatureId;
      assignButton.textContent = activeFeatureId ? "選択中の機能をここへ移動" : "先に機能を選択";
      assignButton.addEventListener("click", () => {
        if (activeFeatureId) assign(activeFeatureId, reason.id, reason.id);
      });
      assignButton.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          const featureId = activeFeatureId;
          activeFeatureId = "";
          status.textContent = "分類する機能の選択を解除しました。";
          render();
          board.querySelector(`[data-feature-id="${CSS.escape(featureId)}"]`)?.focus();
          return;
        }
        if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) return;
        event.preventDefault();
        const controls = [...board.querySelectorAll(".reason-assign-button")];
        const delta = ["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1;
        controls[(controls.indexOf(assignButton) + delta + controls.length) % controls.length]?.focus();
      });
      const list = document.createElement("div");
      list.className = "reason-chip-list";
      for (const id of assignedIds) {
        list.append(featureChip(id));
      }
      bucket.append(heading, assignButton, list);
      buckets.append(bucket);
    }
    board.append(help, unassigned, buckets);
    if (lastMove) {
      const undo = document.createElement("button");
      undo.type = "button";
      undo.className = "text-button reason-undo";
      undo.textContent = "直前の分類を元に戻す";
      undo.addEventListener("click", () => {
        const move = lastMove;
        lastMove = null;
        if (move.previous) values.unused_feature_reason_by_feature[move.featureId] = move.previous;
        else delete values.unused_feature_reason_by_feature[move.featureId];
        save();
        status.textContent = "直前の分類を元に戻しました。";
        render();
      });
      board.append(undo);
    }
    if (focusReason) board.querySelector(`[data-assign-reason-id="${CSS.escape(focusReason)}"]`)?.focus();
  };
  v5ControlRoot(fieldset).append(status, board);
  render();
}

function v3ReviewRow(label, value) {
  const row = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;
  row.append(strong, document.createTextNode(value));
  return row;
}

function buildVoiceV3Pages(slug, survey, values, submissionToken, rerender, {
  validateAnswers = validateVoiceV3Answers,
  pruneAnswers = pruneVoiceV3,
  schemaVersion = 3,
  includeSegments = false,
} = {}) {
  const { voice } = survey;
  const save = () => saveVoiceV3Draft(slug, submissionToken, values, schemaVersion);
  const change = (callback, { rebuild = false, previousPriority = values.future_priority } = {}) => {
    callback();
    pruneAnswers(voice, values, previousPriority);
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
        ...(includeSegments ? ["ゲームのプレイ量や記録の希望ごとに分けて集計し、異なる利用スタイルの改善に活かします"] : []),
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
          v5ControlRoot(satisfaction).append(hint);
        }
        v3ChoiceGroup(satisfaction, "v3-satisfaction", voice.overallSatisfactionOptions, values.overall_satisfaction, (id) => change(() => {
          values.overall_satisfaction = id;
        }));
        page.append(satisfaction);
      }
    },
    validate: () => validateAnswers(voice, values).missing.filter((id) => ["usage_30d", "overall_satisfaction"].includes(id)),
  }, {
    key: "unprompted",
    render: (page) => {
      page.append(voicePageTitle("候補を見る前に", "思いつかなければ、空欄のまま次へ進めます。"));
      const field = voiceFieldset("unprompted_need", "最近のゲーム生活で、『こうできたら、もっとよいのに』と感じたことはありますか？", { required: false });
      const hint = document.createElement("p");
      hint.className = "question-hint";
      hint.textContent = "PlayNavi以外での出来事でもかまいません。短いひとことで大丈夫です。";
      v5ControlRoot(field).append(hint);
      voiceTextarea(field, values.unprompted_need, voice.unpromptedMaxLength, (value) => change(() => {
        values.unprompted_need = value;
      }));
      page.append(field);
    },
    validate: () => [],
  }];

  if (includeSegments) {
    pages.splice(1, 0, {
      key: "play_segment",
      render: (page) => {
        const start = periodStart(values.reference_period_end_on, voice.referencePeriodDays);
        page.append(voicePageTitle(
          "最近のゲームプレイ",
          `対象期間は${displayDate(start)}〜${displayDate(values.reference_period_end_on)}です。忙しい週と遊んだ週を含め、おおよそでお答えください。`,
        ));
        const gameplay = voiceFieldset(
          "play_time_4w",
          "この4週間、ゲームで遊ぶ時間は1週間あたりどのくらいでしたか？",
        );
        const gameplayHint = document.createElement("p");
        gameplayHint.className = "question-hint";
        gameplayHint.textContent = "家庭用ゲーム機・PC・スマホを合計します。ゲーム動画を見る時間は含めません。正確に合計して4で割る必要はありません。";
        gameplay.append(gameplayHint);
        v3ChoiceGroup(gameplay, "v4-gameplay-hours", voice.playTimeOptions, values.play_time_4w, (id) => change(() => {
          values.play_time_4w = id;
        }, { rebuild: true }));
        page.append(gameplay);
        if (playedInLastFourWeeks(values.play_time_4w)) {
          const device = voiceFieldset(
            "primary_play_device_4w",
            "この4週間、最も長い時間ゲームで遊んだ機器はどれですか？",
          );
          const deviceHint = document.createElement("p");
          deviceHint.className = "question-hint";
          deviceHint.textContent = "所有している機器の一覧ではなく、最近主に遊んだ機器を、おおよそでお答えください。";
          device.append(deviceHint);
          v3ChoiceGroup(device, "v4-primary-device", voice.primaryDeviceOptions, values.primary_play_device_4w, (id) => change(() => {
            values.primary_play_device_4w = id;
          }));
          page.append(device);
        }
      },
      validate: () => validateAnswers(voice, values).missing.filter((id) => [
        "reference_period_end_on", "play_time_4w", "primary_play_device_4w",
      ].includes(id)),
    });
    const unpromptedIndex = pages.findIndex(({ key }) => key === "unprompted");
    pages.splice(unpromptedIndex + 1, 0, {
      key: "style_segment",
      render: (page) => {
        const start = periodStart(values.reference_period_end_on, voice.referencePeriodDays);
        page.append(voicePageTitle("ゲーム情報と記録の希望", `情報収集は${displayDate(start)}〜${displayDate(values.reference_period_end_on)}についてお答えください。`));
        const info = voiceFieldset(
          "info_seek_days_4w",
          "この4週間、ゲームの情報を自分から見に行った日は、どのくらいありましたか？",
        );
        const infoHint = document.createElement("p");
        infoHint.className = "question-hint";
        infoHint.textContent = "記事・紹介動画・SNSの投稿などが対象です。たまたま目に入っただけの場合は含めません。正確に数え直す必要はありません。";
        info.append(infoHint);
        v3ChoiceGroup(info, "v4-info-seeking", voice.infoSeekOptions, values.info_seek_days_4w, (id) => change(() => {
          values.info_seek_days_4w = id;
        }));
        const record = voiceFieldset(
          "recording_preference",
          "遊んだゲームについて、どの程度の記録を残したいですか？",
        );
        v3ChoiceGroup(record, "v4-record-detail", voice.recordingPreferenceOptions, values.recording_preference, (id) => change(() => {
          values.recording_preference = id;
        }));
        page.append(info, record);
      },
      validate: () => validateAnswers(voice, values).missing.filter((id) => [
        "info_seek_days_4w", "recording_preference",
      ].includes(id)),
    });
  }

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
    validate: () => validateAnswers(voice, values).missing.filter((id) => ["valuable_features", "unused_reason"].includes(id)),
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
    validate: () => validateAnswers(voice, values).missing.filter((id) => ["primary_problem", "dormant_reason"].includes(id)),
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
    validate: () => validateAnswers(voice, values).missing.filter((id) => id === "problem_outcome"),
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
    validate: () => validateAnswers(voice, values).missing.filter((id) => id === "future_role"),
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
    validate: () => validateAnswers(voice, values).missing.filter((id) => id === "future_candidates"),
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
    validate: () => validateAnswers(voice, values).missing.filter((id) => id === "future_priority"),
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
    validate: () => validateAnswers(voice, values).missing.filter((id) => id === "improvement_vs_candidate"),
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
      const segmentRows = includeSegments ? [
        v3ReviewRow("最近のプレイ時間", voice.playTimeOptions.find((option) => option.id === values.play_time_4w)?.label || "未回答"),
        ...(playedInLastFourWeeks(values.play_time_4w) ? [v3ReviewRow(
          "主に遊んだ機器",
          voice.primaryDeviceOptions.find((option) => option.id === values.primary_play_device_4w)?.label || "未回答",
        )] : []),
        v3ReviewRow("ゲーム情報を見に行った日", voice.infoSeekOptions.find((option) => option.id === values.info_seek_days_4w)?.label || "未回答"),
        v3ReviewRow("希望する記録", voice.recordingPreferenceOptions.find((option) => option.id === values.recording_preference)?.label || "未回答"),
      ] : [];
      review.append(
        ...segmentRows,
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

function buildVoiceV4Pages(slug, survey, values, submissionToken, rerender) {
  return buildVoiceV3Pages(slug, survey, values, submissionToken, rerender, {
    validateAnswers: validateVoiceV4Answers,
    pruneAnswers: pruneVoiceV4,
    schemaVersion: 4,
    includeSegments: true,
  });
}

function buildVoiceV5Pages(slug, survey, values, submissionToken, rerender, {
  schemaVersion = 5,
  revisedUi = false,
} = {}) {
  const { voice } = survey;
  const validateMonthlyAnswers = schemaVersion === 7 ? validateVoiceV7Answers : validateVoiceV5Answers;
  const pruneMonthlyAnswers = schemaVersion === 7 ? pruneVoiceV7 : pruneVoiceV5;
  const save = () => saveVoiceV3Draft(slug, submissionToken, values, schemaVersion);
  const change = (callback, { rebuild = false, previousPriority = values.future_priority } = {}) => {
    callback();
    pruneMonthlyAnswers(voice, values, previousPriority);
    save();
    if (rebuild) rerender();
  };
  const optionalNote = revisedUi ? v6OptionalNote : v5OptionalNote;
  const note = (field, key) => optionalNote(field, key, values, voice.answerNoteMaxLength, save);
  const pages = [{
    key: "intro",
    render: (page) => {
      const intro = pageIntro();
      intro.querySelector("p").remove();
      intro.querySelector("ul").replaceChildren();
      const messages = survey.rewardEligible ? [
        "匿名形式のアンケートです。（ログイン情報は、報酬付与の判定にのみ利用します）",
        "回答内容にかかわらず、回答を送信すると報酬（称号）を受け取れます。",
        "報酬は、アンケート回答終了後、数日以内に配布します。",
      ] : [
        "匿名形式のアンケートです。（PlayNaviのログイン情報は使用しません）",
        "ゲスト回答では、報酬（称号）を受け取れません。",
        "設問と回答内容の扱いは、アカウントで回答する場合と同じです。",
      ];
      for (const message of messages) {
        const item = document.createElement("li");
        item.textContent = message;
        intro.querySelector("ul").append(item);
      }
      page.append(intro);
    },
    validate: () => [],
  }, {
    key: "play_segment",
    render: (page) => {
      page.append(voicePageTitle("最近のゲームプレイ"));
      const frequency = voiceFieldset("play_frequency_1m", "直近1ヶ月間、ゲームで遊んだ頻度はどのくらいでしたか？", { className: "v5-question" });
      v5ChoiceGroup(frequency, "v5-play-frequency", voice.playFrequencyOptions, values.play_frequency_1m, (id) => change(() => {
        values.play_frequency_1m = id;
      }, { rebuild: true }), ["unknown", "prefer_not"]);
      note(frequency, "play_frequency_1m");
      page.append(frequency);
      if (playedInLastMonth(values.play_frequency_1m)) {
        const device = voiceFieldset("primary_play_device_1m", "直近1ヶ月間、ゲームで最もよく使った機器はどれですか？", { className: "v5-question" });
        v5ChoiceGroup(device, "v5-primary-device", voice.primaryDeviceOptions, values.primary_play_device_1m, (id) => change(() => {
          values.primary_play_device_1m = id;
        }), ["tie", "unknown", "prefer_not"]);
        note(device, "primary_play_device_1m");
        page.append(device);
      }
    },
    validate: () => validateMonthlyAnswers(voice, values).missing.filter((id) => [
      "reference_period_end_on", "play_frequency_1m", "primary_play_device_1m",
    ].includes(id)),
  }, {
    key: "basic",
    render: (page) => {
      page.append(voicePageTitle("PlayNaviの利用状況"));
      const usage = voiceFieldset("usage_1m", "直近1ヶ月間に、PlayNaviを使った日はどのくらいありましたか？", { className: "v5-question" });
      v5ChoiceGroup(usage, "v5-usage", voice.usageOptions, values.usage_1m, (id) => change(() => {
        values.usage_1m = id;
      }, { rebuild: true }), ["unknown"]);
      note(usage, "usage_1m");
      page.append(usage);
      if (values.usage_1m && values.usage_1m !== "never_used") {
        const satisfaction = voiceFieldset("overall_satisfaction", "PlayNaviを利用したときの全体的な満足度を教えてください。", { className: "v5-question" });
        if (values.usage_1m === "inactive_1m") {
          const hint = document.createElement("p");
          hint.className = "question-hint";
          hint.textContent = "最後に利用したときの印象でお答えください。";
          satisfaction.append(hint);
        }
        v5ChoiceGroup(satisfaction, "v5-satisfaction", voice.overallSatisfactionOptions, values.overall_satisfaction, (id) => change(() => {
          values.overall_satisfaction = id;
        }), ["unknown"]);
        note(satisfaction, "overall_satisfaction");
        page.append(satisfaction);
      }
    },
    validate: () => validateMonthlyAnswers(voice, values).missing.filter((id) => ["usage_1m", "overall_satisfaction"].includes(id)),
  }, {
    key: "unprompted",
    render: (page) => {
      page.append(voicePageTitle("ゲームについて感じていること"));
      const field = voiceFieldset("unprompted_need", revisedUi
        ? "日頃ゲームを楽しむなかで、「こういうことがしたいのにできない」と感じることがあれば教えてください。（任意）"
        : "ゲームを楽しむなかで、「こうできたらもっとよいのに」と感じることがあれば教えてください。（任意）", { required: false, className: "v5-question" });
      const hint = document.createElement("p");
      hint.className = "question-hint";
      hint.textContent = revisedUi
        ? "PlayNaviとは関係ないことでかまいません。思いつかなければ、空欄のまま次へ進めてください。"
        : "PlayNavi以外についてでもかまいません。思いつかなければ、空欄のまま次へ進めます。";
      (revisedUi ? v5ControlRoot(field) : field).append(hint);
      voiceTextarea(field, values.unprompted_need, voice.unpromptedMaxLength, (value) => change(() => { values.unprompted_need = value; }));
      page.append(field);
    },
    validate: () => [],
  }, {
    key: "style_segment",
    render: (page) => {
      page.append(voicePageTitle("ゲーム情報と記録"));
      const info = voiceFieldset("info_seek_days_1m", "直近1ヶ月間に、ゲームの情報を自分から見に行った日は、どのくらいありましたか？", { className: "v5-question" });
      const hint = document.createElement("p");
      hint.className = "question-hint";
      hint.textContent = "記事、紹介動画、SNSの投稿などを、自分から見た日についてお答えください。";
      v5ControlRoot(info).append(hint);
      v5ChoiceGroup(info, "v5-info-seeking", voice.infoSeekOptions, values.info_seek_days_1m, (id) => change(() => {
        values.info_seek_days_1m = id;
      }), ["unknown", "prefer_not"]);
      note(info, "info_seek_days_1m");
      const record = voiceFieldset("recording_preference", "遊んだゲームについて、どの程度の記録を残したいですか？", { className: "v5-question" });
      v5ChoiceGroup(record, "v5-record-detail", voice.recordingPreferenceOptions, values.recording_preference, (id) => change(() => {
        values.recording_preference = id;
      }), ["unknown", "prefer_not"]);
      note(record, "recording_preference");
      page.append(info, record);
    },
    validate: () => validateMonthlyAnswers(voice, values).missing.filter((id) => ["info_seek_days_1m", "recording_preference"].includes(id)),
  }];

  const hasExperience = Boolean(values.usage_1m) && values.usage_1m !== "never_used";
  const featureGroups = () => voice.categories.map((category) => ({
    id: category.id,
    label: category.label,
    options: [...category.features].sort((left, right) =>
      values.feature_display_order.indexOf(left.id) - values.feature_display_order.indexOf(right.id)),
  }));
  if (hasExperience) pages.push({
    key: "valuable",
    render: (page) => {
      page.append(voicePageTitle("役立っている機能"));
      const field = voiceFieldset("valuable_features", "現在のPlayNaviで、役に立っている、または今後も使いたい機能をすべて選んでください。", { className: "v5-question" });
      v5FeatureSelection(field, featureGroups(), voice.q4ExclusiveOptions, values.valuable_features, {
        comments: values.valuable_feature_reasons,
        commentMaxLength: voice.valuableReasonMaxLength,
        commentsAfterSelection: revisedUi,
        onChange: (next) => change(() => { values.valuable_features = next; }),
        onComment: save,
      });
      note(field, "valuable_features");
      page.append(field);
    },
    validate: () => validateMonthlyAnswers(voice, values).missing.filter((id) => id === "valuable_features"),
  }, {
    key: "unused",
    render: (page) => {
      page.append(voicePageTitle("あまり使っていない機能"));
      const field = voiceFieldset("unused_features", "現在のPlayNaviで、あまり使っていない機能をすべて選んでください。", { className: "v5-question" });
      const hint = document.createElement("p");
      hint.className = "question-hint";
      hint.textContent = revisedUi
        ? "選んだ機能について、このページの下で使っていない理由を伺います。"
        : "選んだ機能について、次の画面で使っていない理由を伺います。";
      v5ControlRoot(field).append(hint);
      const reasonSection = revisedUi ? document.createElement("div") : null;
      if (reasonSection) reasonSection.className = "unused-reason-section";
      const unusedExclusiveOptions = voice.q4ExclusiveOptions.map((option) => option.id === "none"
        ? { ...option, label: "あまり使っていない機能はない" }
        : option);
      v5FeatureSelection(field, featureGroups(), unusedExclusiveOptions, values.unused_features, {
        onChange: (next) => change(() => { values.unused_features = next; }),
        onComment: save,
        onRenderSelection: revisedUi ? (selected) => {
          reasonSection.replaceChildren(v6UnusedReasonFields(voice, values, save, selected));
        } : null,
      });
      if (revisedUi) page.append(field, reasonSection);
      else {
        if (!values.unused_features.some((id) => voice.features.some((feature) => feature.id === id))) note(field, "unused_features");
        page.append(field);
      }
    },
    validate: () => validateMonthlyAnswers(voice, values).missing.filter((id) =>
      revisedUi ? ["unused_features", "unused_reasons"].includes(id) : id === "unused_features"),
  });

  const unusedFeatureIds = values.unused_features.filter((id) => voice.features.some((feature) => feature.id === id));
  if (!revisedUi && hasExperience && unusedFeatureIds.length) pages.push({
    key: "unused_reasons",
    render: (page) => {
      page.append(voicePageTitle("使っていない理由"));
      const field = voiceFieldset("unused_reasons", "選んだ機能を、もっとも近い理由へ振り分けてください。", { className: "v5-question" });
      v5ReasonBoard(field, voice, values, save);
      optionalNote(field, "unused_features", values, voice.answerNoteMaxLength, save, {
        summaryText: "あまり使っていない機能や、その理由について補足があれば教えてください。（任意）",
      });
      page.append(field);
    },
    validate: () => validateMonthlyAnswers(voice, values).missing.filter((id) => id === "unused_reasons"),
  });

  if (hasExperience) pages.push({
    key: "problem",
    render: (page) => {
      const dormant = values.usage_1m === "inactive_1m";
      page.append(voicePageTitle(dormant ? "最近使っていない理由" : "改善してほしいこと"));
      if (dormant) {
        const field = voiceFieldset("dormant_reason", "直近1ヶ月間、PlayNaviを使わなかった主な理由を1つ選んでください。", { className: "v5-question" });
        v5ChoiceGroup(field, "v5-dormant", voice.dormantReasonOptions, values.dormant_reason, (id) => change(() => { values.dormant_reason = id; }), ["other", "none", "unknown"]);
        optionalNote(field, "dormant_reason", values, voice.answerNoteMaxLength, save, {
          summaryText: "選んだ内容について、具体的に伝えたいことがあれば教えてください。（任意）",
        });
        page.append(field);
      } else {
        const field = voiceFieldset("primary_problem", "PlayNaviで、いま最も改善してほしいことを1つ選んでください。", { className: "v5-question" });
        v5ChoiceGroup(field, "v5-problem", voice.problemOptions, values.primary_problem, (id) => change(() => {
          values.primary_problem = id;
          values.improvement_vs_candidate = "";
        }, { rebuild: true }), ["other", "none", "unknown"]);
        optionalNote(field, "primary_problem", values, voice.answerNoteMaxLength, save, {
          summaryText: "選んだ内容について、具体的に伝えたいことがあれば教えてください。（任意）",
        });
        page.append(field);
        if (revisedUi && schemaVersion !== 7 && concreteProblem(values.primary_problem)) {
          const sectionTitle = document.createElement("h3");
          sectionTitle.className = "voice-section-title";
          sectionTitle.textContent = "困りごとがあったときの行動";
          const outcome = voiceFieldset("problem_outcome", "その問題があったとき、最終的にどうしましたか？", { className: "v5-question" });
          v5ChoiceGroup(outcome, "v5-outcome", voice.problemOutcomeOptions, values.problem_outcome, (id) => change(() => { values.problem_outcome = id; }), ["forgot"]);
          note(outcome, "problem_outcome");
          page.append(sectionTitle, outcome);
        }
      }
    },
    validate: () => validateMonthlyAnswers(voice, values).missing.filter((id) =>
      (revisedUi && schemaVersion !== 7
        ? ["primary_problem", "dormant_reason", "problem_outcome"]
        : ["primary_problem", "dormant_reason"]).includes(id)),
  });
  if (!revisedUi && hasExperience && values.usage_1m !== "inactive_1m" && concreteProblem(values.primary_problem)) pages.push({
    key: "outcome",
    render: (page) => {
      page.append(voicePageTitle("困りごとがあったときの行動"));
      const field = voiceFieldset("problem_outcome", "その問題があったとき、最終的にどうしましたか？", { className: "v5-question" });
      v5ChoiceGroup(field, "v5-outcome", voice.problemOutcomeOptions, values.problem_outcome, (id) => change(() => { values.problem_outcome = id; }), ["forgot"]);
      note(field, "problem_outcome");
      page.append(field);
    },
    validate: () => validateMonthlyAnswers(voice, values).missing.filter((id) => id === "problem_outcome"),
  });

  pages.push({
    key: "future_role",
    render: (page) => {
      page.append(voicePageTitle("これから期待する役割"));
      const field = voiceFieldset("future_role", "これからのPlayNaviに、最も期待する役割を1つ選んでください。", { className: "v5-question" });
      v5ChoiceGroup(field, "v5-future-role", voice.futureRoleOptions, values.future_role, (id) => change(() => {
        values.future_role = id;
      }, { rebuild: true }), ["other", "no_expectation", "current_is_fine", "unknown"]);
      note(field, "future_role");
      if (values.future_role === "other") {
        const other = voiceFieldset("future_role_other", "その他の内容（任意）", { required: false, className: "v5-question" });
        voiceTextarea(other, values.future_role_other, voice.otherMaxLength, (value) => change(() => { values.future_role_other = value; }));
        page.append(field, other);
      } else page.append(field);
    },
    validate: () => validateMonthlyAnswers(voice, values).missing.filter((id) => id === "future_role"),
  }, {
    key: "future_candidates",
    render: (page) => {
      page.append(voicePageTitle("追加・強化してほしい機能", "次は、PlayNaviで検討している機能です。実現方法や提供時期は決まっていません。"));
      const field = voiceFieldset("future_candidates", "今後、追加・強化されたら使ってみたいものを、3つまで選んでください。", { className: "v5-question" });
      const ordered = values.future_display_order.map((id) => voice.futureOptions.find((option) => option.id === id));
      v5FeatureSelection(field, [{ id: "future", label: "", options: [...ordered, {
        id: "other", label: "このほかに希望がある", description: "内容の記入は任意です",
      }] }], voice.futureExclusiveOptions, values.future_candidates, {
        maxLength: voice.futureCandidateMax,
        onChange: (next) => change(() => { values.future_candidates = next; }, { rebuild: true }),
        onComment: save,
      });
      note(field, "future_candidates");
      page.append(field);
      if (values.future_candidates.includes("other")) {
        const other = voiceFieldset("future_other", "このほかの希望（任意）", { required: false, className: "v5-question" });
        voiceTextarea(other, values.future_other, voice.otherMaxLength, (value) => change(() => { values.future_other = value; }));
        page.append(other);
      }
    },
    validate: () => validateMonthlyAnswers(voice, values).missing.filter((id) => id === "future_candidates"),
  });

  const futureIds = new Set(voice.futureOptions.map(({ id }) => id));
  const rankable = values.future_candidates.filter((id) => futureIds.has(id) || id === "other");
  if (rankable.length) pages.push({
    key: "future_priority_detail",
    render: (page) => {
      page.append(voicePageTitle("期待する機能について"));
      if (rankable.length > 1) {
        const priority = voiceFieldset("future_priority", "選んだ候補のうち、最も期待するものを1つ選んでください。", { className: "v5-question" });
        const options = rankable.map((id) => id === "other" ? { id, label: "このほかの希望" } : voice.futureOptions.find((option) => option.id === id));
        v5ChoiceGroup(priority, "v5-priority", options, values.future_priority, (id) => change(() => {
          values.future_priority = id;
          values.future_priority_mode = "explicit";
        }, { rebuild: true, previousPriority: values.future_priority }));
        note(priority, "future_priority");
        page.append(priority);
      }
      if (values.future_priority === "other") {
        const other = voiceFieldset("future_detail_other", "希望する内容があれば教えてください。（任意）", { required: false, className: "v5-question" });
        voiceTextarea(other, values.future_detail_other || values.future_other, voice.otherMaxLength, (value) => change(() => { values.future_detail_other = value; }));
        page.append(other);
      } else {
        const detail = voice.futureDetailOptions[values.future_priority];
        if (detail) {
          const a = voiceFieldset("future_detail_a", detail.aPrompt, { required: false, className: "v5-question" });
          v5ChoiceGroup(a, "v5-detail-a", detail.aOptions, values.future_detail_a, (id) => change(() => { values.future_detail_a = id; }), ["other", "unknown", "none", "forgot", "never"]);
          note(a, "future_detail_a");
          const b = voiceFieldset("future_detail_b", detail.bPrompt, { required: false, className: "v5-question" });
          v5ChoiceGroup(b, "v5-detail-b", detail.bOptions, values.future_detail_b, (id) => change(() => { values.future_detail_b = id; }), ["other", "unknown", "none", "forgot", "never"]);
          note(b, "future_detail_b");
          page.append(a, b);
        }
      }
    },
    validate: () => validateMonthlyAnswers(voice, values).missing.filter((id) => ["future_priority"].includes(id)),
  });

  const compareRequired = ["days_15_plus", "days_5_14", "days_1_4"].includes(values.usage_1m) &&
    concreteProblem(values.primary_problem) && futureIds.has(values.future_priority);
  if (compareRequired) pages.push({
    key: "compare",
    render: (page) => {
      page.append(voicePageTitle("どちらを優先してほしいですか？"));
      const problem = voice.problemOptions.find((option) => option.id === values.primary_problem)?.label || "現在の問題";
      const candidate = voice.futureOptions.find((option) => option.id === values.future_priority)?.label || "新しい機能";
      const field = voiceFieldset("improvement_vs_candidate", "次の2つでは、どちらを先に進めてほしいですか？", { className: "v5-question" });
      v5ChoiceGroup(field, "v5-comparison", [
        { id: "improvement", label: `「${problem}」を改善する` },
        { id: "candidate", label: `「${candidate}」を追加・強化する` },
        { id: "tie", label: "どちらともいえない" },
      ], values.improvement_vs_candidate, (id) => change(() => { values.improvement_vs_candidate = id; }), ["tie"]);
      note(field, "improvement_vs_candidate");
      page.append(field);
    },
    validate: () => validateMonthlyAnswers(voice, values).missing.filter((id) => id === "improvement_vs_candidate"),
  });
  if (schemaVersion === 7) pages.push({
    key: "final_comment",
    render: (page) => {
      page.append(voicePageTitle("最後に"));
      const field = voiceFieldset(
        "final_comment",
        "最後に、ここまでに書けていないことで言いたいことや伝えたいことがあればご自由にお書きください。",
        { required: false, className: "v5-question" },
      );
      voiceTextarea(field, values.final_comment, voice.finalCommentMaxLength, (value) => change(() => {
        values.final_comment = value;
      }), 8, { codePoints: true });
      page.append(field);
    },
    validate: () => [],
  });
  pages.push({
    key: "review",
    render: (page) => {
      page.append(voicePageTitle("回答内容の確認", "修正する場合は「戻る」から各質問へ戻れます。"));
      const review = document.createElement("section");
      review.className = "review-card question-card";
      const noteCopy = document.createElement("p");
      noteCopy.textContent = "「回答を送信」を押すまで、回答はサーバーへ送信されません。";
      const privacy = document.createElement("p");
      privacy.className = "privacy-note";
      privacy.textContent = survey.rewardEligible
        ? "ログイン情報は称号付与の判定にだけ使い、回答本体へ保存しません。"
        : "ゲスト回答では称号を受け取れません。回答本体にログイン情報は含まれません。";
      review.append(noteCopy, privacy);
      page.append(review);
    },
    validate: () => [],
  });
  return pages;
}

function createVoiceV3Controller(slug, survey, values, submissionToken, {
  buildPages = buildVoiceV3Pages,
  pruneAnswers = pruneVoiceV3,
  schemaVersion = 3,
  fallbackPageKey = "basic",
} = {}) {
  let currentKey = "intro";
  const render = (requestedKey = currentKey, { focusHeading = true } = {}) => {
    pruneAnswers(survey.voice, values);
    saveVoiceV3Draft(slug, submissionToken, values, schemaVersion);
    const rerender = () => render(currentKey, { focusHeading: false });
    let pages = buildPages(slug, survey, values, submissionToken, rerender);
    let current = pages.findIndex((page) => page.key === requestedKey);
    if (current < 0) current = Math.max(0, pages.findIndex((page) => page.key === currentKey));
    if (current < 0) current = 0;
    currentKey = pages[current].key;
    const container = document.createElement("section");
    container.className = `survey-step-page voice-step-page reviewed-voice-step schema-v${schemaVersion}-step`;
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
      const invalidText = schemaVersion >= 5
        ? elements.questions.querySelector('textarea[aria-invalid="true"]')
        : null;
      if (invalidText) {
        elements.error.textContent = `自由記述は${invalidText.dataset.maxLength || 400}文字以内で入力してください。`;
        setVisible(elements.error, true);
        invalidText.focus();
        return;
      }
      const missing = pages[current].validate();
      markVoiceMissing(missing);
      if (missing.length) {
        elements.error.textContent = "この画面の必須項目に回答してください。";
        setVisible(elements.error, true);
        focusVoiceError(missing[0]);
        return;
      }
      pages = buildPages(slug, survey, values, submissionToken, () => {});
      const fresh = pages.findIndex((page) => page.key === currentKey);
      render(pages[Math.min(fresh + 1, pages.length - 1)].key);
    };
  };
  render();
  return {
    showError(id, message) {
      const pages = buildPages(slug, survey, values, submissionToken, () => {});
      const target = pages.find((page) => page.validate().includes(id));
      render(target?.key || fallbackPageKey, { focusHeading: false });
      elements.error.textContent = message;
      setVisible(elements.error, true);
      markVoiceMissing([id]);
      focusVoiceError(id);
    },
  };
}

function createVoiceV4Controller(slug, survey, values, submissionToken) {
  return createVoiceV3Controller(slug, survey, values, submissionToken, {
    buildPages: buildVoiceV4Pages,
    pruneAnswers: pruneVoiceV4,
    schemaVersion: 4,
    fallbackPageKey: "play_segment",
  });
}

function createVoiceV5Controller(slug, survey, values, submissionToken) {
  return createVoiceV3Controller(slug, survey, values, submissionToken, {
    buildPages: buildVoiceV5Pages,
    pruneAnswers: pruneVoiceV5,
    schemaVersion: 5,
    fallbackPageKey: "play_segment",
  });
}

function createVoiceV6Controller(slug, survey, values, submissionToken) {
  return createVoiceV3Controller(slug, survey, values, submissionToken, {
    buildPages: buildVoiceV6Pages,
    pruneAnswers: pruneVoiceV5,
    schemaVersion: 6,
    fallbackPageKey: "play_segment",
  });
}

function createVoiceV7Controller(slug, survey, values, submissionToken) {
  return createVoiceV3Controller(slug, survey, values, submissionToken, {
    buildPages: buildVoiceV7Pages,
    pruneAnswers: pruneVoiceV7,
    schemaVersion: 7,
    fallbackPageKey: "play_segment",
  });
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

async function submitVoiceV3Survey(slug, survey, values, controller, submissionToken, {
  pruneAnswers = pruneVoiceV3,
  validateAnswers = validateVoiceV3Answers,
  fallbackErrorId = "usage_30d",
  schemaVersion = null,
} = {}) {
  pruneAnswers(survey.voice, values);
  const result = validateAnswers(survey.voice, values);
  if (result.missing.length > 0 || result.structurallyInvalid) {
    const first = result.missing[0] || fallbackErrorId;
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
    showResult(schemaVersion ? { ...parsed, schemaVersion } : parsed);
  } catch {
    elements.error.textContent = "回答を送信できませんでした。入力内容はこの画面に保持されています。";
    setVisible(elements.error, true);
  } finally {
    elements.submit.disabled = false;
    elements.submit.textContent = "回答を送信";
  }
}

async function submitVoiceV4Survey(slug, survey, values, controller, submissionToken) {
  return submitVoiceV3Survey(slug, survey, values, controller, submissionToken, {
    pruneAnswers: pruneVoiceV4,
    validateAnswers: validateVoiceV4Answers,
    fallbackErrorId: "play_time_4w",
  });
}

async function submitVoiceV5Survey(slug, survey, values, controller, submissionToken) {
  return submitVoiceV3Survey(slug, survey, values, controller, submissionToken, {
    pruneAnswers: pruneVoiceV5,
    validateAnswers: validateVoiceV5Answers,
    fallbackErrorId: "play_frequency_1m",
  });
}

async function submitVoiceV6Survey(slug, survey, values, controller, submissionToken) {
  return submitVoiceV3Survey(slug, survey, values, controller, submissionToken, {
    pruneAnswers: pruneVoiceV5,
    validateAnswers: validateVoiceV5Answers,
    fallbackErrorId: "play_frequency_1m",
    schemaVersion: 6,
  });
}

async function submitVoiceV7Survey(slug, survey, values, controller, submissionToken) {
  return submitVoiceV3Survey(slug, survey, values, controller, submissionToken, {
    pruneAnswers: pruneVoiceV7,
    validateAnswers: validateVoiceV7Answers,
    fallbackErrorId: "play_frequency_1m",
    schemaVersion: 7,
  });
}

function showSurveyForm(slug, survey) {
  hideStates();
  elements.view?.classList.toggle("survey-schema-v5", [5, 6, 7].includes(survey.schemaVersion));
  elements.view?.classList.toggle("survey-schema-v6", [6, 7].includes(survey.schemaVersion));
  setPage({ title: survey.title, description: survey.description });
  if (survey.schemaVersion === 7) {
    const { values, submissionToken } = voiceV5Values(slug, survey.voice, 7);
    pruneVoiceV7(survey.voice, values);
    saveVoiceV3Draft(slug, submissionToken, values, 7);
    const controller = createVoiceV7Controller(slug, survey, values, submissionToken);
    elements.form.onsubmit = (event) => {
      event.preventDefault();
      submitVoiceV7Survey(slug, survey, values, controller, submissionToken);
    };
    setVisible(elements.form, true);
    return;
  }
  if (survey.schemaVersion === 6) {
    const { values, submissionToken } = voiceV5Values(slug, survey.voice, 6);
    pruneVoiceV5(survey.voice, values);
    saveVoiceV3Draft(slug, submissionToken, values, 6);
    const controller = createVoiceV6Controller(slug, survey, values, submissionToken);
    elements.form.onsubmit = (event) => {
      event.preventDefault();
      submitVoiceV6Survey(slug, survey, values, controller, submissionToken);
    };
    setVisible(elements.form, true);
    return;
  }
  if (survey.schemaVersion === 5) {
    const { values, submissionToken } = voiceV5Values(slug, survey.voice);
    pruneVoiceV5(survey.voice, values);
    saveVoiceV3Draft(slug, submissionToken, values, 5);
    const controller = createVoiceV5Controller(slug, survey, values, submissionToken);
    elements.form.onsubmit = (event) => {
      event.preventDefault();
      submitVoiceV5Survey(slug, survey, values, controller, submissionToken);
    };
    setVisible(elements.form, true);
    return;
  }
  if (survey.schemaVersion === 4) {
    const { values, submissionToken } = voiceV3Values(slug, survey.voice, 4);
    pruneVoiceV4(survey.voice, values);
    saveVoiceV3Draft(slug, submissionToken, values, 4);
    const controller = createVoiceV4Controller(slug, survey, values, submissionToken);
    elements.form.onsubmit = (event) => {
      event.preventDefault();
      submitVoiceV4Survey(slug, survey, values, controller, submissionToken);
    };
    setVisible(elements.form, true);
    return;
  }
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
