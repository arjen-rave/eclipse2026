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

**H3 — done:** consolidated from 3 tabs to 2, another step toward the original
2-tab goal. Moved the Safety checklist out of its own tab and into the
Countdown/Overview tab as a third `.info-box`, below Location and Countdown —
wrapped in a native `<details>` (not a custom JS toggle), collapsed by default,
so all three boxes fit on one screen without scrolling; expanding it is a single
tap on the "Safety checklist" heading, with a small rotating chevron indicator.
Tightened checklist spacing (row padding, gaps, font sizes) so the expanded view
is more compact too. Removed the (now empty) Checklist tab and its nav button.
Renamed the tab's nav label from "Countdown" to "Overview" — the internal
`#panel-countdown`/`#countdownBox` element IDs were deliberately left unchanged
(lower-risk than touching every JS reference for what's purely a user-facing label
change), and the individual "Countdown" box inside keeps its own heading, since
that specific box is still specifically about the countdown. Commented out (not
deleted) the debug time-jump controls, both the HTML block and its JS wiring, with
a note on what to uncomment together to bring it back — kept in source for quick
re-testing, per the user's explicit request not to lose it entirely.

**H3 follow-up — spacing tightened, done:** after seeing H3 on-device, user asked
to reduce top/bottom spacing across the Overview tab's boxes so the collapsed
Safety checklist would fit on-screen alongside Location and Countdown without
scrolling. Reduced `.info-box` padding (1.25rem → 0.9rem/1.1rem), the gap between
the three boxes (1rem → 0.65rem), `main`'s top padding (1rem → 0.75rem, sides/
bottom unchanged), and removed the default browser bottom margin under each box's
`<h2>` (now `margin: 0`, was `margin-top: 0` only) — safe to remove since the
element immediately following each heading already carries its own small top
margin as a buffer. Confirmed on-device: fits without scrolling.

## Milestone I — Landscape mode (in progress)
User asked for a landscape mode ("turn the phone sideways"), then, via a scoping
question, specifically asked for a real two-tab redesign rather than a minimal
reflow-only approach — both Overview and Camera get considered landscape layouts,
not just "doesn't visually break."

`manifest.json`'s `"orientation": "portrait"` — which was hard-locking the
installed PWA to portrait regardless of how the phone was physically held — changed
to `"any"`, since this needed to change before any landscape CSS could ever be
reached on an installed (not just browser-tab) instance.

**I1 — Overview tab, done:** added a `@media (orientation: landscape)` block that
switches `#panel-countdown.active` from a single flex column to a 2-column CSS
grid (`grid-template-columns: 1fr 1fr`) — Location and Countdown boxes land side
by side automatically (default grid auto-placement, no explicit positioning
needed), while the Safety checklist (matched via its existing `.collapsible-box`
class) gets `grid-column: 1 / -1` to stay a full-width row underneath, since it's
collapsed by default and doesn't need a whole column to itself. Pure CSS — no
HTML/JS changes, so none of the existing tab logic, checklist state, or countdown
engine was touched. Verified via a headless-Chrome screenshot at landscape phone
window dimensions (812×375 and 812×700, to see both the two-column row and the
full-width checklist row beneath it) — both boxes rendered side by side as
intended, checklist rendered as a full-width collapsed row below.

**I1 follow-up — real-device gotcha, resolved:** after deploying I1, the installed
home-screen app still wouldn't rotate. Root cause: Android's installed-app wrapper
(WebAPK) snapshots `manifest.json` at install time and doesn't necessarily re-read
a changed `orientation` field on a simple reopen — the service worker's
`CACHE_NAME` bump only affects what's served *inside* the app, not the WebAPK
shell's own manifest copy, which Android manages separately. Ruled out the device's
own auto-rotate toggle first (already on) and confirmed this was the installed
app, not a browser tab, before concluding it was a WebAPK-staleness issue.
**Resolved** by removing the app from the home screen and reinstalling it —
rotation then worked correctly. Noted for future manifest.json changes that affect
installed-app behavior: verify via reinstall, not just reopen.

**I2 — Camera tab, done:** the video preview moves to one side (spanning the full
column height via repeated `grid-template-areas` naming, standard CSS spanning
behavior) with the warning text, status line, and controls stacked in a column
next to it — instead of everything stacked top-to-bottom. The preview's
`aspect-ratio` switches from the portrait `3/4` to a landscape-shaped `4/3` to
match how the rear camera actually frames when the phone is held sideways.

