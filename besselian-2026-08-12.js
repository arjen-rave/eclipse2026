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
// This file holds both the sourced coefficients and the local-circumstances math
// that consumes them (Milestone C2), kept together per the plan's file structure —
// isolated from the rest of the app (index.html) for auditability, and not shared
// with Milestone E's generic sun-position code (different problem — see the plan's
// "No-duplication list").
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

// ---- Local-circumstances math (Milestone C2) ----
// Standard Besselian-element algorithm for local circumstances of a solar eclipse
// (Meeus, "Astronomical Algorithms", ch. 54 "Eclipses", combined with the observer
// parallax-factor formulas from ch. 11 "Parallax") — the same method NASA/GSFC's own
// eclipse predictions are built on. Depends only on BESSELIAN_2026_08_12 above.
const EclipseMath = (() => {
  const B = BESSELIAN_2026_08_12;
  const DEG = Math.PI / 180;

  // Reference ellipsoid constants matching the convention Besselian eclipse
  // elements are computed on (Meeus ch. 11).
  const EARTH_RADIUS_A_M = 6378140; // metres
  const B_OVER_A = 0.99664719; // = sqrt(1 - e^2) for this reference ellipsoid

  function poly(coeffs, t) {
    let result = 0;
    for (let i = 0; i < coeffs.length; i++) result += coeffs[i] * Math.pow(t, i);
    return result;
  }

  // Interpolate all Besselian elements at time t (decimal TDT hours since t0).
  function elementsAt(t) {
    return {
      x: poly(B.x, t),
      y: poly(B.y, t),
      d: poly(B.d, t) * DEG,
      l1: poly(B.l1, t),
      l2: poly(B.l2, t),
      mu: poly(B.mu, t), // degrees
    };
  }

  // Observer's geocentric parallax factors (rho*sin(phi'), rho*cos(phi')) — corrects
  // for Earth's oblateness, which matters most at high latitude (this eclipse's path
  // crosses Greenland/Iceland).
  function observerGeocentric(latDeg, elevM) {
    const phi = latDeg * DEG;
    const u = Math.atan(B_OVER_A * Math.tan(phi));
    const hOverA = elevM / EARTH_RADIUS_A_M;
    return {
      rhoSinPhi: B_OVER_A * Math.sin(u) + hOverA * Math.sin(phi),
      rhoCosPhi: Math.cos(u) + hOverA * Math.cos(phi),
    };
  }

  // Two-circle disk-overlap area, as a percentage of the sun's disk area.
  function diskOverlapPct(sunR, moonR, d) {
    if (d >= sunR + moonR) return 0; // no overlap — not visible from here at time t
    if (d <= Math.abs(sunR - moonR)) {
      // smaller disk entirely inside the larger one (total/annular at this instant)
      const coveredR = Math.min(sunR, moonR);
      return Math.min(100, ((coveredR * coveredR) / (sunR * sunR)) * 100);
    }
    const sunR2 = sunR * sunR;
    const moonR2 = moonR * moonR;
    const part1 = sunR2 * Math.acos((d * d + sunR2 - moonR2) / (2 * d * sunR));
    const part2 = moonR2 * Math.acos((d * d + moonR2 - sunR2) / (2 * d * moonR));
    const part3 =
      0.5 *
      Math.sqrt(
        Math.max(
          0,
          (-d + sunR + moonR) * (d + sunR - moonR) * (d - sunR + moonR) * (d + sunR + moonR)
        )
      );
    const area = part1 + part2 - part3;
    return Math.max(0, Math.min(100, (area / (Math.PI * sunR2)) * 100));
  }

  // Evaluate magnitude + obscuration% at one instant t for one observer location.
  function evaluateAt(t, latDeg, lonDeg, elevM) {
    const el = elementsAt(t);
    const { rhoSinPhi, rhoCosPhi } = observerGeocentric(latDeg, elevM);
    // NOTE: classical H = mu - lambda formula uses lambda measured POSITIVE WEST
    // (traditional astronomical convention, not the modern east-positive one) —
    // confirmed empirically against NASA's own published greatest-eclipse point
    // during Milestone C2 validation. lonDeg here is passed in as east-positive
    // (i.e. Netherlands is positive, not negative), so this is mu + lonDeg.
    const H = (el.mu + lonDeg) * DEG;

    const xi = rhoCosPhi * Math.sin(H);
    const eta = rhoSinPhi * Math.cos(el.d) - rhoCosPhi * Math.sin(el.d) * Math.cos(H);
    const zeta = rhoSinPhi * Math.sin(el.d) + rhoCosPhi * Math.cos(el.d) * Math.cos(H);

    const u = el.x - xi;
    const v = el.y - eta;
    const m = Math.sqrt(u * u + v * v);

    const l1p = el.l1 - zeta * B.tanF1;
    const l2p = el.l2 - zeta * B.tanF2;

    const magnitude = (l1p - m) / (l1p + l2p);

    // Sun/Moon apparent radii in the same fundamental-plane units, derived directly
    // from l1'/l2' — not from the fixed k1/k2 constants (see comment on those above).
    // This resolves that open question: k1/k2 turn out not to be needed at all.
    const sunR = (l1p + l2p) / 2;
    const moonR = (l1p - l2p) / 2;
    const obscurationPct = diskOverlapPct(sunR, moonR, m);

    return { magnitude, obscurationPct, m, l1p, l2p, sunR, moonR };
  }

  // Scan across the eclipse's valid time range to find first contact, last contact,
  // and the moment/value of greatest eclipse (peak magnitude) at one location.
  // Coarse fixed-step scan (10s resolution, ~2160 steps) — simple and fast enough;
  // no iterative root-finding needed for this app's purposes.
  function localCircumstances(latDeg, lonDeg, elevM) {
    const stepHours = 10 / 3600; // 10-second steps
    const tStart = B.validRange.minTdtHour - B.t0.tdtHourOfDay;
    const tEnd = B.validRange.maxTdtHour - B.t0.tdtHourOfDay;

    let visible = false;
    let firstContactT = null;
    let lastContactT = null;
    let peakT = null;
    let peakMagnitude = -Infinity;
    let peakResult = null;
    let prevVisible = false;

    for (let t = tStart; t <= tEnd; t += stepHours) {
      const result = evaluateAt(t, latDeg, lonDeg, elevM);
      const nowVisible = result.magnitude > 0;
      if (nowVisible && !prevVisible) firstContactT = t;
      if (!nowVisible && prevVisible && lastContactT === null) lastContactT = t;
      if (nowVisible) visible = true;
      if (result.magnitude > peakMagnitude) {
        peakMagnitude = result.magnitude;
        peakT = t;
        peakResult = result;
      }
      prevVisible = nowVisible;
    }
    if (prevVisible && lastContactT === null) lastContactT = tEnd; // still visible at range end

    function tToUTC(t) {
      if (t === null) return null;
      const t0UTCms = Date.parse(B.t0.approxUTC);
      return new Date(t0UTCms + t * 3600 * 1000);
    }

    return {
      visible,
      peakObscurationPct: visible ? peakResult.obscurationPct : 0,
      peakMagnitude: visible ? peakMagnitude : 0,
      peakTimeUTC: visible ? tToUTC(peakT) : null,
      firstContactUTC: visible ? tToUTC(firstContactT) : null,
      lastContactUTC: visible ? tToUTC(lastContactT) : null,
    };
  }

  // Purely geometric self-check, independent of any observer location: the minimum
  // distance (Earth radii) from the shadow axis to Earth's center, across the whole
  // valid range — should match the published Gamma (0.8978) if x(t)/y(t) are
  // interpolated correctly, regardless of the observer-parallax code path above.
  function globalGreatestEclipse() {
    const stepHours = 10 / 3600;
    const tStart = B.validRange.minTdtHour - B.t0.tdtHourOfDay;
    const tEnd = B.validRange.maxTdtHour - B.t0.tdtHourOfDay;
    let best = { t: null, gamma: Infinity };
    for (let t = tStart; t <= tEnd; t += stepHours) {
      const el = elementsAt(t);
      const gamma = Math.sqrt(el.x * el.x + el.y * el.y);
      if (gamma < best.gamma) best = { t, gamma };
    }
    return best;
  }

  return { elementsAt, evaluateAt, diskOverlapPct, localCircumstances, globalGreatestEclipse };
})();
