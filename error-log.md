# Error Log — Eclipse_Aug_2026

Running log of errors encountered during development and how each was resolved.

## Milestone A — PWA skeleton & install

No errors encountered.

## Milestone B — Countdown + in-app local alerts

Initial build passed headless-browser smoke testing (no console errors, countdown
rendered correctly) but three bugs only surfaced during real on-device testing:

1. **No lock-screen/system notification appeared.** `fireAlert()` called
   `new Notification(...)` directly from page JS, which Android Chrome rejects
   ("Illegal constructor" — Android only allows notifications dispatched through the
   service worker). The `try/catch` was silently swallowing the error, so nothing
   appeared and no error was visible on-device. Fixed by routing through
   `navigator.serviceWorker.ready` → `reg.showNotification(...)`.
2. **In-app alert banners never disappeared or had a way to dismiss them.** Fixed by
   adding a 15-second auto-dismiss timeout and a manual × close button per banner.
3. **Service worker served stale content after a deploy** — a tab that had loaded the
   Milestone A build kept showing old content after the Milestone B push, until the
   site's cache was manually cleared. Root cause: `sw.js`'s bytes hadn't changed
   between the two deploys, so Chrome's update check (which byte-diffs the service
   worker script) never detected a new version to install — the cache-name-purge
   logic in `activate` never even ran. Fixed by bumping `CACHE_NAME` to a new value;
   this must be bumped again on every future deploy that changes cached files, or the
   same staleness will recur. One manual cache clear was still needed on the
   already-affected device to un-stick the old worker — this fix only prevents the
   problem going forward, it can't retroactively fix an already-stuck client.

Lesson: headless smoke testing catches JS syntax/runtime errors but not
platform-specific API behavior (Android's notification constructor restriction) or
service-worker update-lifecycle bugs — on-device testing remains required before
considering a milestone done.

4. **Tapping the system notification didn't dismiss it or focus the app.** `sw.js`
   had no `notificationclick` listener at all, so tapping a notification did whatever
   the OS default is (leaving it in the shade) instead of closing it and
   focusing/opening the app. Fixed by adding a `notificationclick` handler that closes
   the notification and focuses an existing window or opens a new one. `CACHE_NAME`
   bumped to `eclipse2026-v4` accordingly.

## Milestone C1 — Source & transcribe Besselian elements

No errors encountered. Sourced from NASA/GSFC's published page for this eclipse via
two independently-worded fetches (one structured extraction, one verbatim raw-text
request) — both agreed exactly on every coefficient, so no discrepancy to resolve.
Parsed the resulting `besselian-2026-08-12.js` in headless Chrome to confirm it's
syntactically valid and every value round-trips correctly through `JSON.stringify`.
Not yet checked against a fully independent second publisher (e.g. IMCCE/HMNAO) —
noted as non-blocking in the file's header comment, can revisit if wanted later.

Follow-up: the user caught that NASA's page also publishes lunar radius constants k1
(penumbra) and k2 (umbra), which hadn't been transcribed. Added them. Flagged an open
question in the file for Milestone C2: k1/k2 are believed (standard convention, not
freshly verified against a formula this session) to be Moon/Earth radius ratios, not
the Moon/Sun angular-size ratio the obscuration-% formula needs — that should instead
be derivable from l1(t)/l2(t) directly. C2 must validate this against the published
magnitude (1.0386) before relying on it.

## Milestone C2 — Implement `localCircumstances()` math

One real bug found and fixed during self-checking, one residual discrepancy flagged
(not blocking):

1. **Longitude sign convention bug.** Initial implementation used the modern
   east-positive longitude directly in `H = mu - lonDeg`. Self-check against NASA's
   published greatest-eclipse point (65.225°N, -25.228°E) gave magnitude 0.8357
   instead of the expected ~1.0386, and an Amsterdam test showed an implausible 93%
   coverage. Root cause: the classical Besselian-element formula `H = mu - lambda`
   uses lambda measured **positive west** (older astronomical convention), not the
   modern east-positive convention this app uses everywhere else for geolocation.
   Fixed by changing to `H = mu + lonDeg` (equivalent to subtracting the
   west-positive value). Confirmed against real ground truth from timeanddate.com for
   Amsterdam (published: 88.26% max coverage, start 19:16:05/max 20:10:56/end
   21:03:03 CEST) — computed result: 88.06% coverage, peak time within 8 seconds of
   the published maximum. Also confirmed the k1/k2 open question from C1: the
   Moon/Sun ratio derived from l1'/l2' (not the published k1/k2 constants) is what's
   used, and it produces correct results — k1/k2 are not needed by this
   implementation.

2. **Residual (flagged, not fixed): raw `magnitude` at the exact totality point
   reads 1.0175, not the published 1.0386.** The location-independent Gamma check
   (0.8978) passes exactly, and — more importantly for this app — obscuration%
   correctly saturates to 100% at the totality point and matches real-world ground
   truth almost exactly at a genuine partial-eclipse location (Amsterdam). Since the
   Netherlands never reaches totality, `magnitude` will always stay below 1 there,
   and the app only ever displays obscuration% (never raw magnitude), so this
   discrepancy doesn't affect anything the app shows. Not fully root-caused — noted
   here rather than silently dropped, in case it's worth revisiting later.

Validation overlapped with what Milestone C3 was scoped to do (a real NL reference
city, from timeanddate.com) — worth reviewing at C3 whether much further validation
is still needed given this result.

## Milestone C3 — Validate against real reference data for multiple NL locations

Per user request, added Groningen and Maastricht to Amsterdam as reference points
(plus The Hague, added during debugging). timeanddate.com and theskylive.com both
returned HTTP 403 to direct fetches in this session, so reference figures came from:
Amsterdam via a direct Wikipedia table fetch (higher confidence), and Groningen/
Maastricht/The Hague via WebSearch-summarized snippets of theskylive.com (lower
confidence — not independently re-verified against the primary page).

Results: Amsterdam 88.06% computed vs. 88.26% published (0.20pt), Maastricht 88.73%
vs. 88.89% (0.16pt), The Hague 88.53% vs. 88.69% (0.16pt) — all tight, consistent
matches. **Groningen 86.81% computed vs. 89.08% published — a 2.27pt gap, notably
larger than the other three.**

Investigated rather than accepted at face value: Groningen is the most easterly and
northerly of the four cities, yet the reference claims it has the *highest* coverage
of the four, while the implementation (which matches the other three tightly) shows a
smooth spatial gradient implying it should have the *lowest* — a directional
contradiction, not just noise. Flagged as likely-unreliable reference data rather than
a bug, pending a better source.

**Resolved.** The user identified that the "89.08%" figure was actually for Bergen op
Zoom (a town in the southwest, near the Belgian border) — a location mix-up in the
earlier search-summarized snippet, not a real Groningen value. Found a
GeoNames-verified Groningen page (drikpanchang.com, geoname-id=2755251, confirmed
"Location: Groningen, Groningen, Netherlands" in the fetched content): magnitude 0.89,
times 19:14 PM / 20:09 PM / 21:00 PM local.

This also surfaced a units nuance, not a bug: drikpanchang labels its figure "Maximum
Magnitude: 0.89 (89% of the sun covered)" — conflating magnitude (diameter fraction)
with obscuration (area fraction), which are related but distinct quantities. The
implementation's computed **magnitude** for Groningen is 0.8894 (rounds to 0.89 —
matches exactly); its computed **obscuration** is 86.81% (the true area-based %,
appropriately a bit lower than magnitude, consistent with the same
magnitude-vs-obscuration gap seen at all three other cities: Amsterdam
magnitude=0.8992/obscuration=88.06%, Maastricht 0.9045/88.73%, The Hague
0.9029/88.53%). Times matched to the minute (19:14:38 / 20:09:08 / 21:00:58 computed
vs. 19:14 / 20:09 / 21:00 published).

All four Netherlands cities now validate cleanly. No remaining discrepancy in C3.

## Milestone C4 — Wire into UI

No errors encountered. Added geolocation + manual lat/lon entry to the Coverage tab,
wired to `EclipseMath.localCircumstances()`, with the location persisted to
`localStorage` (`ec_location`) so it's remembered across visits. Per user request,
split the countdown/alert engine's single target into two: `ec.targetUTC` (drives the
main countdown display, set to eclipse **maximum**) and `ec.startTimeUTC` (drives the
T-30/T-5 alerts, set to eclipse **start**) — previously both were the same value.
Updated the debug jump buttons to reference start time too, since that's what the
alerts actually key off.

Verified end-to-end via a headless-Chrome iframe test driving the real page
functions (not reimplemented test logic): for Amsterdam, coverage/times rendered
correctly (88%, Start 19:16/Max 20:10/End 21:02 — matching the C3 validation exactly),
and the debug jump sequence confirmed T-30/T-5 alerts fire relative to start (e.g.
jumping to "31 min before start" correctly showed 1h25m remaining on the
countdown-to-*maximum* display — 31 min to start plus the 54 min start-to-max gap —
confirming the two references are properly independent) with no alerts fired too
early and correct catch-up firing when skipping past a threshold. Added
`besselian-2026-08-12.js` to the service worker's precache list and bumped
`CACHE_NAME` to `eclipse2026-v5` accordingly.

## Follow-up — Address/place search

