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

## Features
1. Countdown to local eclipse maximum + T-30/T-5 min live-GPS alerts (client-side).
2. Location-based coverage % (geolocation + manual override).
3. Safety checklist (partial-eclipse only — glasses stay on at all times, no
   totality-style "safe to remove" window; phone needs its own solar filter too).
4. Camera "find the sun" aiming aid (compass + sun-position overlay) — explicitly
   not an astrophotography tool, no zoom.
5. Multi-stage reminders: Day-7, Day-3 (conditional on checklist), Day-1, Day-of
   10:00 local via server push; T-30/T-5 via client-side local notifications.

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
- [ ] C — Location + coverage calculator
  - [x] C1 — Source & transcribe Besselian elements (`besselian-2026-08-12.js`)
  - [x] C2 — Implement `localCircumstances()` math + self-check vs. reference values
  - [ ] C3 — Validate against timeanddate.com for NL reference location(s)
  - [ ] C4 — Wire into UI (geolocation + manual override, Coverage tab, real countdown target)
- [ ] D — Safety checklist
- [ ] E — Camera "find the sun" aid
- [ ] F — Server-side reminders (Render + GitHub Actions trigger)
- [ ] G — Full dry-run rehearsal (mandatory before 12 Aug 2026)