**Real bug caught while testing I2, before it could ship:** built a throwaway
test copy of `index.html` (not the tracked file) to screenshot the Camera tab in
a landscape headless-Chrome window, and found the grid layout wasn't applying at
all — `#cameraContent` stayed in normal block flow regardless of the media query.
Root cause: `refreshCameraTabState()` toggles that box's visibility via
`element.style.display = ...` (an inline style), and an inline style always wins
over any external CSS rule, media query or not — so the landscape `display: grid`
rule could never take effect while the show/hide logic used inline styles. This
wasn't a landscape-specific bug so much as a latent one the landscape work
happened to expose (nothing previously needed `#cameraContent`'s `display` to be
anything other than plain block-vs-none). Fixed by switching both
`cameraLocationEmpty`/`cameraContent`'s visibility toggle from inline
`style.display` to a `.hidden` utility class (`classList.toggle`), so the media
query's `display: grid` applies normally once the class is removed. Re-verified
with the same headless screenshot approach after the fix — video preview and
reticle rendered on the left, warning/status/controls stacked correctly on the
right.

**Also picked up in this step (small item flagged by the user while confirming
I1 on-device):** `#pushSyncStatus` (the "Synced ✓" / "Unsubscribed ✓" / etc. line
under the notify button) no longer sits there permanently — `setPushSyncStatus()`
now clears it after 5 seconds (toast-style), canceling any previous pending clear
first so a fast-following message (e.g. "Unsubscribed ✓" right after
"Unsubscribing…") always gets its own full display window rather than being wiped
early.

**I2 follow-up — collapsible warning + shrink the landscape preview, done:** after
confirming I2 on-device, user asked for two more changes to the Camera tab, in
both orientations: (1) the on-screen safety warning should be collapsible, with a
short "Warning" header, open by default; (2) in landscape specifically, the video
preview was "too large" — the user wants it to fit on screen without having to
scroll while actively aiming.

For (1): converted `#cameraWarning` from a plain `<p class="checklist-warning">`
into a `<details class="checklist-warning collapsible-box" open>` with
`<summary>Warning</summary>`, reusing the existing `.collapsible-box` chevron/
cursor/marker-hiding styles (added via that shared class, no new CSS needed for
the toggle mechanics — same pattern as the Safety checklist box) plus one small
new rule (`.checklist-warning summary { font-weight: 700; }`) since there's no
`<h2>` here to inherit boldness from. Works identically in both orientations since
it's the same DOM element either way — only its grid placement changes in
landscape (unchanged `#cameraWarning { grid-area: warning; }`).

For (2): the previous implementation sized the preview from a fixed share of the
row's *width* (`aspect-ratio` computing height from a wide grid column) — on a
wide landscape viewport this produced a very tall box, taller than the screen.
Flipped the sizing direction: `#cameraPreviewWrap` now sets an explicit `height:
36vh` with `width: auto`, letting `aspect-ratio: 4/3` derive width from that
capped height instead of the other way around, and the grid column changed from
a fixed fraction (`1.2fr`) to `auto` so it shrinks to match. Also reclaimed a bit
of general vertical padding in landscape (`main`'s bottom nav-clearance padding
5.5rem → 4.5rem, still comfortably above the nav's real ~55-65px height; Camera
panel's own padding tightened to match the Overview tab's boxes). Verified via
headless-Chrome screenshots at both a realistic landscape height (800×400 —
preview, collapsed warning, and both buttons all fit with no scrolling needed)
and a deliberately extreme one (800×360 — fits with the warning collapsed, still
slightly short with it left open, which is expected and is exactly what the
collapse option is for).

## Milestone J — Camera aiming improvements: max-screen overlay, real native camera app

Two more requests after landscape mode: (1) a way to view the aiming preview at
full screen size, since the in-tab box is still cramped for actually lining up a
shot; (2) the "Open camera app" button was launching a stripped-down single-shot
capture UI instead of the phone's real Camera app (no mode switching, no video
toggle, forced confirm-per-shot) — user wanted the literal full app experience.

