# Eclipse_Aug_2026

Personal Android PWA for the 12 August 2026 solar eclipse. User will be somewhere in
the Netherlands (partial eclipse only, no totality, exact spot unknown until possibly
the day itself).

Full implementation plan: `C:\Users\arjen\.claude\plans\the-session-looks-strange-buzzing-yao.md`

## Platform decision
HTML PWA, not native Kotlin. Internet is fine day-to-day; this is a single-use event
app, so native's extra build/maintenance overhead isn't justified (unlike
CrossFitTimer, a repeat-use tool that did go native). User is on Android.

## Core computation decision
Eclipse coverage % and local start/max/end times are computed entirely client-side
from Besselian elements (NASA/GSFC published table for this eclipse, transcribed
once into `besselian-2026-08-12.js`) — no live API, works offline. See the plan file
for the full rationale and the rejected alternatives (hosted API, hardcoded fixed
location).

## Reminder architecture decision (superseded once, now server-less)
Originally built as a Node/Express server on Render (`push-server/`, Milestone F1) —
**replaced entirely** with a server-less design: GitHub Actions does both the
scheduling and the sending, with `subscriptions.json` and `sent-log.json` (repo root)
as the only state, committed directly to this repo instead of living on a hosted
server. See `push-server/ARCHIVED-not-used.md` for why the old approach is kept
around (unused) rather than silently deleted.

- **Client** (`index.html`): writes its push subscription + current
  `isChecklistComplete()` status directly into `subscriptions.json` via GitHub's
  Contents API (`syncSubscription`/`githubGetFile`/`githubPutFile`), keyed by
  subscription endpoint (dedupes re-subscribes). Re-syncs on every app open and
  whenever the checklist changes — this is what makes state loss self-healing (see
  below), and also how the Day-3 reminder finds out whether to skip a subscriber.
- **Sending** (`.github/workflows/send-reminders.yml` +
  `.github/scripts/send-reminders.js`): a scheduled workflow (no persistent process)
  reads `subscriptions.json`/`sent-log.json` straight from the checked-out repo,
  sends any due-and-unresolved reminder via `web-push`, and commits the updated
  state back. Runs twice a day (08:00 and 16:00 UTC = 10:00/18:00 CEST) — day-level
  granularity is enough for these four reminders, unlike the client-side T-30/T-5
  alerts (unaffected by any of this, still entirely client-side).
- **Why no hosted KV store (e.g. Redis)**: user preference to avoid another external
  dependency. Committing state to the repo instead means there's no "redeploy wipes
  local disk" risk at all (there's no deploy — commits are the only mutation), so
  this concern from the Render-based design is moot now, not just mitigated.
- **Superseded again: embedding a raw GitHub PAT client-side does not work.**
  Tried exactly that (a fine-grained PAT, scoped to only this repo, Contents
  read/write, embedded in `index.html`) — GitHub's secret scanning automatically
  revokes any GitHub PAT (classic or fine-grained) it detects committed to a public
  repository. This isn't a one-off mistake fixable by regenerating the token: it's a
  standing, always-on security feature (GitHub is the registered "partner" for its
  own token format, so it can revoke on sight), confirmed by testing — the token
  worked in live testing, then returned 401 shortly after being pushed and
  auto-allowed past push-protection. Regenerating would just get revoked again.
