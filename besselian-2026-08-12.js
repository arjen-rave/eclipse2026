// Besselian elements for the Total Solar Eclipse of 12 August 2026.
//
// Source: NASA/GSFC (Fred Espenak), "Besselian Elements for Total Solar Eclipse of
// 2026 Aug 12": https://eclipse.gsfc.nasa.gov/SEbeselm/SEbeselm2001/SE2026Aug12Tbeselm.html
// Cross-checked via two independently-worded fetches of the same page (one asking for
// a structured extraction, one asking for the raw preformatted text verbatim) — both
// agree exactly on every coefficient below. A fully independent second publisher
// (e.g. IMCCE/HMNAO) has not been checked; flagged here in case that's wanted later,
// but not treated as blocking since the two extractions already agree.
//
// This file is data only — no calculation logic. The local-circumstances algorithm
// (Milestone C2) consumes these coefficients; it is not implemented here.
//
// Formula (per NASA's own notation): a(t) = a0 + a1*t + a2*t^2 + a3*t^3, where t is
// decimal hours elapsed since t0, evaluated in TDT (Terrestrial Dynamical Time).
// Valid range: 15.00 <= t0-relative TDT hour-of-day <= 21.00 on 2026 Aug 12.
//
// IMPORTANT for whoever implements Milestone C2: t (for the polynomials above) must
// be computed in TDT, but the observer's hour angle depends on Earth's actual
// rotation (UT1, effectively UTC for this purpose) — that's what deltaTSeconds below
// is for. Do not evaluate the polynomials using a UTC-based t without accounting for
// this, or timing will be off by ~71 seconds.

const BESSELIAN_2026_08_12 = {
  t0: {
    calendarDateTDT: "2026-08-12",
    tdtHourOfDay: 18.0, // decimal hours, TDT — this is what "t=0" means for the polynomials
    approxUTC: "2026-08-12T17:58:48.6Z", // = TDT 18:00:00.0 minus deltaTSeconds; reference/display only
  },
  deltaTSeconds: 71.4, // TT (~=TDT) - UT1, as assumed by Espenak for this prediction
  validRange: { minTdtHour: 15.0, maxTdtHour: 21.0 },

  // Polynomial coefficients [c0, c1, c2, c3]: value(t) = c0 + c1*t + c2*t^2 + c3*t^3
  x: [0.475593, 0.5189288, -0.0000773, -0.0000088],
  y: [0.771161, -0.2301664, -0.0001245, 0.0000037],
  d: [14.79667, -0.012065, -0.000003],
  l1: [0.537954, 0.0000940, -0.0000121],
  l2: [-0.008142, 0.0000935, -0.0000121],
  mu: [88.74776, 15.003093],

  tanF1: 0.0046141, // penumbral cone half-angle tangent
  tanF2: 0.0045911, // umbral cone half-angle tangent

  // "Lunar Radius Constants" as published by NASA/GSFC alongside the elements above.
  // Confidence note (flagged, not silently assumed): these are understood to be
  // Moon-radius / Earth-radius ratios (fixed physical constants used internally by
  // Espenak to derive l1(t)/l2(t) above) — NOT the Moon/Sun apparent angular-radius
  // ratio that a two-circle disk-overlap "obscuration %" calculation needs directly.
  // That ratio is time-varying (Earth-Sun/Earth-Moon distances shift slightly across
  // the ~3hr eclipse window) and should instead be derivable from l1(t) and l2(t)
  // themselves, since l1 ∝ (sunRadius + moonRadius) and l2 ∝ (sunRadius - moonRadius)
  // in the same fundamental-plane units — giving moonSunRatio(t) =
  // (l1(t) - l2(t)) / (l1(t) + l2(t)). This is standard celestial-mechanics
  // convention (Meeus/Chauvenet-style), but has NOT been freshly verified against an
  // explicit published formula in this session (eclipsewise.com's explainer page was
  // blocked, NASA's own explainer page doesn't spell out the derivation) — Milestone
  // C2 must validate the derived ratio against the published magnitude (1.0386,
  // implying the Moon is very slightly larger than the Sun for this eclipse) before
  // relying on it. k1/k2 are kept here as published reference values in case they're
  // still useful as a fallback or cross-check, not because C2 is committed to using
  // them directly.
  k1: 0.272488, // penumbra
  k2: 0.272281, // umbra

  // Published alongside the elements — not location-specific, useful as a
  // sanity-check for the Milestone C2 implementation (not a substitute for the
  // location-specific validation against timeanddate.com planned for Milestone C3).
  reference: {
    gamma: 0.8978,
    magnitude: 1.0386,
    saros: { series: 126, member: 48, of: 72 },
    greatestEclipse: {
      timeUTC: "2026-08-12T17:45:53.8Z",
      latDeg: 65.225, // 65°13.5'N
      lonDeg: -25.228, // 025°13.7'W
      centralDurationSeconds: 138.2, // 2m18.2s
    },
  },
};