**Open camera app — replaced the mechanism entirely.** The previous
`<input type="file" accept="image/*" capture="environment">` approach (Milestone
E) is a web-standard *single-result capture* contract: the OS treats it as "give
me back exactly one photo," which is precisely why it can only ever show a
minimal capture UI and must return to the page after one shot — that's not a
particular camera app being stripped down, it's inherent to what that HTML
mechanism asks the OS to do, no matter which app answers it. Replaced with a plain
link to an Android intent that just *launches* the camera app in the foreground,
the same way a home-screen shortcut does, with no result expected back:
`intent://#Intent;action=android.media.action.STILL_IMAGE_CAMERA;end`. This opens
the actual full native Camera app (all shooting modes, in-app swipe to Video,
continuous shooting, no confirm-and-return step) exactly as requested — the
trade-off is the user now switches back to the browser manually (recents/back)
rather than a photo ever returning to the web page, which is fine since this app
never used the returned photo anyway (Milestone E already made photo capture
entirely the native app's job). `intent://` URL navigation is a Chrome-for-Android-
specific feature — this app already deliberately targets exactly that platform, so
no fallback path was built for other browsers. **Not verifiable in this dev
environment** (no real Android device or Chrome-for-Android intent resolution
available here) — flagged for on-device confirmation, same as the compass/
orientation approximations from Milestone E.

**Max-screen aiming overlay.** New button (bottom-right corner of the preview,
shown only once the camera stream is actually running) opens a body-level fixed
overlay covering the entire viewport, nav bar included. Rather than requesting a
second `getUserMedia` stream, the *same* live `<video>` element and its aim
overlay (reticle + arrows) are reparented (`appendChild`) into the fullscreen
container and back again on close — moving a media element within the same
document doesn't interrupt its playback, so the aiming aid keeps working
uninterrupted at both sizes. The overlay includes its own "Close" and "Open
camera app" buttons (the latter using the same intent link as above). Also wired
into the existing `stopCameraStream()` cleanup path, so navigating away from the
Camera tab (which already stops the camera) closes the overlay too if it happened
to be open.

**Real bug caught while testing, twice — same root cause both times.** Testing
the overlay's hidden-by-default state surfaced that `#cameraFullscreenOverlay`
never actually hid: its own `display: flex` rule (an ID selector) has higher CSS
specificity than the shared `.hidden { display: none }` utility class (a class
selector) — ID always beats class, regardless of which rule comes later in the
file. That prompted a check of the other place `.hidden` is depended on for
something with its own ID-scoped `display` rule: the Camera tab's landscape grid
(`#cameraContent { display: grid }`, from Milestone I2) had exactly the same
latent flaw — in landscape, with no location set, `#cameraContent` would have
incorrectly rendered as a visible grid instead of staying hidden, undetected
until now because every prior landscape test forced the element visible to check
the grid layout itself, never exercising the "should be hidden" state. Fixed both
by changing the ID rule to a compound `#id:not(.hidden)` selector — for any given
element, only one of `.hidden` or `:not(.hidden)` can ever match at a time, so
there's no specificity contest at all, unlike trying to out-rank `.hidden` with a
plain ID rule. Verified via explicit `getBoundingClientRect`/`getComputedStyle`
checks scripted into a throwaway test copy (simulated a full open→close cycle:
confirmed the overlay starts `display:none`, becomes `display:flex` with the
video reparented into `fullscreenVideoSlot` after a simulated click, then reverts
fully after a simulated close-button click) — chosen over screenshots for this
check after discovering this sandbox's headless Chrome doesn't render at the
exact `--window-size` requested (a `412×900` request laid out at `478×802`
internally, then the screenshot capture clipped to `412×900` pixels rather than
scaling), which made pixel-position screenshot comparisons unreliable for exact
positioning checks specifically; screenshots remained fine for verifying overall
layout/visibility elsewhere in this session since only exact-edge positioning is
sensitive to that discrepancy.

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
- [x] H — Layout redesign (4 tabs → 2 tabs) — complete, see "Layout redesign" above
  - [x] H1 — Coverage moved from a tab to a persistent header + location-picker modal
        (incl. box styling + heading refinements)
  - [x] H2 — Generalized Netherlands-specific copy for the wider European region
  - [x] H3 — Checklist consolidated into the Overview tab as a collapsible box,
        debug controls commented out, tab renamed to "Overview," spacing tightened
        so all three boxes fit without scrolling
- [x] I — Landscape mode — complete
  - [x] I1 — `manifest.json` orientation lock changed from `"portrait"` to `"any"`;
        Overview tab: Location and Countdown boxes side by side in landscape
        (`@media (orientation: landscape)`, pure CSS, no HTML/JS changes), Checklist
        stays a full-width row underneath. Verified via a headless-Chrome screenshot
        at landscape phone dimensions. Real-world gotcha found and resolved: an
        already-installed home-screen app doesn't necessarily pick up a changed
        manifest on a simple reopen — needed a reinstall (remove from home screen,
        re-add) to actually rotate.
  - [x] I2 — Camera tab landscape layout: video preview moves to one side (full
        column height, `aspect-ratio: 4/3` instead of the portrait `3/4`), warning
        text + status + controls stack in a column next to it, via
        `grid-template-areas` on `#cameraContent`. Found and fixed a real bug
        during testing (see error-log): `cameraLocationEmpty`/`cameraContent`'s
        show/hide was driven by inline `style.display`, which always beats an
        external CSS rule regardless of media query — meaning the landscape grid
        could never have taken effect at all. Switched both to a `.hidden` utility
        class (`classList.toggle`) so the media query's `display: grid` can win
        once the class is removed. Also picked up a small item flagged by the
        user while confirming I1 on-device: `#pushSyncStatus` ("Synced ✓" etc.)
        now clears itself after 5s instead of sitting under the notify button
        permanently — a toast, not a permanent status line.
  - [x] I2 follow-up — safety warning is now a collapsible `<details>` (open by
        default, "Warning" header), in both orientations; landscape preview
        height capped (`36vh`, width auto via `aspect-ratio`) instead of being
        driven by a fixed share of the row's width, so it fits on screen without
        scrolling while aiming
        (later bumped to `40vh`, ~10% bigger, per user feedback)
- [x] J — Camera aiming improvements — complete, see "Milestone J" above
  - [x] "Open camera app" now launches the actual native Camera app via an
        Android intent (`action=android.media.action.STILL_IMAGE_CAMERA`) instead
        of the old single-shot file-input capture UI — full modes, video toggle,
        continuous shooting, no forced confirm-per-shot. Not verifiable in this
        dev environment (no real Android device); flagged for on-device check.
  - [x] New "max screen" button opens a fullscreen aiming overlay (reparents the
        live video + aim overlay, doesn't restart the camera), with its own
        Close/Open-camera-app buttons. Found and fixed a real bug during testing:
        two ID-scoped `display` rules (`#cameraFullscreenOverlay`, and — caught
        retroactively — Milestone I2's landscape `#cameraContent`) could never
        actually be hidden by the shared `.hidden` class, since an ID selector's
        specificity always beats a class selector's regardless of source order.
        Fixed both via `:not(.hidden)` compound selectors.
  - [x] J follow-up — real on-device testing of v30 found two problems: (1)
        "Open camera app" had lost its yellow accent styling — moving it from
        an ID to a shared class (`.open-camera-app-btn`) dropped its specificity
        below the generic `.info-box-buttons a` rule; fixed by nesting the class
        under its container (`.info-box-buttons .open-camera-app-btn`, two
        classes beats one class + one type selector) and giving
        `#fullscreenCloseBtn` the same accent styling, per the user's request
        that both max-screen buttons be yellow. (2) the intent link wasn't
        actually opening the camera app — likely cause: an empty authority
        (`intent://#Intent;...`) where every documented-working example has a
        non-empty path segment; added one (`intent://open/#Intent;...`). This
        second fix is a best guess, not yet confirmed on-device — flagged as
        such, with a fallback plan (revert to the file-input `capture`
        mechanism) if it still doesn't work.
  - [x] J follow-up #2/#3 — two more intent-URI syntax variants
        (`intent://open/#Intent;...` then `intent:#Intent;...`, no `//`) both
        confirmed on-device to still not launch anything. Two independently
        plausible forms both failing points to a platform-level restriction
        (likely: the installed PWA's WebAPK wrapper blocking non-http(s)
        navigation), not a syntax mistake — not fixable by further guessing
        from this environment. **Reverted** "Open camera app" to Milestone E's
        original file-input `capture` mechanism per the fallback plan already
        agreed with the user: a single shared hidden `<input type="file"
        capture="environment">`, with two `<label for="...">` elements (main
        controls + max-screen overlay) both pointing at it. Net result: back
        to the exact working-but-limited behavior from before Milestone J
        started; the "full native app" experience remains an open want, not
        achievable via any web-exposed mechanism found so far.
  - [ ] J follow-up #4 — user confirmed on-device, after a full close/reopen,
        that the reverted file-input mechanism *also* does nothing — same
        symptom as the failed intent-link attempts. Live deploy checked
        directly (curl) and confirmed to match intended source, so this isn't
        a deploy/cache mismatch. Root cause not yet identified — deliberately
        stopped guessing further per the user's explicit instruction, and asked
        instead whether the button behaves differently in a plain Chrome tab vs.
        the installed home-screen app (to check whether this is the same class
        of WebAPK-only restriction found twice already, or something else).
        Still open. Added an always-visible version tag (bottom-right, muted,
        hardcoded string bumped by hand alongside `CACHE_NAME` each deploy —
        `index.html`/`sw.js` don't share a JS scope to derive it automatically)
        so the user can confirm which build is actually loaded going forward.
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
