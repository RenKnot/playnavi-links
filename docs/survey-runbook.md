# Survey web runbook

## September 2026 deferred title correction

For schema v7 `playnavi-voice-2026-09`, the authenticated read response supplies
the active campaign title name. The introduction and completion screen display
that name and state that the title will be delivered later. A successful submit
returns the same reward object with `awarded=false`: the database stores the
anonymous answer and the separate UID-only entitlement claim, but does not yet
create title ownership. After the fixed response deadline, the reviewed
production close-and-grant SQL creates ownership for the claim set. Guest reads
and submits have `reward=null`, so guest UI never promises a title.

Deploy the database defer correction before this Web copy. During a mixed
deployment, `awarded=true` remains rendered as an already-acquired title so the
page never tells a user to wait for a title that was actually granted. Schema
v1-v6 retain their previous display contract.

## Delivery path and intentionally new server surface

This repository previously deployed only static files and two rewrites. That
path cannot issue an HttpOnly cookie. The survey keeps the existing static SPA
delivery, and adds the minimum server surface supported by Vercel: Node.js
Functions in `api/`. Vercel gives filesystem Functions precedence over the
final SPA catch-all rewrite.

| Concern | Reused evidence | Intentional difference | Verification |
| --- | --- | --- | --- |
| Production host | `links.playnavilab.com` association files and SPA catch-all | `/surveys/:slug` is added ahead of the catch-all | `tests/static-config.test.mjs` |
| API forwarding | Existing same-origin short-link proxy | Survey calls are server-side Functions so credentials never enter browser JS | `tests/server-security.test.mjs` |
| Sensitive entry URL | Existing short links use `no-store`, `no-referrer`, `noindex` | Handoff code uses a URL fragment and is removed before the first fetch | source invariant test |
| Login | App already uses Google/Apple provider identities | Web verifies provider tokens directly, then exact-matches the provider subject without invoking Supabase signup | source invariant test + pre-production login matrix |
| Survey UI | Existing static no-build UI | Declarative questions and draft persistence are added | `tests/survey-contract.test.mjs` |

`assets/app.mjs` loads `survey-app.mjs` dynamically only after matching
`/surveys/<slug>`. A missing or invalid Survey module therefore shows a
Survey-specific retry state without preventing `/`, `/s/*`, game, user or
catalog links from starting. `tests/app-entrypoint.test.mjs` executes the entry
point with the Survey module intentionally absent and proves both boundaries.

History checks used for this design:

- `git log -S'api/share-links' -- .` identifies `d0c6d88`, the successful
  same-origin proxy/static fallback pattern.
- `git log -S'supabase' -- .` identifies `bb8d9c2`, the existing Supabase
  Function rewrite pattern.
- No earlier HttpOnly, SameSite, survey, SSR, or runbook implementation exists
  in this repository.

## Environment variables

Configure these in Vercel for Production and the intended Preview environment.
Never prefix them with `PUBLIC_` or expose them to browser assets.

| Variable | Required value |
| --- | --- |
| `SUPABASE_URL` | Exact project URL paired with `PLAYNAVI_WEB_ORIGIN`; production: `https://irbtguncoatqfikctreq.supabase.co`, staging: `https://wffhdhdxdrmobgojxddo.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable/anon project key; never the service-role key |
| `PLAYNAVI_WEB_ORIGIN` | Exact reviewed origin; production: `https://links.playnavilab.com`, staging: `https://survey-stg.playnavilab.com` |
| `GOOGLE_WEB_CLIENT_ID` | Dedicated Google Web OAuth client ID |
| `GOOGLE_WEB_CLIENT_SECRET` | Dedicated Google Web OAuth client secret |
| `APPLE_WEB_SERVICES_ID` | Apple Services ID associated with the existing primary App ID |
| `APPLE_TEAM_ID` | Apple Developer Team ID used as the client-secret issuer |
| `APPLE_WEB_KEY_ID` | Key ID for the Sign in with Apple private key |
| `APPLE_WEB_PRIVATE_KEY` | Complete PKCS#8 `.p8` contents, including header/footer and line breaks |
| `SURVEY_WEB_BACKEND_SECRET` | Independent 256-bit+ broker secret, identical to Supabase `SURVEY_WEB_BACKEND_SECRET` |
| `SURVEY_HANDOFF_EXCHANGE_FUNCTION` | Optional; default `survey-handoff-exchange` |
| `SURVEY_PROVIDER_SESSION_CREATE_FUNCTION` | Optional; default `survey-provider-session-create` |
| `SURVEY_DEFINITION_FUNCTION` | Optional; default `survey-read` |
| `SURVEY_SUBMIT_FUNCTION` | Optional; default `survey-submit` |

