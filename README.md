# PlayNavi links

Static fallback pages and domain-association files for PlayNavi links.

## Survey web app

`/surveys/{survey_slug}` is a common PlayNavi-branded survey page. Static UI
is kept in `link.html` and `assets/`; only authentication and survey requests
run in Vercel Functions under `/api`.

An OTA-capable app opens
`https://links.playnavilab.com/surveys/{survey_slug}#handoff={opaque-code}`.
The browser removes the entire fragment before its first request, then posts
the code to `/api/survey/session/exchange`. An older app/browser signs in with
Google or Apple through the providers' server-side authorization-code flow.
Only an exact existing `auth.identities(provider, provider_id)` match can mint
an opaque survey session. No OAuth path creates or email-merges a user. Both
paths end with the same 60-minute `Secure; HttpOnly; SameSite=Lax` `__Host-`
cookie. Provider and Supabase tokens are never persisted in browser cookies.

See [`docs/survey-runbook.md`](docs/survey-runbook.md) for the API contract,
required Vercel/Supabase settings, security invariants, and rollout checks.

## Short-link web contract

`playnavi.app` relays every path that links does not reserve to the new Web
(Vercel project `playnavi-web`, `https://playnavi-web.vercel.app`). Reserved
paths (`/api`, `/assets`, `/.well-known`, `/a`, `/s`, `/surveys`, `/mcp`,
`/ai-auth`, `/privacy`, `/help/claude`, the old Steam callback and the static
files) are decided before the relay. The entry page is `link.html` because
static files win over rewrites on Vercel, so `/` reaches the Web. Each links
deployment URL (`playnavi-links-<hash>-masanobu-iwasakis-projects.vercel.app`,
protected by Vercel) relays the same way to the STG Web for checks before and
after a release. Relayed responses are never cached by links. Rolling back the
public Web = Vercel `playnavi-links` → Deployments → the previous one →
Instant Rollback. See `docs/web-gateway-preparation.md` and
`tests/web-gateway.test.mjs`.

`/s/{16-character code}` resolves through the same-origin route
`/api/share-links/{code}`. `vercel.json` proxies that request to the public
Supabase Edge Function `short-links-resolve`.

The browser accepts only a successful payload whose `status`, `code`,
`target_type`, and `canonical_path` agree. `canonical_path` must be one of the
five allowlisted `game`, `log`, `user`, `ranking`, or `catalog` route shapes.
An absolute URL from the API is never used for navigation.

## AI return link

`https://playnavi.app/a?act=game|log|wishlist&g={game_id}&src={provider}&i={intent}&at={epoch_ms}` (`game` is what the app builds today; `log` / `wishlist` are older links)

`https://playnavi.app/a?act=moment&g={game_id}&src={provider}&at={epoch_ms}[&s={session_id}[&f=1]][&t={text}]` (V5: moment text is only an editable initial value in the app; `f=1` = the play ends here, only with `s`)

`https://playnavi.app/a?act=review&g={game_id}&src={provider}&at={epoch_ms}[&t={text}]` (the AI-written review comment, only an editable initial value; `t` up to 4,000 characters, the app cuts at 2,000)
is reserved for returning from an AI answer to the app. The association file
matches exactly `/a`; `vercel.json` also routes that path to the browser
fallback. The fallback accepts only the reviewed action, provider, intent,
positive game ID, and timestamp shapes, then preserves those values in a
manual app-open link. It does not auto-open the custom scheme. The app validates
link age and the action again before doing anything.

The `/a` association and browser fallback must be published with an app build
that handles `/a`. Older installed builds may claim the associated link but
cannot handle the new route. The separate PlayNavi web gateway must also keep
`/a` ahead of its catch-all rewrite when it takes over `playnavi.app`.

## Validation

```sh
npm test
npm run validate:android
```

The Android association uses the exact 32-byte SHA-256 fingerprint copied from
Play App Signing. Rerun both validation commands after any association-file
change. Do not derive or guess the fingerprint.
