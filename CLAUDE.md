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
- **Known, accepted security trade-off**: the client embeds a GitHub fine-grained PAT
  (scoped to only this repo, Contents read/write) directly in `index.html`, visible
  to anyone who views page source. Blast radius is limited to this one already-public
  hobby repo. Not appropriate for anything with real stakes — a deliberate, informed
  choice given this project's scale (a handful of family devices).

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
  - [x] F3b — Fine-grained GitHub PAT created (Contents read/write, this repo only)
        and embedded in `index.html`; live-tested against the real GitHub API
        (round-trip GET/PUT verified, test entry cleaned up). VAPID secrets in
        Actions still needs confirming — see next step.
  - [ ] F4b — Test via manual `workflow_dispatch` trigger; verify a subscribe
        actually lands in `subscriptions.json`, and Day-3 correctly skips a
        subscriber whose checklist is complete
  - [ ] F5b — Confirm push notification actually arrives on the phone from a real
        `workflow_dispatch` run (not just that the workflow completes without error)
- [ ] G — Full dry-run rehearsal (mandatory before 12 Aug 2026)