Provider private keys and broker secrets are server-only Vercel variables. Never put them
in `vercel.json`, browser assets, Preview comments, or source control.

`api/_lib/config.mjs` treats the two origin/project combinations above as a
single environment identity. It rejects production-to-staging swaps, staging-to-production
swaps, other PlayNavi subdomains, and unreviewed Supabase projects. A new domain or project
therefore requires a reviewed source change in addition to a Vercel environment-variable
change.

## Recipient-facing deployment protection boundary

The Survey URL opened by an app recipient must use a fixed PlayNavi-controlled
host and must not contain a developer, account, or team slug. It also must not
be protected by Vercel Authentication. That screen authenticates a Vercel
project member; it is not a PlayNavi login and must never be shown to a
respondent. Use a separate public staging project and a fixed staging domain
under PlayNavi-managed DNS. A Vercel branch-preview alias is not a recipient
URL, even when a Deployment Protection Exception could make it public.
Application-layer handoff/session/provider checks remain mandatory.

This repository also serves production Steam callbacks and short-link
resolution. Their external Supabase rewrites are host-allowlisted to
`links.playnavilab.com` and `playnavi-links.vercel.app`. Every other host,
including the Survey staging host, receives a local private `404` for those two
paths and cannot reach the production Supabase project. Keep the guarded routes
ahead of their local deny fallback and the SPA catch-all; verify the ordering
with `tests/static-config.test.mjs` before deploying either project.

Do not append a Shareable Link or automation-bypass secret to the app URL.
Those values are deployment credentials and would be exposed in the client
handoff. Before giving a build to a tester, an unauthenticated request to the
exact `/surveys/{slug}` URL must return the PlayNavi page with HTTP 200 and must
not redirect to `vercel.com/sso-api`. A redirect is a release-stopping staging
configuration error.

## Server contract

The app creates a handoff with `survey-handoff-create` and puts only the opaque
code in `#handoff`. The Vercel server consumes it through:

```text
POST survey-handoff-exchange { code }
-> { status: "ok", survey_slug, session_token, expires_at }
```

Google uses state, nonce, and S256 PKCE. Apple uses state, nonce, a single-use
five-minute authorization code, and the signed Apple client secret. Apple's
published REST authorization/token parameter lists do not define
`code_challenge`/`code_verifier`, so this implementation does not send an
undocumented Apple PKCE parameter. Both returned ID tokens are verified against
the provider JWKS and exact issuer, audience, expiry, and nonce constraints.
The callback then calls:

```text
POST survey-provider-session-create
X-PlayNavi-Web-Secret: <independent 256-bit broker secret>
{ survey_slug, provider: "google" | "apple", provider_subject }
-> { status: "ok", survey_slug, session_token, expires_at }
```

The privileged Supabase function exact-matches
`auth.identities(provider, provider_id)` and an active PlayNavi profile. It
does not create a user and never merges on email. Active means the matched Auth
account is neither deleted nor currently suspended and its non-deleted
`public.users` row has the nonempty trimmed display name required by the App's
registration-completion gate. An Auth identity alone is rejected with the same
generic login failure as every other non-member case. Only `session_token` is set
for at most 60 minutes as
`__Host-pn_survey_session; Secure; HttpOnly; SameSite=Lax; Path=/`. Read and
submit send it server-to-server as `X-PlayNavi-Survey-Session`; it is never
returned in browser JSON. The cookie is removed after a successful submit
response; the hashed DB session naturally expires so a lost response can be
retried idempotently.

```text
POST survey-read { survey_slug }
POST survey-submit { survey_slug, answers, submission_token }
```

`answers` is an object keyed by question ID. Values are a string for single
choice/short text and a unique string array for multiple choice. The server
contract and client parser are covered by `tests/survey-contract.test.mjs`.
`submission_token` is a browser-generated 32-byte base64url value kept beside
the draft in `sessionStorage`. The same token is reused for a retry, only its
SHA-256 hash is stored, and it contains no UID or answer data.

### PlayNavi Voice schema v2

The campaign definition uses `survey.schema_version = 2` and
`questions.kind = "playnavi_voice_2026"`. The Web client accepts only the
bounded contract shared with `survey-read` / `survey-submit`: exactly seven
categories, 26 unique features, seven future candidates, 200-character
comments, an optional second category, and a maximum future Top 3. Unknown
definition keys fail closed. Schema v1 remains available for existing generic
surveys.

The answer object has exactly these keys:

