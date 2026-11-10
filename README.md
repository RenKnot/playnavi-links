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
`/ai-auth`, `/privacy`, `/terms`, `/legal`, `/help/claude`, the old Steam callback
and the static files; `/privacypolicy` is a 301 to `/privacy`) are decided before the relay. The entry page is `link.html` because
static files win over rewrites on Vercel, so `/` reaches the Web. Each links
deployment URL (`playnavi-links-<hash>-masanobu-iwasakis-projects.vercel.app`,
protected by Vercel) relays the same way to the STG Web for checks before and
after a release. Relayed responses are never cached by links. Rolling back the
public Web = Vercel `playnavi-links` → Deployments → the previous one →
Instant Rollback. See `docs/web-gateway-preparation.md` and
`tests/web-gateway.test.mjs`.

When the relay moves a shared link to the Web it appends `via=share` after the
canonical query (`webHandoffUrl` in `assets/link-routing.mjs`); the links home
and the `/help` pages link to the Web top with `via=links`. App, universal and
store links never carry `via`. `/robots.txt` is chosen per host in
`vercel.json`: `playnavi.app` (and the protected check deployments) get
`robots-playnavi-app.txt` (the Web's production rules + its sitemap), every
other host gets `robots-links.txt`. No static `robots.txt` may exist, because a
static file would win over these rewrites.

`/s/{16-character code}` resolves through the same-origin route
`/api/share-links/{code}`. `vercel.json` proxies that request to the public
Supabase Edge Function `short-links-resolve`.

The browser accepts only a successful payload whose `status`, `code`,
`target_type`, and `canonical_path` agree. `canonical_path` must be one of the
five allowlisted `game`, `log`, `user`, `ranking`, or `catalog` route shapes.
An absolute URL from the API is never used for navigation.

## Company site (old domains playnavilab.com / www.playnavilab.com)

TASK-20261107-002 moved the company site off Squarespace: all content lives
under `playnavi.app`. The legal pages are static files here, one copy each:
`terms.html` (`/terms`), `privacy.html` (`/privacy`), `legal.html` (`/legal`),
each with `<link rel="canonical" href="https://playnavi.app/...">`. The Web
(`playnavi-web`) serves `/about`, `/news`, `/press` and `/contact`.

When `playnavilab.com` and `www.playnavilab.com` are attached to this Vercel
project, `vercel.json` answers them before any other rule (host condition
`^(?:www\.)?playnavilab\.com$`, so `links.playnavilab.com` is untouched):

| Old path | Answer |
|---|---|
| `/`, `/home`, `/new-page` | 301 `https://playnavi.app/` (11/9 Emiya: 動いて見せる紹介を playnavi.app のトップにし、/about は会社として伝えたいことのページにする) |
| `/news`, `/news/category/*`, `/news/tag/*`, deeper `/news/*/*` | 301 `https://playnavi.app/news` |
| `/news/:slug` | 301 `https://playnavi.app/news/:slug` |
| `/press`, `/contact` | 301 `https://playnavi.app/press`, `/contact` |
| `/s/<the 6 press files>` | 301 `https://playnavi.app/press/files/<same name>` |
| any other `/s/*` | 301 `https://playnavi.app/press` |
| `/terms`, `/privacypolicy`, `/legal` | **200**, the same file as playnavi.app (temporary, below) |
| `/robots.txt` | 200 `robots-links.txt` (allow all, so crawlers see the 301s) |
| everything else | 301 `https://playnavi.app/` |

All redirects use `"statusCode": 301` (Google's change of address expects
301). Matching is on the path only, exact and case-sensitive (`/terms/` or
`/Terms` fall to the last row). Vercel's routing compiles redirects without
adding the incoming query string to `Location`; whether its edge appends the
original query (e.g. `/news?offset=…`) is to be checked with `curl -I` once the
domains are attached.

**Temporary legal-page exception.** The released app (5.0.2 and older) opens
`https://www.playnavilab.com/terms|privacypolicy|legal` in an in-app WebView
that only allows that origin; a redirect would leave the screen blank and open
the external browser. So these three paths are rewritten (200) to the single
copy. Exit condition: the minimum supported app version is 5.0.3 or later (the
first version that opens `https://playnavi.app/terms|privacy|legal`). The
switch is one move: take the first three entries of `rewrites` (the old-host
`/terms`, `/privacypolicy`, `/legal`) and put them at the top of `redirects`
with `destination` `https://playnavi.app/terms|privacy|legal` and
`"statusCode": 301`; nothing else changes (`tests/company-site.test.mjs`
proves it, then update its exception test).

**Copy check.** While Squarespace still serves the old pages,
`node scripts/check-legal-copies.mjs` compares the title and every body line,
in order, of the three copies with the live pages and prints
`TERMS_COPY_MATCH` / `PRIVACY_COPY_MATCH` / `LEGAL_COPY_MATCH` (or `*_DIFF`
with the differing lines). After the old domains point here, or Squarespace is
cancelled, the files in this repo are the source of truth and the checker is
retired (delete it).

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
