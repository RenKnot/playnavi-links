import {
  clearOAuthState,
  exchangeProviderCode,
  readOAuthState,
  returnPathFromOAuthState,
  verifyProviderIdentity,
} from "../_lib/auth.mjs";
import {
  getConfig,
  getProviderConfig,
  getSurveyBrokerSecret,
} from "../_lib/config.mjs";
import { PRIVATE_HEADERS, firstQueryValue, safeReturnPath } from "../_lib/http.mjs";
import { setSurveySession } from "../_lib/survey-session.mjs";
import { UpstreamError, callSurveyFunction } from "../_lib/upstream.mjs";

function finish(response, path) {
  for (const [name, value] of Object.entries(PRIVATE_HEADERS)) response.setHeader(name, value);
  clearOAuthState(response);
  return response.redirect(303, path);
}

export function authFailureReason(error) {
  return error instanceof UpstreamError &&
      error.status === 404 && error.code === "EXISTING_IDENTITY_NOT_FOUND"
    ? "account_not_found"
    : "failed";
}

export default async function handler(request, response) {
  if (request.method !== "GET") return finish(response, "/survey-login-error");

  const state = readOAuthState(request);
  const returnedState = firstQueryValue(request.query.state);
  const returnPath = safeReturnPath(state?.returnPath);
  // The encoded same-origin Survey path is used only to render a failure page
  // when a browser drops the Host-only state cookie across the provider hop.
  // It never makes an OAuth response valid and cannot create a session.
  const failureReturnPath = returnPath || returnPathFromOAuthState(returnedState);
  const code = firstQueryValue(request.query.code);
  if (
    !returnPath ||
    typeof returnedState !== "string" ||
    returnedState !== state.state ||
    typeof code !== "string" ||
    code.length < 16 ||
    code.length > 2_048
  ) {
    return finish(
      response,
      failureReturnPath ? `${failureReturnPath}?auth=failed` : "/survey-login-error",
    );
  }

  try {
    const config = getConfig();
    const providerConfig = getProviderConfig(state.provider);
    const redirectUri = new URL("/api/auth/callback", config.webOrigin).toString();
    const idToken = await exchangeProviderCode(
      state.provider,
      providerConfig,
      redirectUri,
      code,
      state,
    );
    const providerSubject = await verifyProviderIdentity(
      state.provider,
      providerConfig,
      idToken,
      state.nonce,
    );

    const surveySlug = returnPath.slice("/surveys/".length);
    const surveySession = await callSurveyFunction(config, "providerSessionCreate", {
      body: {
        survey_slug: surveySlug,
        provider: state.provider,
        provider_subject: providerSubject,
      },
      brokerSecret: getSurveyBrokerSecret(),
    });
    if (
      surveySession.status !== "ok" ||
      surveySession.survey_slug !== surveySlug ||
      typeof surveySession.session_token !== "string" ||
      !/^[A-Za-z0-9_-]{32,512}$/.test(surveySession.session_token) ||
      typeof surveySession.expires_at !== "string" ||
      Date.parse(surveySession.expires_at) <= Date.now()
    ) {
      return finish(response, `${returnPath}?auth=failed`);
    }
    setSurveySession(response, surveySession.session_token, surveySession.expires_at);
    return finish(response, returnPath);
  } catch (error) {
    const reason = authFailureReason(error);
    return finish(response, `${returnPath}?auth=${reason}`);
  }
}
