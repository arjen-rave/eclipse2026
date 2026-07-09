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