```text
usage_frequency
overall_satisfaction
feature_priorities  (all 26 feature IDs)
feature_comments    (optional subset; reused by the detail step)
category_top        (required first, optional second; unique)
feature_details     (exact features in the selected one or two categories)
future_interest     (yes / none / unsure)
future_top          (yes: required first and optional second/third; otherwise empty)
```

The browser proxy accepts the nested v2 object but retains a 64 KiB serialized
body boundary. Campaign-specific keys, counts, option membership, selected
category/detail equality, rank uniqueness, and comment length are revalidated
by `survey-submit`; the browser validator is a convenience and not a trust
boundary.

The mobile flow is intro, basic questions, seven category pages, category
Top 1/optional Top 2, one page per selected category (maximum eight detailed
features), future-interest/ranking, and review. It avoids matrices and
drag-only ranking. Progress and bottom navigation remain visible, controls are
at least 48px high, optional comments are collapsed, drafts stay in
`sessionStorage`, the first invalid control receives focus, and reduced-motion
preferences disable step transitions.

### PlayNavi Voice reviewed schema v3

Schema v3 (`questions.kind = "playnavi_voice_2026_reviewed"`) is additive: v1
generic surveys and the frozen v2 campaign continue to parse and render with
their existing question and answer contracts. V3 implements the reviewed Q1–Q12
flow, including usage-based branches, optional needs and unused-feature fields,
unordered maximum-three selections, an explicit single priority, candidate-
specific detail questions, and the conditional improvement/candidate
comparison. Feature and future-candidate display orders are randomized once,
persisted in the draft, and submitted for order-effect analysis; scale and
exclusive options stay fixed.

The login notice must match the anonymous storage contract. The response row
stores answers and the hash of `submission_token`, but no UID and no join to the
reward record. For an authenticated response the UID is used only inside the
same transaction to grant the campaign title, then is not retained with or
linked from the answer. Guest responses use the same anonymous response shape
and receive no title. Reporting returns aggregates without comments, raw
answers, token hashes, or identity data.

### PlayNavi Voice segmented schema v4

Schema v4 (`questions.kind = "playnavi_voice_2026_reviewed_segments"`) uses the
new staging slug `playnavi-voice-2026-stg-review-v2`. Do not overwrite the v3
definition or reuse its slug. The v1, v2, and v3 read, draft, validation, and
rendering branches remain available unchanged.

V4 retains the complete v3 Q1–Q12 contract and adds four segment questions:

```text
S1 play_time_4w             required for everyone
S2 primary_play_device_4w   required only for a positive S1 time band; otherwise ""
S3 info_seek_days_4w        required for everyone
S4 recording_preference     required for everyone
```

The answer object has exactly 27 keys: all 22 v3 keys plus those four keys and
`reference_period_end_on`. The reference period is 28 days in `Asia/Tokyo` and
ends one day before the v4 draft is first created. The browser stores that ISO
date with the same-tab draft and must not recalculate it on reload. A changed S1
clears only a now-hidden S2 value; it must not alter S3, S4, or Q1–Q12.

The exact definition metadata is:

```text
reference_period_days = 28
reference_period_timezone = Asia/Tokyo
reference_period_end_offset_days = 1
```

The Web proxy continues to accept only `{ answers, submission_token }` and
forwards the existing `{ survey_slug, answers, submission_token }` envelope.
It detects v4-only keys before v3 so that a 27-key body cannot fall through to
the v3 or generic validator. The anonymous response/reward separation, PC Web
candidate copy and its five detailed uses, 64 KiB limit, retry token, and
same-origin/session boundaries are unchanged.

Before a v4 rollout, run `npm test` and confirm both v4 real-Chrome snapshots,
the fixed-period reload test, S2 pruning, the exact 27-key payload, and all v1,
v2, and v3 regression tests. Deploy Web, Edge, and the inactive v4 campaign in
a coordinated staging window; stop if any layer reports a different definition
key, answer key, stable option ID, schema version, or slug.

### PlayNavi Voice revised monthly schema v6

Schema v6 is an additive presentation revision of the frozen schema-v5 monthly
campaign. It reuses the exact schema-v5 question definition, 29-key answer
object, validation, normalization, aggregation, anonymous response storage,
and reward separation. Existing schema-v5 surveys and their rendered flow must
not change.

The schema-v6 browser flow intentionally differs only in these ways:

- optional question notes are visible immediately instead of using disclosure
  controls;
- selected valuable-feature comments appear together in a second section below
  the complete feature list;
- unused-feature selection, one required reason radio group per selected
  feature, and the optional overall note share one page; no drag-and-drop board
  or separate reason page is rendered;
- `problem_outcome` remains a child of `primary_problem` and appears as the
  second section on that page; it is not redefined as a child of the unrelated
  optional `unprompted_need` question;
