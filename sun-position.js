// Generic solar position (altitude/azimuth for any date, anywhere) — Milestone E only.
//
// Deliberately NOT shared with besselian-2026-08-12.js: that file solves a different
// problem (eclipse-specific shadow geometry from externally-sourced Besselian
// coefficients, valid only for this one eclipse's ~3-hour window). This module
// solves "where is the sun in the sky right now, from here" — a general-purpose,
// any-day calculation with no eclipse-specific data at all. See the plan's
// "No-duplication list" for why these two are kept as separate modules rather than
// merged, even though both ultimately do solar trigonometry.
//
// Algorithm: the standard "low precision" solar position formula (Meeus,
// "Astronomical Algorithms", ch. 25 — the same algorithm NOAA's own solar
// calculator is built on). Accurate to a fraction of a degree, which is more than
// enough for a "point your phone this way" aiming aid — this is explicitly not an
// astrophotography tool and doesn't need arc-second precision.

const SunPosition = (() => {
  const DEG = Math.PI / 180;

  function julianDate(dateUTC) {
    return dateUTC.getTime() / 86400000 + 2440587.5;
  }

  // Returns { altitude, azimuth } in degrees. altitude: 0 = horizon, 90 = zenith,
  // negative = below horizon. azimuth: 0 = North, 90 = East, 180 = South, 270 = West
  // (standard compass bearing, clockwise from North).
  function getSunPosition(dateUTC, latDeg, lonDeg) {
    const jd = julianDate(dateUTC);
    const n = jd - 2451545.0; // days since J2000.0

    let meanLon = (280.46 + 0.9856474 * n) % 360;
    if (meanLon < 0) meanLon += 360;

    let meanAnomaly = (357.528 + 0.9856003 * n) % 360;
    if (meanAnomaly < 0) meanAnomaly += 360;
    const gRad = meanAnomaly * DEG;

    const eclipticLon = meanLon + 1.915 * Math.sin(gRad) + 0.02 * Math.sin(2 * gRad);
    const lambdaRad = eclipticLon * DEG;

    const obliquity = 23.439 - 0.0000004 * n;
    const epsilonRad = obliquity * DEG;

    const rightAscensionRad = Math.atan2(
      Math.cos(epsilonRad) * Math.sin(lambdaRad),
      Math.cos(lambdaRad)
    );
    const declinationRad = Math.asin(Math.sin(epsilonRad) * Math.sin(lambdaRad));

    let gmstHours = (18.697374558 + 24.06570982441908 * n) % 24;
    if (gmstHours < 0) gmstHours += 24;

    let localSiderealHours = (gmstHours + lonDeg / 15) % 24;
    if (localSiderealHours < 0) localSiderealHours += 24;
    const localSiderealRad = localSiderealHours * 15 * DEG;

    let hourAngleRad = localSiderealRad - rightAscensionRad;
    while (hourAngleRad > Math.PI) hourAngleRad -= 2 * Math.PI;
    while (hourAngleRad < -Math.PI) hourAngleRad += 2 * Math.PI;

    const latRad = latDeg * DEG;

    const altitudeRad = Math.asin(
      Math.sin(latRad) * Math.sin(declinationRad) +
      Math.cos(latRad) * Math.cos(declinationRad) * Math.cos(hourAngleRad)
    );

    const azimuthRad = Math.atan2(
      -Math.sin(hourAngleRad),
      Math.tan(declinationRad) * Math.cos(latRad) - Math.sin(latRad) * Math.cos(hourAngleRad)
    );
    let azimuthDeg = (azimuthRad / DEG + 360) % 360;

    return {
      altitude: altitudeRad / DEG,
      azimuth: azimuthDeg,
    };
  }

  return { getSunPosition };
})();