Per user request (wanting to preset a home address without knowing its coordinates),
added address search using OpenStreetMap's free Nominatim geocoder — no API key
needed. Only used at setup time to resolve an address to lat/lon; once resolved, it's
cached identically to geolocation/manual entry, so the core no-network-at-eclipse-time
requirement is unaffected. Added the required attribution text ("Location search by
OpenStreetMap Nominatim") per Nominatim's usage policy.

No errors encountered. Verified end-to-end via headless Chrome against the real
Nominatim API (not mocked): searching "Groningen, Netherlands" returned 3 matches,
selecting the first correctly resolved to 87% coverage with times matching the
earlier-validated Groningen figures (19:14/20:09/21:00). Bumped `CACHE_NAME` to
`eclipse2026-v6` since `index.html` changed. Confirmed on-device by the user,
including a search for a place in France (works for arbitrary locations, not just
the Netherlands, since the underlying math isn't NL-specific).

## Milestone D — Safety checklist

No errors encountered. Six items, all reflecting the partial-eclipse-only reality
(no totality-style "safe to remove glasses" window — explicit warning banner at the
top of the tab plus glasses-related items say "required the whole time"): glasses
ready, glasses/filter tested for damage, camera solar filter, knowing local start
time, family briefed, viewing spot picked. State persists in `localStorage`
(`ec_checklist_state`). Exposed `isChecklistComplete()` on `window` for Milestone F's
Day-3 conditional server reminder to call later.

Verified end-to-end via a headless-Chrome iframe test: 6 checkboxes render,
`isChecklistComplete()` correctly toggles false/true/false as items are
checked/unchecked, and — reloading the iframe to simulate a real app restart — all
checked state and the "All set for the eclipse!" progress message persisted
correctly. Bumped `CACHE_NAME` to `eclipse2026-v7` since `index.html` changed.

**Deployment note (infra, not app):** the GitHub Pages build for this commit got
stuck in `queued` status with "The job was not acquired by Runner of type hosted even
after multiple attempts" — a transient GitHub Actions hosted-runner issue, confirmed
via the Actions API (run stayed queued for 30+ minutes, unaffected by a manual
re-run). Turned out to be a real, ongoing GitHub-wide incident ("Delays starting
Actions runs", confirmed via githubstatus.com), not caused by anything in this repo.
Resolved on its own; a follow-up documentation commit's fresh deployment run
succeeded once GitHub's backlog cleared.

## Milestone F1 — Write push-server code

No errors encountered. Built before Milestone E per user request (E is standalone,
F has more moving parts worth getting started on). Generated VAPID keys via the Web
Crypto API in headless Chrome (`crypto.subtle.generateKey` ECDSA P-256 + raw/JWK
export), since no Node install was available locally to use `web-push`'s own
key-generator CLI — verified the exported public key is exactly 65 bytes
(uncompressed EC point) and the private key's JWK `d` field is the expected 32-byte
base64url scalar, matching what `web-push` expects.

Storage design (discussed with user): local JSON file, not a hosted KV store, per
user's preference to avoid another external dependency — see CLAUDE.md's "Push-server
storage decision" for the risk analysis and the sync-on-every-open mitigation.

Reminder times (Day-7/-3/-1/day-of) are fixed global constants in `server.js`, not
computed/sent by the client — since they're calendar-fixed and not location-specific,
hardcoding them server-side (as verified-safe UTC instants, with a comment on the
CEST/no-DST-transition assumption for early August 2026) is simpler and removes a
class of potential client-side timezone bugs.

Could not run/test the server locally (no Node/npm/npx found on this machine).
Mitigated as best as possible without execution: installed `esprima` (pure-Python JS
parser) via pip and syntax-checked `server.js` — passes. `package.json` validated as
well-formed JSON. Logic was reviewed carefully by hand but has NOT been executed —
real verification will happen once deployed (Milestone F2) and exercised end-to-end
(Milestone F5).

## Architecture pivot — F1 (Render) replaced with server-less GitHub Actions design

Before deploying F1's server, the user directed a full replacement: drop Render
entirely, have GitHub Actions do both scheduling and sending, with subscriber list +
sent-state living as JSON files committed to the repo instead of on a hosted server.

**Discrepancy flagged and resolved before proceeding:** the redesign spec stated Day-3
had "already" been made unconditional (checklist-independent) "per the earlier
decision," but no such decision existed in this conversation — the checklist-
conditional Day-3 behavior was explicitly requested by the user and built in
Milestone D. Raised this directly rather than silently picking either interpretation.
User clarified: they'd only dropped conditionality because they thought it required
Render specifically — confirmed it doesn't, and kept Day-3 conditional using the same
GitHub-file approach (subscription entries carry a `checklistComplete` field the
Actions script checks).

Archived (not deleted) the F1 Express server: `push-server/server.js`,
`package.json`, `.gitignore`, `.env.example` removed, replaced with
`push-server/ARCHIVED-not-used.md` explaining the pivot, per user instruction not to
leave dead code without a clear marker.

Built: `.github/workflows/send-reminders.yml` (schedule: twice daily, 08:00 + 16:00
UTC = 10:00/18:00 CEST, with the offset reasoning commented since GitHub Actions cron
is UTC-only and DST-unaware; plus `workflow_dispatch` for manual testing) and
`.github/scripts/send-reminders.js` (reads `subscriptions.json`/`sent-log.json` from
the checked-out repo, Amsterdam-calendar-date due-check via `Intl`, per-subscriber
catch-up-safe sent tracking, commits state back). Reused the F1 VAPID keys rather
than regenerating (moved private key from a Render env var to a GitHub Actions repo
secret).

Client (`index.html`): added `githubGetFile`/`githubPutFile`/`syncSubscription`
(GitHub Contents API, upsert-by-endpoint, retry-on-409) and `subscribeToPush`
(PushManager, VAPID key). Wired into: the "Enable notifications" button, an
on-load re-sync if already subscribed, and the checklist checkbox handler (so
`checklistComplete` in `subscriptions.json` stays current for Day-3's check). GitHub
fine-grained PAT embedded client-side per user's explicit, informed choice — flagged
with a code comment about the trade-off (visible in page source, blast radius
limited to this one public hobby repo).

No errors encountered. Verified without a real PAT/Node (neither available/usable
yet — Node.js *is* available on GitHub's own Actions runners, just not in this local
dev environment, so `send-reminders.js`'s real execution will happen there rather
than locally):
- Syntax-checked `send-reminders.js` with esprima (passes) and the workflow YAML
  with PyYAML (parses correctly — noting PyYAML's own YAML-1.1 quirk of reading the
  `on:` key as boolean `True`, which is a parser-side artifact only, not a real issue
  for GitHub's actual workflow parser).
- Headless-Chrome tests against the real page code (not reimplemented logic):
  `utf8ToBase64`/`base64ToUtf8` round-trip correctly; `urlBase64ToUint8Array` decodes
  the real VAPID public key to exactly 65 bytes starting with `0x04` (correct
  uncompressed EC point format for `applicationServerKey`).
- Mocked `fetch` to exercise `syncSubscription`'s actual control flow end-to-end:
  upserting a new device, adding a second device without clobbering the first,
  re-syncing an existing device's `checklistComplete` without creating a duplicate
  entry, and a simulated 409 conflict correctly triggering a retry that then
  succeeds.

Still needed before this is real (tracked as F3b–F5b): user creates the fine-grained
PAT and pastes it in; VAPID keys added as Actions repo secrets; a `workflow_dispatch`
test run to confirm the whole loop actually works against GitHub's live
infrastructure, including a real push notification arriving on the phone.

## F3b — Live GitHub API test with the real PAT

User created the fine-grained PAT (had to regenerate once — first attempt had the
wrong expiration date) and provided it; embedded in `index.html` in place of the
placeholder.

**Bug found and fixed via live testing against the real API (not mocked):** ran a
real GET → PUT → GET → PUT → GET sequence against the actual `subscriptions.json` in
the repo (writing a harmless test entry, then cleaning it up). The GET immediately
following the first PUT returned **stale** content/sha — GitHub's Contents API has a
real read-after-write propagation lag (a fresh read ~4 seconds later showed the
correct state). This caused a 409 on the cleanup PUT, correctly caught by the
existing conflict-detection, but `syncSubscription`'s retry loop had no delay between
attempts, so rapid retries would likely keep hitting the same stale read and never
succeed. Fixed by backing off 2s then 4s between retries — costs nothing in
perceived responsiveness since this all runs silently in the background. Manually
cleaned up the test entry in the live repo via direct `curl` calls (confirmed
`subscriptions.json` sha matches its pre-test state exactly).

Re-verified after the fix: no console errors on load. Not yet re-run against the live
API after the backoff change specifically (the original bug was reproduced and
understood, and the fix is a straightforward backoff-delay addition) — full
confidence will come from the F4b/F5b `workflow_dispatch` test.

Still open: confirm `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` have actually been added
as GitHub Actions repository secrets (asked, not yet confirmed) before attempting a
`workflow_dispatch` test run.

User confirmed both secrets added.

## Test-mode addition, before the first workflow_dispatch run

Realized before testing: running the real reminder-check logic via `workflow_dispatch`
today (well before any of the Aug 2026 target dates) wouldn't test a real send at
all — nothing would be "due" — and if it were forced to fire early by any means, it
would mark that reminder resolved in `sent-log.json`, silently cancelling the real
send on its actual date. Added a separate `test_send` workflow_dispatch input:
when true, the script sends a fixed one-off test message to every current
subscriber and exits, never touching `sent-log.json`/`subscriptions.json` — the
workflow also skips its commit-back step entirely in this mode. Completely
independent from the real reminder state machine, so it can be run as many times as
needed with zero risk to the real schedule.

## Debugging on-device: subscription not landing in subscriptions.json

After both VAPID secrets were confirmed added, user tapped "Enable notifications" —
got a real fresh permission popup (confirming this wasn't already-granted stale
state) — but `subscriptions.json` stayed empty. Tried to get real console output via
Chrome remote debugging (`chrome://inspect`, USB), but the phone never showed the
USB-debugging authorization popup despite repeated reconnects/revokes — a platform/
driver-level ADB issue, not something worth chasing further right now.

Root issue with the diagnostic approach itself: `catch (e) { console.error(...) }`
everywhere in the subscribe/sync path is invisible on a phone with no easy devtools
access — the exact same class of mistake as the earlier Milestone B notification bug
(silent catch masked a real error until on-device testing forced it into the open).
Fixed properly this time by not relying on remote debugging at all: added a visible
`#pushSyncStatus` status line under the "Enable notifications" button, and had
`syncSubscription` (plus the three call sites: button click, on-load re-sync,
checklist-change re-sync) write their actual outcome — "Subscribing…", "Synced ✓",
"Retrying sync…", or the real error message — directly to that element. Whatever's
actually failing should now be readable straight off the phone screen, no cable or
DevTools needed. Bumped `CACHE_NAME` to `eclipse2026-v10`.

Not yet re-tested on-device with this change — next step is to have the user tap
"Enable notifications" again and report exactly what `#pushSyncStatus` shows.

## Architecture pivot #2 — client-side GitHub PAT abandoned, moving to Cloudflare Worker

The visible-status fix worked exactly as intended: user did a full clean reinstall
(uninstalled app, cleared cookies/site data, reinstalled, re-enabled notifications),
got a fresh permission prompt, and `#pushSyncStatus` immediately showed the real
problem instead of silence: **"Sync failed: GitHub GET failed: 401."**

Verified directly (not assumed): re-ran the exact same token that had worked during
F3b's live GET/PUT test — now returns 401 from a plain `curl` call too, confirming
the token itself is dead, not a phone-specific issue.

Root cause (confirmed via research, not guessed): GitHub's secret scanning
automatically revokes any GitHub personal access token — classic or fine-grained —
that it detects committed to a public repository. This is a standing, always-on
security feature; GitHub is the registered "partner" for its own token format, so it
revokes on sight. Critically, this is **separate** from push protection: approving
the "allow this secret" bypass only lets the specific push through — it does not
stop the ongoing secret-scanning-alert system from revoking the token shortly after.
Regenerating and re-embedding a new token would just get revoked again on the next
push. This makes "embed a raw GitHub PAT in client-side code of a public repo" a
structurally non-viable design, not a one-off mistake to patch.

Discussed the fix directly with the user rather than silently picking an approach:
laid out three options (a small serverless write-proxy, e.g. Cloudflare Worker; a
different anonymous-write storage service; or dropping automatic client-side writes
entirely in favor of manual one-time additions per family member). User asked
specifically whether the Cloudflare Worker option is free and safe before deciding —
confirmed: free tier (100k requests/day, vastly more than this app needs, no card
required) and, on safety, explained why it's actually an improvement over the PAT
approach: the real GitHub PAT would live only as a Cloudflare-encrypted secret
(never in any git repo, never sent to a browser, so GitHub's scanner never sees it),
and the client would instead hold a separate, narrow-scope shared secret whose blast
radius is limited to the one operation the Worker exposes (upserting a subscription
entry), not full repository access. User approved proceeding with this approach.

Docs (this file and CLAUDE.md's "Reminder architecture decision") updated to reflect
the pivot before starting the Worker implementation, per user's explicit request to
keep the docs in sync with the current approach as it changes.

## F3c — Write the Cloudflare Worker + client changes

No errors encountered. Wrote `cloudflare-worker/worker.js`: accepts POST requests
authenticated with a shared `APP_SECRET` (Cloudflare secret, distinct from the real
GitHub PAT, which is also a Cloudflare secret and never appears in the Worker's
response or logs), validates the subscription payload, and performs the same
upsert-by-endpoint + retry-on-409-with-2s/4s-backoff logic that used to live
client-side, now server-side. Includes CORS headers (the client on
`arjen-rave.github.io` calling a `*.workers.dev` origin is cross-origin) and handles
the `OPTIONS` preflight.

Client (`index.html`): `syncSubscription` now POSTs to the Worker instead of calling
GitHub's Contents API directly; removed the now-unused `githubGetFile`/
`githubPutFile`/`utf8ToBase64`/`base64ToUtf8` helpers and the dead embedded PAT.
Generated a fresh random `WORKER_APP_SECRET` (via Web Crypto `crypto.randomUUID()`
in headless Chrome, same technique used for the original VAPID keys) — this one
still ends up visible in page source, but its blast radius is limited to the one
operation the Worker exposes, not full repo access like the old PAT.

Verified with a mocked `fetch` (real page code, not reimplemented logic): confirmed
the Worker receives the correct `Authorization: Bearer <secret>` header and payload
shape on a simulated success response, and that a simulated 401 (e.g. wrong secret)
surfaces correctly via `#pushSyncStatus` ("Sync failed: worker returned 401:
unauthorized") rather than failing silently.

Wrote `cloudflare-worker/README.md` with dashboard-only setup steps (no
Wrangler/Node needed, consistent with not having Node available in this dev
environment — Cloudflare's browser-based "Quick Edit" editor sidesteps that
entirely). Bumped `CACHE_NAME` to `eclipse2026-v11`.

**Not yet deployed** — `WORKER_URL` in `index.html` is still a placeholder. Next:
user creates the Worker via Cloudflare's dashboard, adds a fresh `GITHUB_PAT` (this
one safe, since it only ever lives as a Cloudflare secret) and `APP_SECRET` as
Worker secrets, and provides the deployed Worker's URL.

## Worker deployed — live end-to-end test

User created the Worker via Cloudflare's "Hello World" starter template (the
dashboard's Worker-creation flow offers GitHub/GitLab-connected, Hello World, a
template gallery, or static-file-upload — "Hello World" is the right choice for a
single hand-written Worker with no CI/CD needed), pasted in `worker.js`, added both
secrets, and provided the deployed URL:
`https://eclipse2026-subscribe.arjen-ravestein.workers.dev/`.

No errors encountered. Verified with a real `curl` call (not mocked) before wiring
into the client: POSTed a harmless test subscription with the real `APP_SECRET` —
Worker returned `{"ok":true}` (HTTP 200), and `subscriptions.json` in the repo
correctly showed the new entry moments later. Confirmed the Worker's own GitHub PAT
works correctly for both read and write.

One asymmetry worth noting: cleanup of the test entry now has to be done by the user
directly (via GitHub's web editor) rather than by a follow-up API call from this
session — I no longer hold any GitHub write credential myself, which is exactly the
intended outcome of this whole pivot, not a gap.

Wired the real Worker URL into `index.html` (`WORKER_URL`), verified no console
errors on load, bumped `CACHE_NAME` to `eclipse2026-v12`.

Still open: real on-device test (tap "Enable notifications" on the phone, confirm a
real subscription — not a curl test one — lands in `subscriptions.json`).

## F4b — First workflow_dispatch test-send: real bug found (no `push` listener)

User confirmed a real subscription synced ("Synced ✓" on-screen), and two genuine
`fcm.googleapis.com` push endpoints showed up in `subscriptions.json`. Ran the new
`test_send` mode via manual `workflow_dispatch` — user reported nothing arrived.

Couldn't fetch the run's raw logs via the API myself (403 "Must have admin rights" —
no write-level token available, by design after the PAT pivot), so had the user
copy/paste the "Run reminder check" step's output directly. That log was the key
diagnostic: **"Test send: 4 subscriber(s) found... sent=1/4"**, with explicit failure
reasons for the other 3 (the leftover `TEST-DELETE-ME` entry lacking real keys, and
two now-stale subscriptions returning 410 Gone — likely from earlier
uninstall/reinstall cycles during the debugging sessions, leaving orphaned entries
`test_send` mode deliberately doesn't clean up).

The 1/4 success was the real signal: a push message WAS accepted by Google's FCM for
a currently-valid subscription, yet the user still saw nothing. Root cause: **`sw.js`
had no `push` event listener at all.** Milestone B's local T-30/T-5 notifications
call `showNotification()` directly from an open page — a fundamentally different
mechanism from a real push arriving via the browser's Push API, which is delivered to
the service worker as a `'push'` event regardless of whether the page is open, and
requires an explicit listener to actually display anything. Without one, a
successfully-delivered push is silently dropped with no error anywhere in the chain
(the sender sees success because the push *service* accepted it; nothing further is
sender-visible). This was a genuine implementation gap from Milestone F, not
introduced by the Worker pivot.

Fixed: added a `push` listener to `sw.js` that parses the JSON payload
(`{title, body}`, matching what `send-reminders.js` and the Worker's test path
already send) and calls `self.registration.showNotification(...)`, with a plain-text
fallback if JSON parsing fails. Bumped `CACHE_NAME` to `eclipse2026-v13`.

Not yet re-verified on-device — next step is another `test_send` workflow_dispatch
run (after the user reloads the app to pick up the new service worker) to confirm a
notification actually appears this time. Also still pending: user cleanup of the
`TEST-DELETE-ME` and two stale FCM entries in `subscriptions.json`.

**Follow-up:** user confirmed the fix — real push notification now displays
correctly, both with the app backgrounded and fully closed.

## Follow-ups: unsubscribe option + reminder timing confirmation

User confirmed the Day-7/-3/-1/day-of clock times (18:00/18:00/18:00/10:00 CEST) as
fine, no changes needed. Also asked for an unsubscribe option and raised the pending
layout redesign — agreed layout is a separate milestone (not folded into F or G), and
unsubscribe is an F follow-up.

**Unsubscribe implementation:**
- `cloudflare-worker/worker.js`: POST body now accepts an `unsubscribe` boolean;
  when true, the Worker deletes (rather than upserts) the subscriber's entry from
  `subscriptions.json`, reusing the same retry/backoff logic.
- `index.html`: refactored the GitHub-calling code into a shared `callWorker(...)`
  helper used by both `syncSubscription` and the new `unsubscribeFromPush()`.
  Captured the subscription's JSON *before* calling the browser's
  `sub.unsubscribe()` (rather than after), since a torn-down `PushSubscription`
  object's later `.toJSON()` behavior isn't something to rely on. Local
  unsubscribe (stopping delivery on this device) happens even if the Worker call
  fails, since that shouldn't depend on network availability.
- Reworked the "Enable notifications" button to reflect **actual push subscription
  state** (via `pushManager.getSubscription()`), not just `Notification.permission`
  — toggles between "Enable notifications" / "Disable notifications" accordingly.
  Also fixed the checklist-change handler and the on-load re-sync to check real
  subscription state the same way, so neither one accidentally re-subscribes a
  device that was deliberately unsubscribed (the old `Notification.permission ===
  "granted"` check couldn't tell the difference — permission and subscription are
  separate, independently-revocable things).

**Testing note:** attempted headless-Chrome mocking (matching the pattern used
successfully throughout Milestone F) but hit a real limitation — awaiting the real
`navigator.serviceWorker.ready` hangs indefinitely in this headless environment
(confirmed via bisection: execution stops exactly at that await, with `frame.load`
and basic DOM access both working fine beforehand). Every earlier successful mocked
test happened to avoid this exact path (always calling `syncSubscription` directly
with a hand-built fake subscription, never through `currentPushSubscription()`/
`subscribeToPush()`). Not worth reworking the app's code to make this path
dependency-injectable purely for headless testability — switched to live-testing
the actually-new logic (the Worker's delete path) directly via `curl` instead, which
has no such limitation.

**Process mistake, caught by the user:** asked the user to redeploy the Worker with
the updated code, but had only edited `cloudflare-worker/worker.js` locally in the
worktree — never committed/pushed it. The user correctly copied the still-old
version from GitHub, so the "redeploy" didn't include the fix. First live test
(`unsubscribe: true`) confirmed this: the resulting commit was titled "Sync push
subscription," not "Remove push subscription" — proving the old upsert-only code
was still running. Caught by checking actual git history rather than assuming
success. Committing and pushing properly now, before asking for another redeploy.

**Resolved.** Pushed the actual changes, user redeployed the Worker again — this
time a live test (`curl` with `unsubscribe: true`) produced the correct "Remove
push subscription (via Worker)" commit, and the test entry was confirmed gone from
`subscriptions.json`. User then confirmed on the real device: the button correctly
toggles to "Disable notifications" when subscribed, unsubscribing shows
"Unsubscribed ✓," and re-subscribing afterward works cleanly.

## Milestone H1 — Layout redesign, first piece (location header + modal)

User wants the 4-tab layout condensed to 2 (info + camera), designed incrementally
rather than all at once. First piece: moved the Coverage tab's content out of the
tab bar entirely, into a persistent header showing either "Location not set yet" or
the coverage summary, with "Set location" (opens a modal overlay containing the
existing geolocation/address-search/manual-entry controls) and "Clear location"
(wipes the stored location and resets the countdown to its placeholder) buttons.
Asked the user to choose modal-vs-full-screen for the picker before building (with
mockup previews) — modal overlay was the choice.

No errors encountered, but this was a large-enough restructure (moving markup out of
one panel into a new header + modal, removing a nav tab, removing several elements
whose JS references would otherwise throw on a null lookup) that it warranted
thorough verification before considering it done:
- Syntax-checked the inline script after every major edit.
- Headless-Chrome load test confirmed the new nav has exactly 3 tabs, the header
  correctly starts in the "not set" state, and the modal starts hidden.
- Headless-Chrome flow test (real page code, not reimplemented logic) drove the
  actual sequence: open modal → apply a location → confirms the modal auto-closes,
  the header switches to the coverage summary (88% for the Amsterdam test point,
  consistent with all earlier validation), and the countdown updates → clear →
  confirms it reverts to "not set," the countdown returns to the placeholder value,
  and `localStorage` is actually cleared → reopen modal → click the dimmed backdrop
  (not the content box) → confirms that closes it too.
- Found and removed now-dead code during the restructure: a `#changeLocationBtn`
  click handler and CSS rule referencing an element that no longer exists (would
  have thrown on `getElementById(...).addEventListener` at load time if left in —
  caught by the syntax/load checks before it ever reached the user).

Bumped `CACHE_NAME` to `eclipse2026-v15`. Further tab consolidation (toward the
final 2-tab layout) intentionally left for the next incremental step, per the
user's explicit one-at-a-time preference.

## Milestone H1 refinements + H2 — box styling, heading, generalize copy

User feedback on H1: wanted the location header styled as a box matching the
Countdown tab (was a full-width bar), an `<h2>Location</h2>` heading in the same
top-left position/style as "Countdown", and the placeholder text replaced by a real
description of the set location rather than just disappearing. Also asked to remove
the Netherlands-specific subtitle so the app works for other European countries too.

Implementation: restyled `#locationHeader` to match `.panel`'s box look (background/
border/border-radius/padding) without reusing the `.panel` class itself — that class
is tied to the tab-switching JS (`display:none` unless `.active`), which would have
made the location header disappear when switching tabs if reused directly. Merged
the two previous elements (`#locationNotSet` shown/hidden, "not set" text) into one
always-present `#locationDescription`, whose text is swapped rather than toggled.
Added `formatLocationLabel()`: uses `loc.label` verbatim when available (now passed
through from address-search results, which already have a `display_name`), falling
back to formatted coordinates for geolocation/manual entry, which don't have a name.

Removed the header subtitle entirely. Then asked the user whether to also generalize
the checklist tab's "partial eclipse in the Netherlands" wording while at it, rather
than silently leaving it inconsistent or unilaterally rewriting more than what was
explicitly requested — user confirmed, so updated that too ("partial eclipse from
most of Europe"). No functional/logic changes needed anywhere — the eclipse math
already worked for arbitrary locations (validated earlier with a France address
search test), this was purely user-facing copy.

No errors encountered. Verified via headless Chrome: heading text, initial
placeholder, address-label-path, and coordinate-fallback-path all confirmed correct
with the real page code (not reimplemented logic); subtitle removal confirmed via
DOM inspection; full-file syntax check passed. Bumped `CACHE_NAME` to
`eclipse2026-v16`.

## H1 follow-up — reverse geocoding for geolocation/manual entry

User feedback: geolocation and manual coordinate entry showed raw coordinates
("52.3676°, 4.9041°") in the location header, and asked whether resolving that to a
city/place name was possible. It was — same free Nominatim service already used for
forward address search, just its `/reverse` endpoint (coordinates in, place name
out), so no new dependency.

Added `reverseGeocodeLabel(lat, lon)`: calls Nominatim's `/reverse`, prefers a short
place name (`address.city`/`town`/`village`/`hamlet`/`suburb`) over the full
multi-part `display_name` (street, city, region, country, postcode), falling back
to that only if none of the shorter fields are present. Wired into `applyLocation()`: when a
location has no `label` yet (i.e. came from geolocation or manual entry, not address
search), the header shows the coordinate fallback immediately (no perceived delay,
since the lookup happens in the background) and upgrades to the resolved name once
the lookup completes — the resolved name is also saved back to `localStorage`, so a
later reload shows the name immediately without repeating the lookup. Deliberately
best-effort: a failed or slow lookup just leaves the coordinate fallback in place
rather than blocking location-setting on it.

Verified against the real Nominatim API (not mocked): `reverseGeocodeLabel(52.3676,
4.9041)` correctly returned "Amsterdam", `reverseGeocodeLabel(50.8514, 5.6910)`
correctly returned "Maastricht". Full `applyLocation()` flow test (manual-entry
style, no label) confirmed the two-stage behavior: showed coordinates immediately,
then "Amsterdam" ~1-2s later once the reverse lookup resolved, with the stored
location's `label` field updated to match. Bumped `CACHE_NAME` to `eclipse2026-v17`.

## H1 follow-up — location box moved out of the fixed header, into the Countdown tab

User feedback: the location box was living between the app `<header>` and `<main>`,
outside `main`'s `overflow-y:auto` scrollable area. Fine when it just said "Location
not set yet," but once a real location was set (coverage %, three time lines, two
buttons) that block became tall enough to occupy a large, permanently-visible
fraction of the viewport — and being outside the scrollable area, nothing (not even
scrolling) could move it aside, so it effectively covered the Countdown tab's own
content underneath. Asked the user whether it should repeat on all three tabs or
live on Countdown only (since that's the tab it's most tied to) — user chose
Countdown-only.

Moved the `#locationHeader` div from top-level markup (between `<header>` and
`<main>`) into `#panel-countdown`, immediately after that panel's own `<h2>Countdown</h2>`
— it's now ordinary scrollable content inside the tab, not a fixed element eating
space above it. Restyled it as a nested sub-box: `var(--bg)` background (distinct
from the panel's own `var(--panel)` background, so it still reads as a distinct
unit) with its own border, and changed its internal heading from `<h2>Location</h2>`
to `<h3>Location</h3>` — nesting inside a panel that already has an `<h2>Countdown</h2>`
meant two identically-styled `<h2>`s would have appeared stacked, which would have
read as two competing section titles rather than a heading + sub-heading.

No errors encountered. Verified via headless Chrome (real page code): confirmed
`#locationHeader`'s parent is now the `#panel-countdown` `<section>` (not a
top-level sibling of `<main>`), and re-ran the full set/apply/clear flow to confirm
nothing broke in the move — modal opens/closes correctly, `applyLocation()` still
populates the coverage summary correctly (88% for the Amsterdam test point, matching
all earlier validation), and clearing still resets the description text correctly.
Bumped `CACHE_NAME` to `eclipse2026-v18`.

## H1 correction — two separate boxes, not one nested inside the other

User rejected the nested sub-box from the previous step: "you integrated it into
the box in the tab...let's redo this a bit." The complaint wasn't about scrolling
(that part worked) — it was that Location read as a small sub-component *inside*
the Countdown box (h3 heading, nested styling) rather than as its own equal
section. Asked to clarify two ambiguous points before rebuilding: (1) what happens
to the ability to change/clear a location once set — user confirmed: same as
today, i.e. the same two buttons (Set location always visible, Clear location
visible once set), just repositioned; (2) whether to remove the debug time-jump
controls while restructuring — user chose to keep them for now.

Restructured `#panel-countdown` from a single `.panel` box into a `flex-column`
wrapper holding two separate `.info-box` boxes (Location, then Countdown), each
styled identically to how "Countdown" looked before (own `<h2>`, `var(--panel)`
background, border, radius, padding) — genuinely equal sections, not one nested in
the other. Achieved via an ID-specificity CSS override (`#panel-countdown` beats
`.panel` for background/border/padding/min-height) rather than touching the
tab-switching JS or `#panel-countdown`'s `class="panel active"` attribute — Checklist
and Camera tabs are completely unaffected, still plain single `.panel` boxes.

Location box: description (name or coordinates) right-aligned, coverage %
right-aligned (bold/yellow, matching the original centered treatment just
right-aligned now), "of the sun covered at maximum" right-aligned underneath,
Set/Clear buttons right-aligned below that (`justify-content:flex-end`).

Countdown box: shows "Location is not set" (right-aligned, grey) when no location
is set — the countdown clock and everything else is now hidden entirely rather
than showing a countdown to a placeholder date, which also fully resolves the
"remove the placeholder text" ask (deleted the disclaimer paragraph too, since
there's no longer a placeholder countdown for it to caveat). Once a location is
set: target label, clock, notify button, push-sync status, alert banners, then —
moved down to the very end per the user's request — the start/max/end times list
(previously part of the Location box).

**Edge case handled explicitly, not just carried over by accident:** a location
where the eclipse isn't visible at all (e.g. a location on the wrong side of the
Earth) has no valid `peakTimeUTC`/`firstContactUTC` to count down to. Rather than
letting `applyLocation()` fall through and leave stale state, added an explicit
branch: the Location box still shows "eclipse isn't visible from this location,"
but the Countdown box is explicitly kept/reset to its empty state (not shown with
garbage data).

Verified via headless Chrome, full state-transition test against the real page
code (not reimplemented logic): initial empty state → apply Amsterdam (visible
eclipse) confirms both boxes populate correctly, 88% matching all earlier
validation → clear confirms both boxes reset → apply Sydney, Australia (eclipse
not visible from there) confirms the Location box shows the "not visible" message
while the Countdown box correctly stays in its empty state rather than showing a
bogus countdown. Also re-confirmed tab switching between Countdown/Checklist/Camera
still works unaffected. Bumped `CACHE_NAME` to `eclipse2026-v19`.

## H1 correction #2 — alignment mistake (right instead of left) + two small cleanups

User caught the right-alignment immediately on the previous deploy: "damnit, I made
my usual right/left mix up... the text should obviously be aligned to the left."
Explicit rule given: all text in both boxes left-aligned, no exceptions except the
countdown clock itself, which stays centered as before. Also flagged two smaller
issues while reviewing: the Countdown box's target line duplicated the maximum
date/time (already shown in the times list right below it), and a "Built in
Milestone B" tag was still sitting in the Countdown box with no remaining purpose.

Flipped `text-align` from `right`/`center` to `left` on: `.countdown-target`
(predates this redesign, but explicitly covered by "no centered text" in the
Countdown box), `#locationBox .coverage-pct`, `#locationBox .coverage-sub`, and the
renamed `.tab-muted` class (was `.right-muted` — renamed since keeping a
now-inaccurate directional name would be a latent readability trap). Flipped
`.info-box-buttons`'s `justify-content` from `flex-end` to `flex-start`. Left the
countdown clock's `justify-content: center` untouched, per the explicit "I do want
the countdown timer centred as is." Simplified `targetLabel`'s text from a dynamic
string embedding the maximum date/time to a static "Counting down to the local
eclipse maximum." Removed the `<span class="placeholder-tag">Built in Milestone
B</span>` from the Countdown box (Checklist's/Camera's equivalent tags weren't
mentioned, left untouched — the ask was scoped to the Countdown box specifically).

Scoping note for future reference: interpreted "no right alignment, no centered
text" as covering the elements this and the prior redesign step introduced or
already touched (Location/Countdown box text), not a blanket app-wide
re-alignment — left `#notifyBtn`'s centering, `#pushSyncStatus`, and
`#alertBanners` untouched, since those predate this redesign round and weren't
flagged as wrong.

No errors encountered. Verified via headless Chrome against the real page code:
computed `text-align` confirmed `left` for `locationDescription`, `coveragePct`,
`coverageLabel`, and `countdownEmptyMsg`; computed `justify-content` confirmed
`center` for the clock (unchanged, correct) and `flex-start` for the button row;
confirmed `targetLabel`'s text reads exactly "Counting down to the local eclipse
maximum" with no embedded date; confirmed no `.placeholder-tag` element remains
inside `#countdownBox`. Bumped `CACHE_NAME` to `eclipse2026-v20`.

## Milestone E — Camera "find the sun" aid

Built `sun-position.js` (standalone module, Meeus ch. 25 low-precision solar
position — generic azimuth/altitude for any date/location, deliberately not
shared with the eclipse-specific Besselian math, per the plan's no-duplication
rule) and the Camera tab UI (safety copy, live preview, reticle + directional
arrows, numeric fallback, capture/download/share).

**Validation approach for `sun-position.js`:** couldn't get a usable reference
value from an interactive third-party solar-position calculator this session
(USNO's tool is form-only with no queryable URL; planetcalc.com's page didn't
document query parameters). Used well-established astronomical facts instead —
equinox declination = 0°, solstice declination = ±23.44° — and scanned each test
date/location for the sun's daily maximum altitude (which by definition occurs at
solar noon), checking it against `90° − |latitude − declination|`. Four checks:
equinox at lat 52.37°N (expect ~37.6°, got 37.58°), December solstice at the same
latitude (expect ~14.2°, got 14.20°), June solstice at Sydney/Southern Hemisphere
(expect ~32.7° AND azimuth ~0°/due north — this second part specifically catches
azimuth sign-convention bugs, got 32.69° and azimuth 0.2°), and equinox at the
equator (expect ~90°/zenith, got 89.86°, small deviation from 2-minute scan
resolution). All four passed closely, including the Southern Hemisphere sign
check, giving high confidence in the algorithm before wiring it into the UI.

**Testing the camera flow itself, and what I could/couldn't verify:**
- Real getUserMedia + Chrome's `--use-fake-device-for-media-stream` flag did not
  work reliably in this headless-new + virtual-time-budget combination (the
  promise never resolved within any tested budget) — abandoned rather than fight
  it further. Switched to mocking `navigator.mediaDevices.getUserMedia` to
  resolve with a real `canvas.captureStream()`-backed `MediaStream` (a genuine
  MediaStream instance, satisfies `video.srcObject`'s type-check, not a hand-rolled
  fake object) — this still exercises the app's actual code paths (state toggling,
  video wiring, capture-to-canvas, tab-switch cleanup), just substitutes the OS
  camera layer, which is the one part no local dev environment can meaningfully
  simulate anyway.
- Found and fixed two test-only issues before trusting the results: `captureStream(0)`
  (zero fps) never delivered real frame data to the video element in headless mode —
  switched to `captureStream()` (continuous real framerate) — and `canvas.toBlob()`
  needed a much longer wait (3s, not 500ms) to resolve in this software-rendered
  environment. Neither was an app bug, both were test-harness tuning.
- Confirmed via the real app code: camera starts and wires `video.srcObject`
  correctly; the aim-guidance numeric fallback renders real, sensible text (e.g.
  "Point your phone toward SSE (azimuth 152°), 57° above the horizon" — matches
  the compass-point-name/azimuth/altitude actually computed); capture produces a
  real blob URL and correctly hides the live preview during review; retake
  correctly restores the preview; switching tabs away from Camera correctly stops
  the underlying MediaStream track (`readyState` transitions from `live` to
  `ended`).
- **Could not test on this machine, flagged for on-device verification (same
  pattern as prior hardware-dependent pieces in this project):** the actual
  `DeviceOrientationEvent` compass/tilt behavior — no synthetic orientation events
  in headless Chrome, and no Android hardware available in this session. The
  heading-inversion formula (`(360 - alpha) % 360`) and the beta-to-altitude
  mapping are implemented per well-documented, widely-cited conventions and
  explained in code comments, but are explicitly best-effort approximations for a
  directional aid, not independently re-derived/re-verified against a real device
  here — the numeric fallback is always shown alongside the compass-driven arrows
  as an authoritative cross-check specifically because of this uncertainty.

**Real bug found and fixed via testing, not shipped:** `applyLocation()` — which
runs automatically on page load whenever a location is already stored (i.e., for
any returning user) — was updated to also refresh Camera-tab state
(`refreshCameraTabState()`, referencing `const`s declared near the very end of the
script). The auto-load trigger itself sat much earlier in the file (right after the
manual-location-entry handler), so on a fresh script execution with a location
already in `localStorage`, calling into `refreshCameraTabState()` would hit those
not-yet-initialized `const`s — a "cannot access before initialization" crash on
literally every page load for a returning user. Caught by explicitly testing the
returning-user scenario (fresh iframe load with a location pre-saved to shared
localStorage), not just the empty-state case that earlier milestones' tests had
covered — confirmed the crash happened, then confirmed the fix (moving the
auto-load trigger to the very end of the script, after every section's `const`s are
declared) resolved it cleanly with no behavior change otherwise.

Added `sun-position.js` to the service worker's precache list, bumped `CACHE_NAME`
to `eclipse2026-v21`.

## Milestone E follow-up — replace in-app capture with native camera app handoff

User confirmed the whole flow works on-device (camera, aiming arrows, compass,
capture, download/share) but flagged a real gap: no access to their phone's normal
camera controls (exposure, focus, zoom, shooting modes/themes) compared to using
their native camera app directly.

Researched what's actually achievable before proposing anything: exposure
compensation and basic focus mode ARE exposed to the web via
`MediaStreamTrack.applyConstraints()` on some Android Chrome/device combinations,
but support is inconsistent and unverifiable without testing on the specific
device; zoom was already out of scope per the plan; and camera app "themes"/shooting
modes are not reachable from any web API at all — a hard platform boundary, not an
effort/scope question. Laid this out for the user rather than silently picking an
approach, since part of the ask was flatly impossible and the rest was
partial/unverified at best.

User chose to drop in-app capture entirely and have this tab hand off to the
native camera app once aimed. Implementation: replaced the whole
canvas-capture/download/share/retake flow with a single
`<input type="file" accept="image/*" capture="environment">` — a standard,
well-supported HTML mechanism (not a fragile custom `intent://` URL scheme, which
was the first approach considered and explicitly rejected after research showed it
un/under-documented for this exact use case) that launches the phone's actual
native camera app on Android Chrome, with every one of its normal controls intact.
The live `getUserMedia` preview and the reticle/arrow aiming guidance stay exactly
as built — the tab's remaining job is purely "point here," and the native app now
fully owns the actual photo.

No errors encountered. Verified via headless Chrome against the real page code:
confirmed the old capture elements (`captureBtn`, `captureResult`) no longer exist
in the DOM; confirmed the new file input has the correct
`accept="image/*" capture="environment"` attributes; re-confirmed the camera
preview, numeric aim-guidance fallback, and tab-switch-stops-the-stream behavior
all still work exactly as before (same mocked-`MediaStream` technique as the
original Milestone E test); simulated the file input's `change` event (as if the
native camera app had returned) and confirmed the "Photo saved — check your
gallery" confirmation text renders correctly. Bumped `CACHE_NAME` to
`eclipse2026-v22`.

**Process note:** during this work, the user flagged that earlier `taskkill //F
//IM chrome.exe` cleanup calls in this session had been killing the user's own,
real Chrome windows — not just the headless test instances, since that command
kills every Chrome process on the machine by name, unscoped to what this session
actually started. All headless test browsing itself was already isolated via a
dedicated `--user-data-dir` per invocation (never touching the user's real
profile/history/logins), but the blanket-kill cleanup habit was a separate,
real problem, confirmed by the user to have closed their browser windows on at
least two occasions. Fixed going forward: only kill specific PIDs this session
itself started (found via `netstat`/the background job's own PID), never a
blanket `taskkill //F //IM chrome.exe` — and in practice, `--dump-dom` Chrome
instances exit on their own once they've produced output, so most of the time no
explicit kill is even needed.

## Milestone G1 — scope simplification: no live-GPS test needed

Before diving into the full dry-run plan, user pointed out the "verify T-30/T-5
alerts work from a live GPS fix" item didn't actually need separate testing: those
alerts are derived from whatever location is already saved (via any method — geo,
address search, or manual entry) at the time `applyLocation()` last ran, not from a
continuous/live GPS stream at the exact moment of the eclipse. The real
requirement is simply "have a location set in the app before the event," which is
a reminder/checklist concern, not a technical gap needing hardware-in-the-loop
testing. Dropped that test item from G's plan entirely.

Acted on the implication directly: added a location-set hint to the day-of
reminder's message text (`.github/scripts/send-reminders.js`), and reworded the
existing `knowStartTime` checklist item to be an explicit, actionable step ("set
your location in the app") rather than the vaguer "know your start time" —
deliberately kept the same `id` so this doesn't reset anyone's already-checked
state in `localStorage` on a device that had ticked the old version of this item.
Also fixed a stale reference to "the Coverage tab" in that same item's label — a
leftover from the Milestone H1 redesign that moved coverage out of its own tab
into the Countdown tab's Location box.

No errors encountered. Verified via headless Chrome: checklist item renders with
the updated text, no console errors. Bumped `CACHE_NAME` to `eclipse2026-v23`.

## Milestone G2 — safe dry-run testing closes the deferred Day-3 conditional check

Added `dry_run` + `simulate_date` workflow_dispatch inputs to
`send-reminders.yml`/`send-reminders.js`. When `dry_run=true`, the script runs the
real date/condition logic (optionally against a `simulate_date` override instead of
the real current date) but never calls `webpush.sendNotification` and never writes
`subscriptions.json`/`sent-log.json` — it only logs what it would have done. This
was the key missing piece from Milestone F: testing Day-3's checklist-conditional
skip specifically required pretending "today" is on/after Aug 9, which couldn't be
done safely against the real reminder state without this mode (a real, non-dry-run
test would have permanently marked reminders as sent in `sent-log.json` ahead of
their actual dates).

To exercise both branches of the Day-3 conditional in one pass, added a synthetic
test subscription (`https://example.com/DRYRUN-COMPLETE-TEST`) with
`checklistComplete: true` via the Cloudflare Worker (same pattern as all earlier
test entries), alongside the existing real/test entries which all had
`checklistComplete: false`. Had the user trigger `workflow_dispatch` with
`simulate_date=2026-08-12` (deliberately the LAST reminder date, so all four —
Day-7/-3/-1/day-of — show as simultaneously due in one run rather than needing four
separate runs).

**Result — fully confirms the previously-deferred check:** every subscriber with
`checklistComplete: false` correctly logged "would SEND day3"; the one synthetic
`checklistComplete: true` entry correctly logged "would SKIP day3 (checklist
already complete)"; Day-7/-1/day-of all correctly logged "would SEND" for every
subscriber once their respective dates were reached. Summary line: "Checked 9
subscriber(s): sent=35 skippedComplete=1 removedExpired=0" — exactly matching
expectations (8 subscribers × 4 reminders = 32, plus the 9th subscriber getting 3
sends + 1 skip = 35 sends + 1 skip = 36 total evaluations).

Verified the dry run's core safety promise held: fetched `sent-log.json` directly
after the run and confirmed every entry was still `{}` (completely untouched) —
the mechanism genuinely made zero real changes despite exercising the full real
code path. Removed the synthetic test entry afterward via the Worker's delete
path, confirmed it was gone.

This closes the Day-3 checklist-conditional-skip gap flagged back in F5b as
deliberately deferred rather than risked at the time. Two cosmetic leftovers still
sitting in `subscriptions.json` (`TEST-DELETE-ME`, `UNSUB-TEST`) — not blocking,
user can clean up via GitHub's web editor whenever convenient.

User asked to confirm no push notification should have arrived on their phone from
this dry run — correctly confirmed: `dry_run=true` never calls
`webpush.sendNotification()` at all, every "would SEND"/"would SKIP" line is purely
a `console.log`, unlike `test_send=true` (used in Milestone F) which does send a
real push. No notification arriving was the expected, correct outcome.

## Milestone G4 — GitHub's 60-day scheduled-workflow auto-disable risk

Researched the actual policy rather than assume the worst case: GitHub disables
scheduled workflows in a public repo after 60 *consecutive days with no commits*
specifically (not any repository activity — issues/PRs/tags don't count, only
commits reset the clock). Assessed the real risk for this specific event rather
than reflexively adding a mitigation: Aug 12 is under 30 days from today, well
inside the 60-day window from the commits already being made this session, and
the app itself commits automatically (subscription re-sync via the Cloudflare
Worker) whenever anyone opens it with an existing push subscription — meaning
ordinary use during the Day-7/-3/-1 reminder window likely keeps the clock reset
without any dedicated mechanism. Presented this assessment plus the standard
mitigation (a monthly no-op "keepalive" commit workflow) to the user rather than
unilaterally deciding either way; user chose to skip adding it, given the short
timeline makes the natural commit cadence sufficient. Flagged as a known, assessed,
low-probability risk in CLAUDE.md rather than either ignored or over-engineered.

## Milestone G3 — final offline/installed PWA re-check

Attempted a headless-Chrome verification of the service worker's Cache Storage
contents first (register `sw.js`, await `navigator.serviceWorker.ready`, list what
actually landed in the cache). Hit the exact same known limitation documented
earlier in this project during H1's unsubscribe-button testing:
`navigator.serviceWorker.ready` hangs indefinitely in this headless environment —
confirmed again here (registration itself resolved, but awaiting `.ready` never
did, even at a 15-second virtual-time-budget). Recognized this as a previously-
identified tooling limitation rather than re-investigating it a second time, and
relied instead on direct code review: cross-checked `sw.js`'s `CORE_ASSETS`
precache list against every file `index.html` and `manifest.json` actually
reference (`<link>`/`<script src>` tags, manifest icon paths) — confirmed complete,
nothing missing.

Real, authoritative confirmation came from the user directly, which is the
intended final check for this milestone anyway: fully closed the app, enabled
airplane mode, reopened from the home-screen icon — countdown, location/coverage,
checklist, and camera tab all loaded and displayed correctly with no network
connection.

**Milestone G (G1–G4) is now complete.** All four sub-items closed: scope
simplified (no live-GPS test needed), the previously-deferred Day-3 checklist-
conditional skip fully verified via safe dry-run testing (both branches), the
60-day GitHub Actions inactivity risk assessed and consciously accepted rather
than over-engineered, and a final real-device offline/installed check passed.

## Post-Milestone-G QA pass — two real fixes from an independent review

An external QA pass over the live, deployed repo (reading actual files, not just
docs) found two issues, both verified directly against the real repo before fixing.

**1. Leftover test entries would have caused a recurring production error.**
Confirmed via direct API check: `subscriptions.json` still had
`https://example.com/TEST-DELETE-ME` and `https://example.com/UNSUB-TEST` mixed in
with the 6 real FCM subscriptions (matching entries also present in
`sent-log.json`). The QA finding was sharper than the "cosmetic, not blocking" note
these had carried since Milestone F: once Day-7 goes live (2026-08-05),
`send-reminders.js` would call `webpush.sendNotification()` against these fake
endpoints on every run, and since `example.com` won't return the 404/410 status the
script's auto-cleanup path checks for, they'd fail and log an error indefinitely
instead of self-cleaning like a real expired subscription would. Removed both from
`subscriptions.json` via the Cloudflare Worker (confirmed via API: down to exactly
6 real entries, no test data). Matching `sent-log.json` entries still need manual
removal — the Worker's write path only touches `subscriptions.json` by design (the
whole point of giving up a raw GitHub PAT in the earlier architecture pivot was
narrowing the client's/Worker's blast radius to that one file/operation), so this
needs the user to edit `sent-log.json` directly via GitHub's web UI.

**2. No conflict/retry handling on the reminder workflow's git push.** Confirmed
the actual risk by reading `cloudflare-worker/worker.js` and
`.github/workflows/send-reminders.yml` side by side: the Worker commits to
`subscriptions.json` independently of the scheduled workflow (any
subscribe/unsubscribe/checklist-change), with its own retry-on-409 logic — but the
workflow's final `git pull --rebase && git push` had no equivalent handling. A
Worker-triggered commit landing in that window could make the plain rebase+push
fail outright, losing that run's `sent-log.json` update and risking a duplicate
send on the next scheduled run — directly undercutting the catch-up design's
"never send twice" goal.

Fixed with a 3-attempt retry loop (same backoff shape as the Worker's own retry
logic: 2s/4s-style increasing delays), with `git rebase --abort` between attempts
(a failed rebase leaves the tree mid-conflict; without cleaning that up, the next
retry would just fail immediately on "rebase already in progress" rather than
attempting a fresh pull) and a loud `::error::` + `exit 1` on final failure, per
the explicit instruction not to silently swallow a failed state-commit.

**Validated with a real local git sandbox, not just a syntax/YAML check** (bare
repo + two clones simulating the workflow's checkout and a concurrent Worker
commit):
- First attempt used single-line minified JSON for the test files and produced a
  spurious conflict even for non-overlapping key edits — caught this as a mistake
  in the *test setup*, not the real logic: both the Worker and the script actually
  write pretty-printed, one-key-per-line JSON (`JSON.stringify(obj, null, 2)`), so
  the test wasn't representative. Redid it with matching formatting.
- Realistic scenario (workflow removes one subscriber; Worker concurrently edits a
  *different* subscriber): rebased and pushed cleanly on the **first** attempt —
  with real one-key-per-line formatting, non-overlapping edits land on different
  lines and don't conflict at the git level at all. Confirmed the merged result
  correctly reflected both changes.
- Genuine-conflict scenario (both writers edit the *same* subscriber's entry):
  confirmed the retry loop correctly fails all 3 attempts (retrying can't fix a
  real content conflict), and — critically — confirmed the working tree was left
  completely clean afterward (no `.git/rebase-merge` marker, empty `git status`),
  meaning the `rebase --abort` cleanup works correctly and the real workflow would
  surface this as a failed run rather than hanging or leaving corrupted local state.

Everything else the QA pass checked (Milestone E's TDZ fix, the `sw.js` push/
notificationclick listeners, `sun-position.js`'s math) came back clean — no changes
needed there.

**Resolved.** User removed the matching two entries from `sent-log.json` directly
via GitHub's web editor. Verified via direct API fetch: `subscriptions.json` has
exactly 6 real FCM subscribers, `sent-log.json` has 5 (the 6th subscriber simply
hasn't been through a real, non-dry-run reminder check yet, so has no entry there
— expected, not a discrepancy). Both files fully clean of test data, well ahead of
the Day-7 reminder's real Aug 5 activation.

## Milestone H3 — consolidate to 2 tabs, hide debug, collapsible checklist

User asked for a clean-up pass: hide (comment out, don't delete) the debug
time-jump controls; move the Safety checklist into the Countdown/Overview tab as
its own box at the bottom, matching the Location/Countdown box style, without
carrying over the "Built in Milestone D" tag or the `// ---- Safety checklist
(Milestone D) ----` comment; make the checklist collapsible so all three boxes fit
on one screen without scrolling; remove the now-empty Checklist tab; rename the
"Countdown" tab label to "Overview."

Implementation: moved the whole checklist section (warning banner, progress line,
item list) from its own `<section class="panel" id="panel-checklist">` into
`#panel-countdown`, as a third `.info-box` sibling after `#locationBox`/
`#countdownBox`. Used a native `<details class="info-box collapsible-box">` rather
than a custom JS-driven toggle — collapsed by default (`open` attribute omitted),
with `<summary><h2>Safety checklist</h2></summary>` as the tap target (WHATWG HTML
explicitly permits a single heading element as `<summary>`'s content, so this is
spec-conformant, not a hack). Added a small custom chevron indicator
(`::after` content, rotates 90° via the `[open]` selector) and hid the native
disclosure marker (`list-style:none` + `::-webkit-details-marker` for
cross-browser coverage), so it reads as "tap the heading to expand" rather than a
generic browser `<details>` look. Tightened checklist row/gap/font spacing
slightly to keep the *expanded* view compact too, not just rely on
collapsed-by-default for the "fits on one screen" goal.

Removed `<section id="panel-checklist">` and its nav button entirely. Renamed the
first nav button's visible text from "Countdown" to "Overview" — deliberately left
every internal ID (`panel-countdown`, `countdownBox`, etc.) untouched, since
renaming those would mean updating dozens of JS references for a change that's
purely a user-facing label; the individual "Countdown" box inside the Overview tab
keeps its own "Countdown" heading, since that box is still specifically about the
countdown itself. Fixed two now-stale references while in here: a checklist item's
label said "(Countdown tab)" (now "(Overview tab)"), and a CSS comment describing
"two separate boxes" (now three).

Debug controls: commented out both the HTML block (`<details class="debug">...`)
and its JS wiring (`debugJumpTo` + the four `addEventListener` calls) — not
deleted, per the explicit request to keep them available for quick re-testing
later, with an inline note on what to uncomment together to bring it back
(the HTML and JS halves are independent; uncommenting only one would either leave
dead buttons with no handlers, or throw on `document.getElementById(...).addEventListener`
against elements that no longer exist in the DOM).

No errors encountered. Verified via headless Chrome against the real page code:
nav now has exactly 2 tabs, first one reads "Overview"; confirmed
`document.getElementById("dbgT31")` returns `null` and `typeof debugJumpTo` is
`"undefined"` (i.e., genuinely inert, not just visually hidden — the commenting-out
actually worked, this wasn't just a CSS `display:none`); confirmed `#checklistBox`
is a real `<details>` element, closed by default, and correctly toggles `open` on
demand; confirmed all 6 checklist checkboxes still render with correct label text
(including the updated "Overview tab" wording) and `isChecklistComplete()` still
functions correctly after a checkbox change; confirmed the three boxes'
DOM order inside the Overview tab is Location → Countdown → Checklist as intended.
Bumped `CACHE_NAME` to `eclipse2026-v24`.

## H3 follow-up — tighten Overview tab spacing

After confirming H3 on-device, user reported the collapsed Safety checklist still
required scrolling to see, and asked for reduced top/bottom spacing on all the
boxes to fix it. Reported the current values first (per their request), then on
approval: `.info-box` padding 1.25rem → 0.9rem/1.1rem; gap between the three boxes
1rem → 0.65rem; `main`'s top padding 1rem → 0.75rem; `.info-box h2` margin changed
from `margin-top: 0` to `margin: 0` (removing the default browser bottom margin
under each heading).

No errors encountered — checked before removing the h2 bottom margin that the
element immediately following each heading (`.tab-muted`, `.checklist-warning`)
already carries its own small top margin, so headings wouldn't visually collide
with the content below them. Verified via a headless-Chrome DOM render (no JS
errors) and user confirmed on-device that the checklist now fits without
scrolling. Bumped `CACHE_NAME` to `eclipse2026-v25`.

## Milestone I1 — Overview tab landscape layout

User asked for a landscape mode; a scoping question clarified they wanted a real
two-column redesign for both tabs, not just a non-breaking reflow. This entry
covers the manifest change (applies to both tabs) plus the Overview tab half
(I1) — Camera tab (I2) is a separate, not-yet-started step.

Changed `manifest.json`'s `"orientation"` from `"portrait"` to `"any"` — required
before any landscape CSS could take effect on an installed (home-screen) PWA
instance, since the manifest lock overrides physical device rotation entirely.

Added a `@media (orientation: landscape)` block switching `#panel-countdown.active`
from `flex-direction: column` to `display: grid; grid-template-columns: 1fr 1fr`.
Location and Countdown land in the two columns via default grid auto-placement
(no explicit `grid-column` needed for either) since they're the first two children;
the Safety checklist gets `grid-column: 1 / -1` (matched via its existing
`.collapsible-box` class, so no new selector/class was needed) to stay a
full-width row underneath. Pure CSS, no HTML or JS changes — the tab-switching
logic, checklist state, and countdown engine were not touched.

No errors encountered. Verified via headless Chrome screenshots at landscape
phone window dimensions: 812×375 confirmed Location and Countdown render side by
side; 812×700 (taller, to see content below the fold) confirmed the Safety
checklist renders as a full-width collapsed row beneath both, with correct nav
bar layout underneath. Bumped `CACHE_NAME` to `eclipse2026-v26`.

**On-device gotcha (not a code bug):** after deploying v26, the installed
home-screen app still wouldn't rotate. Root cause: Android's installed-app
wrapper (WebAPK) snapshots `manifest.json` at install time and doesn't
necessarily re-read a changed `orientation` field on a simple reopen — the
service worker's cache-busting (`CACHE_NAME` bump) only affects what's served
*inside* the app, not the WebAPK shell's own copy of the manifest, which Android
manages separately. Confirmed device auto-rotate was already enabled (ruled out
first) and confirmed this was the installed app, not a browser tab. **Resolved**
by the user removing the app from the home screen and reinstalling it — rotation
now works correctly. Not logged as a recurring-pattern candidate yet (first
occurrence), but worth remembering: any future manifest.json change that affects
installed-app behavior (orientation, display mode, etc.) may need a reinstall to
verify on-device, not just a reopen.

## Milestone I2 — Camera tab landscape layout, plus a real bug caught while testing

Second half of landscape mode: video preview moves to one side of the Camera tab
(spans the full column height via repeated `grid-template-areas` naming) with the
warning text, status line, and controls stacked in a column next to it. Preview
`aspect-ratio` changed from the portrait `3/4` to a landscape-shaped `4/3`.

**Real bug, caught before shipping:** built a throwaway test copy of `index.html`
(copied to the job's tmp dir, never touching the tracked file) to screenshot the
Camera tab at landscape headless-Chrome window dimensions. First screenshot showed
no grid at all — `#cameraContent` was still in plain block flow, warning text
running full width instead of sitting beside the video preview. Root cause:
`refreshCameraTabState()` (the function that shows/hides `#cameraLocationEmpty`
vs `#cameraContent` depending on whether a location is set) toggles visibility via
`element.style.display = ...`, an **inline** style — which always wins over an
external stylesheet rule regardless of specificity or media query. The landscape
`@media` block's `display: grid` on `#cameraContent` could therefore never have
taken effect at all, in any orientation, once JS set an inline `display` value.
Not a landscape-specific bug per se — nothing before this needed `#cameraContent`'s
`display` to be anything other than block-vs-none, so it went unnoticed until this
change needed a non-default `display` value to win.

**Fixed** by switching `cameraLocationEmpty`/`cameraContent`'s visibility toggle
from inline `style.display` to a new `.hidden { display: none; }` utility class,
applied/removed via `classList.toggle` instead of setting `.style.display`
directly — this way nothing inline-overrides the media query's `display: grid`
once the `.hidden` class is removed. Re-verified via the same headless-screenshot
approach (had to also patch the JS toggle in the throwaway test copy to force
`cameraContent` visible, since a fresh browser profile has no stored location):
confirmed video preview + reticle render on the left, spanning the full height of
that column, with warning/status/controls correctly stacked on the right.

Also picked up a small item the user flagged while confirming I1 on-device:
`#pushSyncStatus` ("Synced ✓" etc.) previously sat under the notify button
permanently. `setPushSyncStatus()` now clears it after 5 seconds — cancels any
previously pending clear first, so a fast-following message isn't wiped early by
an older scheduled clear meant for the message it replaced.

Bumped `CACHE_NAME` to `eclipse2026-v27`.

## I2 follow-up — collapsible warning, shrink the landscape preview

After confirming I2 on-device, user asked for the Camera tab's safety warning to
become collapsible in both orientations (short "Warning" header, open by
default), and for the landscape preview specifically to shrink so it fits on
screen without scrolling while actively aiming.

Warning: converted `#cameraWarning` from a plain `<p class="checklist-warning">`
into `<details class="checklist-warning collapsible-box" open><summary>Warning</summary>...`
— reused the existing `.collapsible-box` class for the chevron/cursor/marker-hiding
mechanics (same pattern as the Safety checklist box already uses), added one small
new rule for the header's boldness (`.checklist-warning summary { font-weight: 700; }`,
since there's no `<h2>` here) and a margin reset for the now-nested `<p>`.

Preview sizing: previous `aspect-ratio: 4/3` computed *height* from a fixed-fraction
*width* (`1.2fr` grid column) — on a wide landscape viewport this produced a box
taller than the screen, exactly the complaint. Flipped the direction: set an
explicit `height: 36vh` with `width: auto`, so `aspect-ratio` now derives width
from that capped height instead. Changed the grid column from `1.2fr` to `auto`
to match (shrinks to the preview's now height-driven width rather than stretching
it). Also reclaimed some general vertical padding in landscape: `main`'s bottom
nav-clearance padding 5.5rem → 4.5rem (checked against the nav's actual rendered
height first — button padding + icon + label ≈ 55-65px, so 4.5rem/72px still
leaves comfortable headroom), and Camera panel's own padding tightened to match
the Overview tab's boxes (1.25rem → 0.9rem/1.1rem).

No errors encountered. Verified via headless-Chrome screenshots using a throwaway
test copy (same approach as I2): at a realistic landscape height (800×400) the
preview, collapsed warning, and both buttons all fit with no scrolling required;
at a deliberately extreme height (800×360) it fits with the warning collapsed,
and is only slightly short with the warning left open — expected, and exactly the
scenario the collapse option exists for. Re-checked the Overview tab afterward to
confirm the shared `main`/nav padding change didn't regress its landscape layout
from Milestone I1 — still renders correctly. Bumped `CACHE_NAME` to
`eclipse2026-v28`.

## I2 follow-up #2 — enlarge the landscape preview ~10%

User found the just-shrunk landscape preview a bit too small and asked for roughly
a 10% increase. `#cameraPreviewWrap`'s capped `height` changed from `36vh` to
`40vh` (a 4-point vh bump, ~11% relative increase). No errors encountered.
Re-verified via the same headless-screenshot approach at a realistic landscape
size (800×400, warning collapsed): preview, warning, and both buttons still all
fit with no scrolling. Bumped `CACHE_NAME` to `eclipse2026-v29`.

## Milestone J — max-screen aiming overlay, real native camera app launch

Two requests: (1) a fullscreen "max screen" view of the aiming preview, with its
own Close and Open-camera-app buttons; (2) fix "Open camera app" opening a
stripped-down capture UI instead of the phone's actual full Camera app (all
shooting modes, video toggle, no forced confirm-per-shot).

**Open camera app:** replaced `<input type="file" accept="image/*"
capture="environment">` (a single-result capture contract — that's *why* it could
only ever show a minimal UI and had to return after one shot, regardless of which
app answered it) with a plain link to
`intent://#Intent;action=android.media.action.STILL_IMAGE_CAMERA;end` — an Android
intent that just launches the Camera app in the foreground (same as a home-screen
shortcut), with no result expected back. Removed the now-pointless
`openCameraAppInput` `change` listener (there's no file to receive anymore) and
reworded `#cameraAppStatus` from a dynamic "Photo saved" message (which required
that returned-file event) to a static explanation of the new behavior. **Not
testable in this dev environment** — no real Android device or Chrome-for-Android
intent resolution available here; this needs on-device confirmation.

**Max-screen overlay:** added `#maxScreenBtn` (bottom-right of the preview, shown
only once the camera stream is running) and a body-level
`#cameraFullscreenOverlay` (own Close + Open-camera-app buttons). Opening it
reparents the *existing* `<video>` and its aim overlay into the fullscreen
container via `appendChild` — no second `getUserMedia` call — and reparents them
back on close; moving a live media element within the same document doesn't
interrupt playback. Wired into `stopCameraStream()` so leaving the Camera tab
also closes the overlay if it was left open.

**Real bug, caught twice, same root cause:** a headless test checking the overlay
was hidden by default found it wasn't — `#cameraFullscreenOverlay`'s own
`display: flex` rule (ID selector) has higher specificity than the shared
`.hidden { display: none }` utility class (class selector), so `.hidden` could
never actually win regardless of source order. That prompted checking whether
the *other* place introduced an ID-scoped `display` rule had the same flaw:
Milestone I2's landscape `#cameraContent { display: grid }` did too — meaning
that, in landscape, with no location set, the Camera tab would have incorrectly
rendered as a visible grid instead of staying hidden. This had shipped in v27-v29
undetected, because every landscape test so far deliberately forced the element
visible to check the grid layout itself, never exercising the "should be hidden"
path. Fixed both by changing the ID rule to a compound `#id:not(.hidden)`
selector — since `.hidden` and `:not(.hidden)` can never both match the same
element at once, there's no specificity contest to lose in the first place.

Verified via a throwaway test copy scripted to check `getBoundingClientRect`/
`getComputedStyle`/`classList` directly (simulated a click on `#maxScreenBtn` then
`#fullscreenCloseBtn` and inspected state at each step) rather than screenshots
for this specific check — while building it, discovered this sandbox's headless
Chrome doesn't render at the exact `--window-size` requested (`412×900` requested,
laid out at `478×802` internally, then the screenshot capture clipped to
`412×900` pixels rather than scaling to match), which makes pixel-position
screenshot comparisons unreliable for exact-edge positioning specifically. Noting
this for future sessions: prefer scripted rect/computed-style checks over
screenshot pixel-cropping when verifying exact element positioning in this
environment; screenshots are still fine for overall layout/visibility checks,
which aren't sensitive to this discrepancy. Bumped `CACHE_NAME` to
`eclipse2026-v30`.

## Milestone J follow-up — button color regression, intent link not opening

On-device testing of v30 found two problems.

**Real bug: "Open camera app" wasn't yellow anymore.** Root cause: when this
button moved from `#openCameraAppLabel` (an ID) to `.open-camera-app-btn` (a
class, so it could be shared between the main controls and the fullscreen
overlay), its effective specificity dropped below `.info-box-buttons a`'s —
that selector is a class *and* a type selector (`a`), specificity (0,1,1), which
beats a single class alone (0,1,0) regardless of which rule appears later in the
file. An ID never has this problem (it outranks any class/type combination
automatically), which is exactly why the original never needed to worry about
this. Fixed by nesting the class under its container instead:
`.info-box-buttons .open-camera-app-btn` (two classes, (0,2,0), which does beat
(0,1,1)). Added a matching `#fullscreenCloseBtn` rule (ID, no specificity issue)
so both max-screen buttons are accent-yellow as requested. Verified via a
computed-style check (`getComputedStyle(...).backgroundColor`) confirming both
now resolve to `rgb(255, 196, 87)` (`--accent`), not `--bg`.

**"Open camera app" not opening the camera app on-device.** Likely cause: the
`intent://#Intent;...;end` URI had an *empty* authority (nothing between `://`
and the `#Intent;` fragment) — every real, documented-working intent-URI example
found during research includes a non-empty host/path segment there (e.g.
`intent://scan/#Intent;...`), suggesting Chrome may reject or silently ignore
the empty-authority form. Added a placeholder path segment:
`intent://open/#Intent;action=android.media.action.STILL_IMAGE_CAMERA;end` — the
literal "open/" text is never used for anything (the `action=` parameter alone
drives which app/activity actually handles it), it only exists to make the URI
syntactically well-formed. **Still unverified** — this is a best-guess fix for a
problem only reproducible on a real device, which isn't available in this dev
environment. If this attempt still doesn't work on-device, the next hypothesis
is that the installed PWA's WebAPK wrapper blocks/ignores non-http(s) scheme
navigation entirely (a platform-level restriction, not a syntax fix) — in that
case the fallback is reverting to the previously-confirmed-working file-input
`capture` mechanism from Milestone E, accepting its single-shot-UI limitation.
Bumped `CACHE_NAME` to `eclipse2026-v31`.

## Milestone J follow-up #2 — v31 confirmed: still not launching

User confirmed on-device: adding a path segment didn't fix it either. Per the
plan already agreed with the user (try one more quick variant before reverting),
tried the shorter canonical form without the `//` authority separator at all —
`intent:#Intent;action=android.media.action.STILL_IMAGE_CAMERA;end` instead of
`intent://open/#Intent;...`. Both forms appear in different real-world references,
so this is a second reasonable guess, not a confirmed root-cause fix. If this
also fails on-device, the agreed next step is reverting to the file-input
`capture` mechanism (Milestone E) rather than continuing to guess at intent-URI
syntax variants blind. Bumped `CACHE_NAME` to `eclipse2026-v32`.

## Milestone J follow-up #3 — v32 confirmed: still not launching, reverted

User confirmed on-device: the `intent:` (no `//`) form still didn't launch
anything either. Two different syntactically-valid intent-URI forms both
failing strongly points to a platform-level restriction (most likely: an
installed PWA's WebAPK wrapper blocking navigation to non-http(s) schemes
entirely) rather than a syntax mistake — not something fixable by further
guessing at URL variants from this environment.

Per the fallback already agreed with the user, reverted "Open camera app" back
to Milestone E's original mechanism: a single hidden
`<input type="file" id="openCameraAppInput" accept="image/*"
capture="environment">`, triggered by a `<label for="openCameraAppInput">` —
now two separate labels (main controls row, and the max-screen overlay) pointing
at the *same* shared input via `for`, since a label's `for` attribute works
regardless of the label's own position in the DOM. Restored the `change`
listener and its "Photo saved…" status message, and removed the now-inaccurate
"full experience" explanatory copy added when this button briefly used the
intent-link approach. Net effect: back to the exact behavior confirmed working
on-device before Milestone J started (single-shot capture UI, not the full
native app) — the "full app" ask (multi-shot, mode switching, no confirm step)
remains unresolved, blocked by what looks like a platform restriction rather
than something in this app's own code. Verified via a headless DOM/error check
(no JS errors; both labels and the shared input all present and correctly
wired) — the actual capture behavior itself was already confirmed working
on-device back in Milestone E, so wasn't re-tested live here. Bumped
`CACHE_NAME` to `eclipse2026-v33`.

## Milestone J follow-up #4 — v33 confirmed still not working; added a version tag

User confirmed on-device, after a full close-and-reopen (ruling out stale
service-worker/in-memory-page state): both "Open camera app" buttons (main
controls and the max-screen overlay) do nothing at all — same result as the
intent-link attempts. Checked the live deployed `index.html`/`sw.js` directly
(via `curl`) to rule out a deploy mismatch: both matched the intended source
exactly, `CACHE_NAME` was `eclipse2026-v33` as expected, and the fullscreen
overlay's computed style confirmed `display:none` by default (so it isn't
silently covering the page and swallowing clicks meant for the main button).
No further hypothesis pursued yet — root cause not identified. **Deliberately
did not attempt another speculative code change here**, per the user's explicit
instruction not to keep changing things without being asked; asked instead
whether the "Open camera app" button behaves any differently in a plain Chrome
tab versus the installed home-screen app, to check whether this is the same
class of WebAPK-specific restriction already found twice this session
(orientation lock requiring reinstall; intent:// links not resolving) or
something else.

Also added, per explicit request: a small always-visible version tag
(`#versionTag`, bottom-right, muted grey, `pointer-events:none` so it can never
block a real tap, `z-index:3000` so it stays visible even over the max-screen
overlay) showing a hardcoded version string (`v34`) — deliberately not derived
from `sw.js`'s `CACHE_NAME` at runtime, since `index.html` and `sw.js` don't
share a JS scope; instead both are bumped together by hand on every deploy from
now on, and this needs to be remembered as an extra step alongside the existing
`CACHE_NAME` bump. Positioned above the nav bar (not at the very bottom edge)
so it doesn't visually sit on top of the Camera tab's own icon/label. Confirmed
via computed `getBoundingClientRect` that it renders inside the real viewport
— a direct screenshot crop looked empty at first, which turned out to be the
same screenshot/window-size capture-vs-layout mismatch already noted earlier in
Milestone J's max-screen work, not a real positioning bug.

## Camera tab: swap portrait order, sideways-collapsing vertical warning in landscape

Once the camera-app button was confirmed working (root cause of the earlier
failure never fully identified — resolved itself or was environment-specific;
not pursued further since it's working now), user asked for one more layout
tweak: in portrait, put the warning below the preview instead of above it; in
landscape, don't change any of the tuned sizing (video height, grid columns,
padding), but rotate the warning's text to match the screen's orientation and
make it collapse sideways (narrower) rather than upward (shorter) when closed.

**Portrait swap:** moved the `<details id="cameraWarning">` block to come right
after `#cameraPreviewWrap` in the HTML instead of before it. This has zero
effect on the landscape layout, since that's driven entirely by
`grid-template-areas` (each element is explicitly assigned to a named area
regardless of source order) — only affects portrait's plain block-flow order.

**Landscape vertical warning:** added `writing-mode: vertical-rl` +
`text-orientation: mixed` to `#cameraWarning` (inherited by its `summary`/`p`
children automatically, since `writing-mode` is an inherited property — no need
to repeat it on each). The key trick for "collapse sideways, not up": gave the
box a fixed `height: 4.5rem` instead of the previous auto height. In vertical
writing mode, a fixed height caps how much text fits in one vertical "column"
before wrapping into an additional column *to the side* — so revealing more
text (opening the details) grows the box's WIDTH, not its height, exactly
inverting the normal (horizontal) collapse direction. Added `max-width: 55vw`
+ `overflow-x: auto` as a safety net, since the full warning paragraph is long
enough that translated into narrow vertical columns it could plausibly grow
very wide — this caps it and makes it scroll internally rather than risk
breaking the surrounding grid layout if it doesn't fit. Used the logical
property `margin-block-start` (rather than a plain physical top margin) for
the gap between the summary and paragraph, so it lands on the correct physical
side automatically under vertical-rl instead of hardcoding an assumption.

Iterated once based on a headless screenshot: the initial `height: 3rem` cut
the word "Warning" off mid-word in the collapsed state; bumped to `4.5rem` and
confirmed the full word plus the chevron marker now fit. Verified via headless
screenshots at 800×400: collapsed state shows a narrow vertical "Warning" tab
next to an unchanged-size video preview; expanded state shows the full warning
text flowing in readable vertical columns growing to the left, chevron
correctly rotated for the open state, video still unchanged; portrait
screenshot confirms the preview now appears before the (normal, horizontal)
warning text. This is a genuinely novel piece of CSS for this project (rotated
multi-column vertical text) that I can't fully validate without seeing it on
the actual device — flagged as such. Bumped `CACHE_NAME` and `#versionTag` to
`eclipse2026-v35`.

## Landscape camera tab, redone: no shrinking, horizontal scroll instead of rotation

User rejected the vertical-text approach after seeing it live: wanted the
preview to be exactly the same size as portrait (not shrunk at all), the
warning to sit to the right and be reached by scrolling, collapsible to a
single (narrow) column, and — the key correction — normal horizontal text, not
rotated. Replaced the whole landscape approach:

- `#cameraContent`'s landscape grid: `grid-template-columns: 100% max-content`.
  Column 1 (100%) is exactly as wide as the whole content area — the preview
  sitting in it, still using its plain unmodified `width:100%; aspect-ratio:
  3/4` rule (no landscape override left at all), ends up exactly the size it
  would be in portrait. Column 2 sizes to whatever the warning currently needs
  (small collapsed, wider open) — since column 1 alone already accounts for
  100% of the available width, any nonzero column 2 pushes the grid's total
  content width past the container, and `overflow-x: auto` turns that into a
  horizontal scroll instead of squeezing the preview to make room.
- `status`/`controls`/`appstatus` use `.` in column 2 of `grid-template-areas`,
  confining them to column 1 — they stay reachable without scrolling; only the
  warning is off in scroll territory.
- `#cameraWarning`: removed `writing-mode`/`text-orientation` entirely (back to
  normal horizontal text, "just normal alignment" as asked) and replaced the
  fixed-height sideways-text trick with a plain `max-width: 260px` — this caps
  the *open* reading width so the paragraph wraps into an ordinary multi-line
  block instead of one long line; collapsed, the `<details>` is already
  narrower than 260px (summary only) so the cap has no effect there, and it's
  the same "narrow when closed, wider when open" outcome as before, just via
  ordinary content-driven sizing instead of vertical-text-column wrapping.

Verified via headless Chrome using `getBoundingClientRect`/`scrollWidth` checks
(not just screenshots, given this environment's earlier-discovered
screenshot-vs-layout mismatch): confirmed the preview is 693.8×925px — an
exact 3:4 ratio — regardless of the warning's open/closed state (proving it
truly never shrinks); confirmed `scrollWidth` (966px open / 805px collapsed)
exceeds `clientWidth` (694px) in both states, i.e., a horizontal scroll is
genuinely available/needed to reach the warning, more so when open than
collapsed. Also took a screenshot after programmatically scrolling
`#cameraContent` fully right, to see the actual rendered warning text — normal
horizontal alignment, fully legible, matching portrait's own warning styling.
Re-confirmed portrait renders unaffected (no landscape-only rule touches
portrait's own layout). Bumped `CACHE_NAME` and `#versionTag` to
`eclipse2026-v36`.

## Real bug: landscape preview was bigger than portrait despite "same rule"

User caught this immediately after v36 shipped: the preview was visibly larger
in landscape than portrait. Before making any change, stopped and asked the
user to confirm the exact spec in plain language (per their explicit request),
then investigated.

**Root cause**: v36 used the *same* `width: 100%` rule in both orientations,
reasoning "same CSS = same result." That's wrong — rotating a phone doesn't
change its two physical dimensions, only which one is currently "width" and
which is "height." A landscape viewport's width is that device's *longer*
dimension, so "100% of the container" resolves to a bigger number in landscape
than the same rule ever produced in portrait, even though it's textually the
same rule.

**Fix**: `min(100vw, 100vh)` is the one viewport-relative quantity that stays
constant across rotation (in portrait, `vw` already *is* the smaller
dimension, so `min(vw,vh)` there just equals plain `vw`; in landscape, `vh`
becomes the smaller one, and rotating a real device makes that value equal to
what portrait's own `vw` was). Set `#cameraPreviewWrap`'s landscape width to
`calc(min(100vw, 100vh) - 4.5rem)` — the `4.5rem` replicates the exact
horizontal padding portrait's plain `width:100%` already gets for free from
its ancestors (main's `1rem` each side + `.panel`'s `1.25rem` each side),
needed explicitly here since `min(vw,vh)` is an absolute length, not a
percentage, so it doesn't auto-subtract ancestor padding the way `width:100%`
does. Removed the landscape-only `#panel-camera` padding tightening (added
back in the max-screen-overlay work) entirely, since it's no longer relevant
(that shrink-to-fit-height goal is gone) and, more importantly, having it
differ from portrait's `.panel` padding would have thrown off this exact
calculation. Also changed the grid's `grid-template-columns` from
`100% max-content` to `max-content max-content`, since column 1 is no longer
meant to consume the whole width — it now sizes to the preview's own
(smaller, explicitly calculated) width, with the warning column sitting
immediately next to it rather than far off to the right.

**Verification, including chasing down a confusing false alarm**: compared the
preview's rendered width at simulated portrait (412×900 request) vs landscape
(900×412 request) — got 389px vs 242px, an apparent mismatch. Traced this by
comparing `getBoundingClientRect()` (which includes reserved scrollbar width)
against `.clientWidth` (which excludes it) on `main`: found a 15px gap,
confirming Windows desktop Chrome was reserving classic (non-overlay)
scrollbar width because `main`'s tall content triggered `overflow-y:auto` —
an artifact specific to this desktop testing environment. Forcibly disabled
`main`'s scroll in a throwaway test copy and re-measured: portrait's width
came out to 404px, closely matching what the landscape formula's math
predicts, confirming the CSS technique itself is sound — the mismatch was a
testing-environment artifact (Android Chrome uses overlay scrollbars that
don't reserve layout space, so this specific discrepancy shouldn't occur on
the real device). Also confirmed via a direct headless screenshot at 900×412
that the preview now renders as a compact, portrait-sized box with the warning
fully visible right next to it, not requiring a scroll at that width. Bumped
`CACHE_NAME` and `#versionTag` to `eclipse2026-v37`.

## v37 still wrong: insert should rotate with the phone, not stay a fixed size

User rejected v37 too, and the miscommunication took several exchanges to
resolve — worth recording precisely, since it's the actual spec now. What the
user meant by "same size" (confirmed as correct back at v37) was never "same
absolute width/height regardless of rotation" — it was "the same rectangle,
glued to the phone, rotating rigidly with it": portrait's width becomes
landscape's *height*, and portrait's height becomes landscape's *width*. v37
kept the same absolute W and H in both orientations (same narrow/tall shape
always), which is a different thing and not what was asked, even though an
earlier round of clarifying questions had (wrongly) confirmed it. Lesson: when
a user confirms a paraphrased spec, the paraphrase can still be wrong — worth
double-checking with a concrete example (numbers or a sketch) for anything
with more than one plausible reading, rather than trusting a single-word
"correct" against a summary.

**Fix**: flipped `aspect-ratio` from `3/4` to `4/3` for the landscape preview,
and set `height` (not `width`) to `calc(min(100vw, 100vh) - 4.5rem)` — the
same reference length used before — with `width: auto` so the flipped ratio
computes width from that height. Since portrait's own width equals this same
reference length (via its unmodified `width:100%` rule), and landscape's
height is now set to it directly, landscape's height numerically equals
portrait's width; landscape's width (derived from that height via the 4:3
ratio) numerically equals portrait's height. Same physical rectangle,
reoriented — not resized.

**Verification, again working around this environment's window-size quirk**:
comparing preview dimensions at two separately-guessed portrait/landscape
window sizes (412×900 vs 900×412) showed no obvious swap relationship at
first — but that's because this sandbox's `--window-size` doesn't reliably
produce genuinely axis-swapped `clientWidth`/`clientHeight` pairs (already
documented earlier this session). Found a landscape window size
(`1000×576`) whose reported `clientHeight` (478) happened to exactly match
the earlier portrait test's `clientWidth` (478) — i.e., one that *does*
represent a true rotation of the same device — and re-measured: portrait was
404×538.7 (width×height), landscape came out 541.3×406. Landscape's height
(406) matches portrait's width (404); landscape's width (541.3) matches
portrait's height (538.7) — both within ~2-3px, consistent with normal
`aspect-ratio` rounding. Confirms the swap is working as intended. Bumped
`CACHE_NAME` and `#versionTag` to `eclipse2026-v38`.