- the completion screen uses the reviewed concise copy and does not display the
  awarded-title panel.

An authenticated campaign response is accepted once per `(survey_id, user_id)`
by atomically consulting the separate reward-claim ledger. The answer row still
contains no UID and has no key that joins it to the reward claim. A later read
returns only an `already_submitted` marker, never the previous answers. A guest
cannot be identified as a person, so guest submission-token idempotency remains
the applicable boundary; strict person-level one-response enforcement requires
authentication.

Create schema v6 under a new slug while inactive, deploy Backend support before
Web support, then atomically switch the staging announcement only after the v6
read, submit, completion, and already-answered paths pass. Never mutate or
delete the answered schema-v5 row.

### PlayNavi Voice final free-text schema v7

Schema v7 is a new physical survey revision. It preserves every schema-v1–v6
definition and stored response, removes `problem_outcome` and its nested note
from the exact answer shape, and omits `problem_outcome_options` from the public
question definition. Immediately before review it adds the optional
`final_comment` question with the exact reviewed Japanese copy and a 2,000
Unicode-code-point limit. The definition declares
`kind=playnavi_voice_2026_reviewed_final` and
`final_comment_max_length=2000`; Web must reject any mismatch rather than
guessing the revision from labels.

All physical revisions of this questionnaire share a durable
`response_group_id`. Authenticated read and submit therefore return the
answer-free `already_submitted` result when that UID already has a reward claim
for any earlier revision in the group. Unrelated surveys use different groups
and remain independently answerable. The existing `public.users` row lock
serializes submissions across two revision slugs. Guest token idempotency is
unchanged because a guest has no durable person identifier.

Create v7 inactive, deploy matching Backend and Web support, verify the exact
key set plus 2,000/2,001-code-point boundaries, then switch the staging
announcement atomically. Do not mutate, copy, or delete an earlier response or
reward claim to test v7. A person who already answered an earlier revision must
use another registered staging account for the new-answer E2E; use the original
account only to verify the cross-revision `already_submitted` path.

### Verified v4 deployment state on 2026-09-07

- Web PR #9 was merged to `main` as
  `1da00c5392bba65cd6740104bc7e672ffc43bdc4`.
- The schema-v4 staging one-shot passed and
  `playnavi-voice-2026-stg-review-v2` is active with the staging title and a
  controlled seven-day window. Do not rerun the one-shot; change activation or
  the window only through a separately reviewed staging operation.
- All six Survey Edge Functions were redeployed to staging from merged `main`.
- The fixed staging host serves `survey-contract.mjs` and `survey-app.mjs`
  byte-for-byte identical to merged `main`.
- A live Android-width guest flow completed successfully with exactly 27 answer
  keys, no `user_id`, no horizontal overflow, and the temporary session cookie
  removed after completion.
- Human Google, Apple, and app-handoff E2E remain pending. Schema v4 changed only
  Web and Backend code, so a new native staging build is unnecessary; use the
  existing staging app for the handoff check.
- The production Web static assets were automatically deployed by the merge,
  but production DB, Edge, and campaign are absent. The production Survey API
  returns 503 and the URL must remain unadvertised.

## External authentication setup

The Web flow never signs up or merges a PlayNavi account. It verifies the
provider token and exact-matches its subject to an existing provider identity.
An unknown identity returns to the Survey with an account-not-found message and
the guest option; it must never fall through to the normal app-install home.
The OAuth state carries only an allowlisted same-origin Survey path so that a
browser which drops the Host-only state cookie can recover the failure display.
That path is never sufficient to validate OAuth or create a session: the cookie
state, nonce and Google PKCE checks remain mandatory.

Apple controls the authorization-sheet copy, and its documented authorization
parameters do not provide a sign-in-versus-sign-up display mode. Do not infer
configuration health from that copy alone. Before accepting Apple E2E, verify
that the production Services ID is associated with the native app's primary App
ID, then complete one controlled Web authorization with the same Apple Account.
Pass only when it returns to the Survey as the existing member; an
account-not-found or generic authentication failure is release-stopping. The Web
flow still never creates or merges a PlayNavi account. Controlled production E2E
confirmed that the first Web authorization for an Apple Account can use account-
creation copy, complete as the existing member, and use sign-in copy in another
browser afterwards. Keep the visible explanation directly associated with the
Apple button. App 4.2.2 announcement entry uses the existing handoff and does not
show the Apple sheet.

1. Register exact callback `https://links.playnavilab.com/api/auth/callback`
   on both the dedicated Google Web client and Apple Services ID. Do not allow
   arbitrary production paths or hosts.
