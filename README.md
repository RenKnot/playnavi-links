# PlayNavi links

Static fallback pages and domain-association files for PlayNavi links.

## Survey web app

`/surveys/{survey_slug}` is a common PlayNavi-branded survey page. Static UI
is kept in `index.html` and `assets/`; only authentication and survey requests
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

`/s/{16-character code}` resolves through the same-origin route
`/api/share-links/{code}`. `vercel.json` proxies that request to the public
Supabase Edge Function `short-links-resolve`.

The browser accepts only a successful payload whose `status`, `code`,
`target_type`, and `canonical_path` agree. `canonical_path` must be one of the
five allowlisted `game`, `log`, `user`, `ranking`, or `catalog` route shapes.
An absolute URL from the API is never used for navigation.

## AI return link

`https://playnavi.app/a?act=log|wishlist&g={game_id}&src={provider}&i={intent}&at={epoch_ms}`
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