- **Current design: a Cloudflare Worker as a write-proxy.** The client no longer
  talks to GitHub's Contents API directly. Instead it calls a small Cloudflare
  Worker (free tier, no persistent process — invoked on-demand), which holds the
  real GitHub PAT as a Cloudflare-encrypted secret (never in any git repo, never
  sent to any browser, so GitHub's scanner has nothing to find) and performs the
  actual `subscriptions.json` read/write server-side. The client authenticates to
  the Worker with a separate, narrow-scope shared secret (not a GitHub-formatted
  token, so it won't trigger GitHub's auto-revocation) — this secret IS visible in
  page source, same accepted trade-off as before, but its blast radius is much
  smaller: it only lets someone trigger the one operation the Worker allows
  (upsert a subscription entry), not full repository access.
- Why not a hosted KV store (e.g. Redis) instead: user preference to avoid another
  external dependency where avoidable — moot for the GitHub-Actions send/schedule
  side (state lives in the repo, no server, no redeploy-wipes-disk risk), but the
  PAT-exposure problem specifically requires *some* place to hide a real credential
  from public view, which a Worker (not a persistent server) is the smallest way to
  do given the GitHub-side constraint just discovered.

## Features
1. Countdown to local eclipse **maximum** (big display) + T-30/T-5 min live-GPS
   alerts referenced to eclipse **start**, not maximum (per user request — a
   start-time-referenced client so as not to miss the actual beginning of the event).
2. Location-based coverage % (geolocation, address/place search via OpenStreetMap
   Nominatim, or manual lat/lon override).
3. Safety checklist (partial-eclipse only — glasses stay on at all times, no
   totality-style "safe to remove" window; phone needs its own solar filter too).
4. Camera "find the sun" aiming aid (compass + sun-position overlay) — explicitly
   not an astrophotography tool, no zoom.
5. Multi-stage reminders: Day-7, Day-3 (conditional on checklist), Day-1, Day-of
   10:00 local via push, sent by a GitHub Actions workflow (no server — see
   "Reminder architecture decision"); T-30/T-5 via client-side local notifications.

## Key modules (deliberately not shared/duplicated — see plan's "No-duplication list")
- Countdown/tick engine: `Date.now()`-delta + `fired`-Set pattern (from CrossFitTimer).
- Besselian polynomial evaluator + observer geometry: eclipse-specific, Milestone C
  only.
- Generic solar azimuth/altitude (Meeus ch. 25): Milestone E only, not shared with C.
- Timezone/DST: one shared `Europe/Amsterdam` conversion utility via `Intl`.

## Future UI considerations (not now — revisit once all 4 features are built)
- Possibly condense the 4 bottom tabs (Countdown/Coverage/Checklist/Camera) into
  fewer screens once real content is in place — deferred until Milestones B-E are
  done and there's real content to judge the layout against.

## Milestone status
- [x] A — PWA skeleton & install
- [x] B — Countdown + in-app local alerts
- [x] C — Location + coverage calculator (incl. address search via OpenStreetMap Nominatim)
  - [x] C1 — Source & transcribe Besselian elements (`besselian-2026-08-12.js`)
  - [x] C2 — Implement `localCircumstances()` math + self-check vs. reference values
  - [x] C3 — Validate against real reference data for NL locations (Amsterdam,
        Groningen, Maastricht, The Hague)
  - [x] C4 — Wire into UI (geolocation + manual override, Coverage tab, real countdown target)
- [x] D — Safety checklist
- [ ] E — Camera "find the sun" aid
- [ ] F — Server-less reminders (GitHub Actions does scheduling + sending; repo files
      are the only state) — built before E, per user request, since E is standalone
  - [x] ~~F1 — Write push-server code (Render/Express)~~ — **archived**, replaced by
        the server-less design below (see `push-server/ARCHIVED-not-used.md`)
  - [x] F1b — Write `.github/workflows/send-reminders.yml` +
        `.github/scripts/send-reminders.js` (reads/sends/commits state directly in
        the checked-out repo, no server); `subscriptions.json`/`sent-log.json`
        created at repo root
  - [x] F2b — Wire client: push subscription + GitHub Contents API sync
        (`syncSubscription`), on subscribe / every app open / every checklist change
  - [x] ~~F3b — Embed a fine-grained GitHub PAT directly in `index.html`~~ —
        **abandoned**: worked in live testing, then GitHub auto-revoked it once
        pushed (secret scanning revokes any exposed GitHub PAT on sight, in public
        repos, regardless of push-protection bypass). Confirmed on-device: a real
        subscribe attempt failed with "GitHub GET failed: 401" — the token was
        already dead. See "Reminder architecture decision" in this file.
  - [x] F3c — Write + deploy the Cloudflare Worker (`cloudflare-worker/worker.js`),
        `WORKER_URL` wired into `index.html`. Live-tested via `curl` (not mocked):
        Worker returned `{"ok":true}` and the write landed correctly in
        `subscriptions.json`. Client no longer holds any GitHub credential at all.
  - [x] F4b — Real subscription confirmed landing in `subscriptions.json`; first
        `test_send` `workflow_dispatch` run found a real bug (see F5b)
  - [ ] F5b — **Bug found and fixed:** `sw.js` had no `push` event listener at all,
        so a push accepted by FCM (confirmed: 1/4 test sends succeeded server-side)
        was silently never displayed. Added the listener, bumped `CACHE_NAME` to
        `eclipse2026-v13` — **not yet re-verified on-device**. Also still pending:
        user to clean up the stale/test entries in `subscriptions.json`.
- [ ] G — Full dry-run rehearsal (mandatory before 12 Aug 2026)
