# Eclipse_Aug_2026

Personal Android PWA for the 12 August 2026 solar eclipse. Originally scoped for the
Netherlands specifically; generalized (Milestone H2) to work anywhere in the region
that only sees a partial eclipse (Germany, Belgium, France, etc. — none of which are
in the path of totality, so the "always partial, no safe naked-eye moment" premise
still holds everywhere the app is used). Exact viewing spot is picked in-app, unknown
in advance.

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

## Layout redesign (Milestone H, in progress)
User wants the 4-tab layout condensed to 2 tabs (info + camera check), redesigned
incrementally, one decision at a time, rather than all at once.

**H1 — done:** Coverage is no longer its own tab. It's now a persistent header (not
inside any tab) showing either "Location not set yet" or the coverage summary
(% + start/max/end times) for whichever location is currently set, with "Set
location" (opens the location-picker as a modal overlay) and "Clear location"
(wipes stored location, resets countdown to placeholder) buttons underneath. Nav is
down to 3 tabs (Countdown, Checklist, Camera) as an intermediate step — further
consolidation toward 2 tabs is still to come, one piece at a time as the user directs.

**H1 refinements — done:** the location header is now a boxed panel matching the
Countdown tab's box styling (was previously a full-width bar), with an `<h2>Location</h2>`
heading in the same top-left position/style as "Countdown". The placeholder/"not
set" text and the resolved location description now share a single element
(`#locationDescription`) rather than toggling between two — once set, it shows the
address search result's name verbatim, or formatted coordinates as a fallback for
geolocation/manual entry (which don't have a place name available). Coordinates-only
fallback later upgraded to a real place name via reverse geocoding (see below).

**H1 follow-up — reverse geocoding, done:** geolocation and manual lat/lon entry
initially only showed raw coordinates ("52.3676°, 4.9041°"), which the user found
unclear — wanted a city/place name instead. Added `reverseGeocodeLabel()` using the
same OpenStreetMap Nominatim service already in use for address search, just its
`/reverse` endpoint. Location header shows coordinates immediately (no perceived
delay), then upgrades in the background to the resolved place name once the lookup
completes; the resolved name is also saved to `localStorage`, so a reload doesn't
need to redo the lookup. Best-effort only — a failed/slow lookup leaves the
coordinate fallback in place rather than blocking anything.

**H2 — done:** generalized all Netherlands-specific user-facing copy (the header
subtitle, removed entirely, and the checklist's safety-warning text, now "most of
Europe") — the underlying eclipse math already worked for any location (validated
earlier against a France test search), this was purely a copy change. Kept as its
own step per the user's incremental-design preference, even though small.

**H1 follow-up — moved into scrollable content, done:** the location box was
sitting between the app `<header>` and `<main>`, outside `main`'s scrollable area —
fine when empty, but once a location was set (coverage % + 3 time lines + buttons)
it ate a large, permanently-visible chunk of the viewport, and scrolling the
Countdown tab couldn't move it out of the way. User asked to have it live inside a
tab instead, scoped to Countdown only (not repeated on Checklist/Camera). Moved the
`#locationHeader` div to be the first thing inside `#panel-countdown`, right after
the "Countdown" `<h2>`, so it's now normal scrollable content — scrolls away with
the rest of the tab. Restyled as a nested sub-box (`var(--bg)` background inside the
panel's `var(--panel)` background, own border) with an `<h3>Location</h3>` (not
`<h2>`, to avoid two same-level headings — "Countdown" and "Location" — inside one
panel).

**H1 correction — two sibling boxes, not nested, done:** user rejected the nested
sub-box from the previous step ("you integrated it into the box in the tab") —
wanted Location to read as equal to Countdown, not subordinate to it. Restructured
`#panel-countdown` from one `.panel` box into a `flex-column` wrapper (box styling
stripped via an ID-specificity override, so it doesn't affect Checklist/Camera,
which still use plain `.panel`) holding **two separate `.info-box` boxes**, each
with its own `<h2>` heading styled identically to "Countdown": a **Location** box
(name/coordinates, coverage %, Set/Clear buttons) followed by a **Countdown** box
(clock, notifications, start/max/end times list — moved to the bottom of this box).
Both boxes now toggle between an empty message ("Location is not set") and their
populated content together, driven by `applyLocation()`/the clear handler —
including a location where the eclipse isn't visible at all (handled explicitly:
shows the location's info but keeps the Countdown box in its empty state, since
there's no valid target time to count down to there). Removed the "This countdown
target is a placeholder…" disclaimer paragraph entirely — no longer needed, since
the countdown UI itself is now hidden until a real location makes it meaningful.
Debug controls (time-jump buttons) explicitly kept for now, at the user's choice —
tracked as a pre-Aug-12 cleanup item, not removed yet.

**H1 correction #2 — fixed alignment (was right, should be left), done:** the two
new boxes' text was initially right-aligned, a mistake caught by the user
immediately ("my usual right/left mix up"). Switched all text in both boxes to
left-aligned (the countdown clock itself stays centered, as explicitly requested).
Renamed the `.right-muted` CSS class to `.tab-muted` so its name doesn't lie about
its own alignment. Also fixed two smaller issues flagged in the same pass: the
Countdown box's target line was repeating the maximum date/time that's already
shown in the times list below it — simplified to a static "Counting down to the
local eclipse maximum" — and removed the "Built in Milestone B" tag from the
Countdown box (a Milestone-tracking leftover, no longer relevant).

## Milestone E — Camera "find the sun" aid
Reuses the currently-set location (same one used for coverage %) rather than a
separate live GPS lookup — one location source of truth, avoids requesting
geolocation permission twice. Camera tab shows a "Location is not set" prompt (same
pattern as the Countdown box) until one exists.

- **`sun-position.js`** (new, standalone module — see its header comment and the
  plan's "No-duplication list" for why this is deliberately NOT shared with
  `besselian-2026-08-12.js`'s eclipse-specific math): implements the standard
  Meeus ch. 25 low-precision solar position formula. Self-validated against
  well-known astronomical facts (equinox/solstice declination values) rather than
  an unreachable third-party calculator — scanned for the sun's daily maximum
  altitude (= solar noon by definition) at several lat/date combinations, including
  a Southern Hemisphere case specifically to catch azimuth sign-convention bugs.
  All four checks matched expected values closely (largest deviation 0.05°),
  including the Southern Hemisphere azimuth correctly flipping to ~0° (due north).
- **UI**: safety/expectation-setting copy (never look at the sun directly; this is
  a directional aid, not an astrophotography tool — no zoom, phone camera renders
  the eclipsed sun as a small dot regardless of aim), live camera preview
  (`getUserMedia`, rear camera), an on-screen reticle + directional arrows driven
  by the difference between device orientation and computed sun position.
- **Photo capture — superseded once, now hands off to the native camera app.**
  Originally built with an in-app capture-to-canvas + download/share flow (matching
  the plan's original scope). User feedback after trying it on-device: missing
  their phone's normal camera controls (exposure, focus, zoom, shooting
  modes/themes) compared to the native app. Investigated what's actually
  achievable: exposure/focus are partially addressable via `MediaStreamTrack`
  constraints (inconsistent Android support, unverifiable without more on-device
  testing), zoom was already out of scope, and camera app "themes"/modes are a
  hard platform wall — no web API exposes native camera-app modes at all, full
  stop, not an implementation gap. Given that ceiling, replaced the whole in-app
  capture flow with `<input type="file" accept="image/*" capture="environment">`
  — tapping it launches the phone's actual native camera app, with every one of
  its normal controls intact, no web limitations whatsoever. This tab's job is now
  purely aiming; the native app owns the actual photo entirely. (The `getUserMedia`
  live preview stays — the reticle/arrows still need it for real-time aiming
  feedback — it's specifically the capture step that moved to the native app.)
- **Orientation handling**: feature-detects `DeviceOrientationEvent.requestPermission`
  (iOS-only gesture-gated permission API) and shows an explicit "Enable compass"
  button only when it exists; falls back to a plain numeric readout ("point toward
  SSE, azimuth 152°, 57° above the horizon") if orientation data is unavailable or
  denied — the camera feature never hard-depends on the compass working, per the
  plan. Compass heading conversion (`(360 - alpha) % 360`, or `webkitCompassHeading`
  on iOS Safari) and the beta-to-altitude mapping are documented in code comments as
  best-effort approximations — not independently verified against a real device in
  this session (no Android hardware available here), flagged for on-device
  confirmation same as prior milestones' hardware-dependent pieces.
- Camera stream (and the orientation listener + aim-guidance timer) is explicitly
  stopped when navigating away from the Camera tab, not left running in the
  background.
- **Real bug caught before it could ship**: `applyLocation()` — called
  automatically on page load for any returning user with a previously-set location
  — now also touches Camera-tab elements (`refreshCameraTabState()`). Those
  elements are declared via `const` near the very end of the script; the original
  auto-load trigger sat much earlier in the file, meaning every returning user
  would have hit a "cannot access before initialization" crash on load. Caught via
  a targeted headless test simulating a fresh page load with a location already in
  `localStorage` (not just the empty-state case that had been tested so far) — the
  exact scenario that would have broken. Fixed by moving the auto-load trigger to
  the very end of the script, after all section-level `const`s are declared.

## Post-Milestone-G QA pass fixes (external review of the live repo)
An independent QA pass over the deployed repo (post-E/G, mid-H) found two real
issues, both fixed:

1. **Leftover test entries in `subscriptions.json`/`sent-log.json`** would have
   caused a recurring, non-self-healing error once real reminders went live: the
   script's auto-cleanup path only removes a subscriber on a 404/410 from the push
   service, which `example.com` (the placeholder domain used for test entries)
   would never return. Removed both (`TEST-DELETE-ME`, `UNSUB-TEST`) from
   `subscriptions.json` via the Worker; user removed the matching `sent-log.json`
   entries directly via GitHub's web editor (the Worker only touches
   `subscriptions.json` by design — no channel exists to edit `sent-log.json`
   without a raw GitHub credential, which was deliberately given up in the
   Cloudflare Worker pivot). **Both files confirmed clean** — 6 real subscribers in
   `subscriptions.json`, 5 in `sent-log.json` (one subscriber hadn't been through a
   real, non-dry-run reminder check yet, so has no entry there — expected).
2. **No retry/conflict-handling on the reminder workflow's final git push.** The
   Cloudflare Worker commits to `subscriptions.json` independently (any
   subscribe/unsubscribe/checklist-change), so a Worker commit landing between this
   job's checkout and its push could make a plain `git pull --rebase && git push`
   fail outright — silently losing that run's `sent-log.json` update and risking a
   duplicate send next time. Added a 3-attempt retry loop (matching the Worker's
   own GitHub-PUT backoff pattern), with `git rebase --abort` between attempts to
   avoid a stuck mid-rebase state, and a loud `::error::` + `exit 1` on final
   failure rather than swallowing it.

   Validated with a real local git sandbox (bare repo + two clones), not just a
   syntax check: simulated a realistic concurrent write (this workflow removing
   one subscriber while the Worker touches a *different* subscriber's entry at the
   same time) — confirmed this rebases and pushes cleanly on the first attempt,
   since both writers use the same pretty-printed, one-key-per-line JSON format
   (`JSON.stringify(obj, null, 2)`), so non-overlapping edits land on different
   lines and never conflict at the git level. Separately simulated a genuine
   same-key conflict (both writers editing the *same* subscriber) — confirmed the
   retry loop correctly fails after 3 attempts, leaves no stuck rebase behind
   (working tree clean, no `.git/rebase-merge` marker left over), and would
   surface as a failed workflow run rather than disappearing silently.

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
- [x] E — Camera "find the sun" aid
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
  - [x] F5b — Fixed the missing `push` listener (see above); user confirmed a real
        notification now displays correctly from a `test_send` run, **both with the
        app backgrounded and fully closed**. Still open, deliberately deferred to
        Milestone G rather than tested now: the Day-3 checklist-conditional *skip*
        logic specifically — `test_send` bypasses all conditions, and force-testing
        a real dated reminder via `workflow_dispatch` would mark it "resolved" in
        `sent-log.json` for real, with no safe way to undo that (no GitHub write
        access held anymore). Also still pending: user cleanup of stale/test
        entries in `subscriptions.json` (cosmetic, not blocking).
  - [x] F6 — Unsubscribe option. Reminder timing (18:00/18:00/18:00/10:00 CEST for
        Day-7/-3/-1/day-of) confirmed fine as-is, no changes needed. Live-tested the
        Worker's delete path directly (added then removed a test entry via curl,
        confirmed the commit message and that the entry was actually gone) before
        asking for on-device confirmation — user confirmed the button toggles
        correctly and re-subscribing afterward also works.
- [ ] H — Layout redesign (4 tabs → 2 tabs), in progress — see "Layout redesign" above
  - [x] H1 — Coverage moved from a tab to a persistent header + location-picker modal
        (incl. box styling + heading refinements)
  - [x] H2 — Generalized Netherlands-specific copy for the wider European region
- [x] G — Full dry-run rehearsal (mandatory before 12 Aug 2026) — complete
  - [x] G1 — Simplified scope: T-30/T-5 alerts only need the location set at some
        point before the event (not a live GPS fix in the moment), since they're
        derived from whatever location is already saved. Added a location-set hint
        to the day-of reminder text, and reworded a checklist item (kept the same
        `id` to avoid losing existing testers' checked state) to make "set your
        location" an explicit, actionable checklist step rather than the vaguer
        "know your start time." Also fixed a stale "Coverage tab" reference left
        over from the Milestone H1 tab redesign.
  - [x] G2 — Added a safe `dry_run`/`simulate_date` mode to the reminders workflow
        (never sends a real push, never writes `subscriptions.json`/`sent-log.json`
        — logs what it would do instead). Ran it with `simulate_date=2026-08-12`
        (all four reminder dates "due" at once, in one pass) against the real
        production `subscriptions.json`, with one added synthetic
        `checklistComplete: true` test entry (removed again afterward) alongside
        the existing real/test entries that all have `checklistComplete: false`.
        Result: every `false` entry correctly showed "would SEND day3"; the one
        `true` entry correctly showed "would SKIP day3 (checklist already
        complete)"; Day-7/-1/day-of all correctly showed "would SEND" for every
        entry. This closes the F5b-deferred gap — the Day-3 conditional logic is
        now confirmed correct in both branches, using the real production code
        path, with zero real side effects (confirmed `sent-log.json` unchanged
        after the run).
  - [x] G3 — Confirmed the service worker's precache list (`sw.js` `CORE_ASSETS`)
        includes every file the app actually references (verified via direct code
        review — `manifest.json`'s icon paths and `index.html`'s `<link>`/`<script
        src>` tags all cross-checked against it, nothing missing). Real on-device
        confirmation: fully closed the app, enabled airplane mode, reopened from
        the home-screen icon — countdown, location/coverage, checklist, and camera
        tab all loaded normally offline.
  - [x] G4 — Confirmed GitHub's actual policy: scheduled workflows auto-disable
        after 60 *consecutive days with no commits* (not just any activity). Real
        risk for this event is low: Aug 12 is under 30 days out (well inside the
        60-day window from recent commits), and the app itself commits
        automatically via subscription re-sync whenever anyone opens it with an
        existing subscription — so normal usage during the Day-7/-3/-1 reminder
        window likely keeps the clock reset on its own. User chose to skip adding
        a dedicated monthly keepalive workflow given this short timeline, rather
        than build unneeded infrastructure — flagged here as a known, accepted,
        low-probability risk rather than mitigated with extra code.
