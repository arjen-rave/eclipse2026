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
contradiction, not just noise. Combined with Groningen's reference figure coming from
a lower-confidence sourcing path (search-snippet summary, never independently
fetched/verified) versus the strong, direct-source-backed agreement at the other
three points, the working conclusion is that the "89.08%" reference figure itself is
the unreliable one, not the implementation. Not pursued further (would require a
direct fetch of theskylive.com's Groningen page, which returned 403 in this session).
Flagging this conclusion rather than treating it as fully closed — worth a second
look if a reliable direct source for Groningen turns up later.