2. Associate the Apple Services ID with the same primary App ID used by the
   native PlayNavi identity. Store the Team ID, Key ID, and complete Sign in
   with Apple `.p8` private key only as sensitive server-side variables. The
   Web Function generates a five-minute client-secret JWT immediately before
   each Apple token exchange; never store a pre-generated client-secret JWT.
3. Provision a new 256-bit broker secret in both Vercel and Supabase. It must
   not be the Supabase service-role key. Rotate it independently.
4. Rotate the Apple private key only after compromise, revocation, or an
   intentional Apple account/key change. Replace the Vercel key before revoking
   the old Apple key so login does not lose its only valid signer.
5. Do not enable analytics, session replay, Sentry request-body capture, or
   Vercel request-body logging on survey routes.

Primary references reviewed on 2026-08-31:

- Google web-server OAuth and state: https://developers.google.com/identity/protocols/oauth2/web-server
- Google OpenID Connect verification: https://developers.google.com/identity/openid-connect/openid-connect
- Apple manual authorization: https://developer.apple.com/documentation/signinwithapple/incorporating-sign-in-with-apple-into-other-platforms
- Apple authorization-code validation: https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens
- Supabase SSR guidance reviewed but intentionally not used for this no-signup flow: https://supabase.com/docs/guides/auth/server-side/advanced-guide
- Vercel Node.js Functions: https://vercel.com/docs/functions/runtimes/node-js
- Vercel cache control: https://vercel.com/docs/caching/cache-control-headers

## Pre-production checks

Run locally:

```sh
npm test
npm run validate:android
```

For a new schema, deploy in this order: Backend schema/RPC and Supabase
Functions first, then the Web client, then create and activate a new
schema-specific staging slug. A slug must never be exposed while either side
still rejects its contract. Schema v4 has completed these staging deployment
steps; do not replay them. Use the fixed staging host and do not use a
production handoff code in staging.

Test all of the following before production promotion:

1. Handoff-capable 4.2.2 Google user and Apple user: fragment disappears before any request;
   no login prompt; correct existing PlayNavi profile receives one response and
   at most one reward.
2. App versions without handoff support, plus direct-Web Google and Apple users: the direct provider callback returns
   to a clean survey URL and resolves the exact existing provider subject. Test
   with the same provider used in the app. A different provider, Apple relay
   identity, email-only match, or provider account without a PlayNavi profile
   is rejected rather than created or merged.
3. Expired, reused, malformed, and wrong-survey handoff codes fail closed.
4. Refresh during entry preserves the draft in `sessionStorage`; successful or
   already-submitted completion removes it.
5. Closed/not-yet-open surveys, invalid answers, retry, already answered, and
   newly awarded title displays match the API result.
6. Browser storage contains no provider/Supabase access, ID, or refresh token.
   The only durable auth cookie is opaque (not JWT-shaped, including no `eyJ`
   prefix), expires in at most 60 minutes, and cookies
   have `__Host-`, `Secure`, `HttpOnly`, `SameSite=Lax`, and `Path=/`.
7. Vercel logs, Supabase Function logs, Sentry, Referer, browser history, and
   analytics contain no UID, answers, handoff/session token, or request body.
8. The provider callback's query authorization code is protocol-required,
   single-use, short-lived, and immediately receives a `303` with `no-store`
   and `no-referrer`. Confirm platform access logs do not retain query strings.
9. Responses carrying user state have `Cache-Control: private, no-store` and
   survey documents have strict CSP and `Referrer-Policy: no-referrer`.

Rollback is a normal Vercel deployment rollback plus disabling the survey
definition. Do not delete responses or revoke unrelated user sessions.

## Production stop conditions

Do not deploy or advertise the common URL until all of these are true:

- Google/Apple production callbacks, server secrets, and Apple private-key
  ownership are configured and independently reviewed.
- The Supabase provider-session function enforces the broker secret with a
  constant-time comparison and exact `(provider, provider_id)` lookup only.
- Staging proves native existing UID equals the subject-matched Web UID for one
  real Google and one real Apple account, while auth identity/profile row counts
  do not increase. Different-provider and Apple relay/email-only cases fail.
- Staging proves malformed/reused handoffs and forged provider-session calls
  fail, broker/provider/session values never reach logs, and no Supabase signup
  endpoint is called by the Web implementation.
- The production logging configuration is known not to retain OAuth callback
  query strings. The standard provider authorization code is unavoidable in a
  redirect-mode callback, but is single-use, short-lived, state/nonce-bound
  (and Google PKCE-bound), immediately removed by `303`, and never app-logged.
