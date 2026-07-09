// Stateless reminder-check push server for the Eclipse_Aug_2026 PWA.
//
// Deliberately has NO internal cron/timer loop — /check-reminders is a one-shot
// "what's due right now, send it" check, triggered externally by a GitHub Actions
// scheduled workflow (see .github/workflows in the main repo). This avoids relying
// on Render's free-tier dyno staying warm between ticks, and means a late-arriving
// external ping still catches up on anything overdue rather than missing it.
//
// State (subscriber list + which reminders have already fired for each) is a local
// JSON file. This is wiped on every redeploy of THIS server (Render free tier resets
// local files on a fresh build) — deliberately accepted rather than adding another
// external dependency (e.g. a hosted Redis) for a personal/family-scale app. The
// client re-syncs its subscription + checklist status on every app open, so any
// data lost to a redeploy self-heals the next time someone opens the app, well
// before the next reminder is due, as long as server code isn't touched again right
// up against a reminder's fire time.

const express = require("express");
const cors = require("cors");
const webpush = require("web-push");
const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data", "subscribers.json");
const PUSH_SECRET = process.env.PUSH_SECRET;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error("Missing VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY env vars — refusing to start.");
  process.exit(1);
}
if (!PUSH_SECRET) {
  console.error("Missing PUSH_SECRET env var — refusing to start.");
  process.exit(1);
}

webpush.setVapidDetails("mailto:arjen.ravestein@gmail.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// Fixed, global reminder schedule — not per-subscriber, not location-dependent (per
// the plan: Day-7/-3/-1/day-of need no location data). Times are hardcoded UTC
// instants; early August 2026 in the Netherlands is uniformly CEST (UTC+2) with no
// DST transition in this window, so a direct +2 offset is safe here without needing
// a timezone-conversion library for these four fixed calendar dates.
const REMINDERS = [
  {
    id: "day7",
    fireAtUTC: "2026-08-05T16:00:00Z", // 18:00 CEST, 7 days before
    message: "One week to go! Check your eclipse safety checklist.",
    condition: null,
  },
  {
    id: "day3",
    fireAtUTC: "2026-08-09T16:00:00Z", // 18:00 CEST, 3 days before
    message: "3 days to go — your eclipse checklist isn't complete yet. Get everything ready!",
    condition: "checklistIncomplete", // only sent if the subscriber's checklist isn't done
  },
  {
    id: "day1",
    fireAtUTC: "2026-08-11T16:00:00Z", // 18:00 CEST, day before
    message: "Tomorrow's the day! Make sure everything is ready for the eclipse.",
    condition: null,
  },
  {
    id: "dayOf",
    fireAtUTC: "2026-08-12T08:00:00Z", // 10:00 CEST, morning of
    message: "Don't forget — the eclipse is today! Get everything ready for this evening.",
    condition: null,
  },
];

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    return {};
  }
}
function saveStore(store) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function requireSecret(req, res, next) {
  if (req.get("x-push-secret") !== PUSH_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

const app = express();
app.use(cors());
app.use(express.json());

app.get("/vapid-public-key", (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Client calls this on every app open, and whenever checklist state changes.
// Upserts by subscription endpoint (stable per browser install). Never resets
// sentReminders for an existing subscriber, so re-syncing doesn't re-arm/re-send
// reminders that have already fired.
app.post("/sync", requireSecret, (req, res) => {
  const { subscription, checklistComplete } = req.body || {};
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: "missing subscription" });
  }
  const store = loadStore();
  const key = subscription.endpoint;
  const existing = store[key];
  store[key] = {
    subscription,
    checklistComplete: !!checklistComplete,
    sentReminders: (existing && existing.sentReminders) || {},
  };
  saveStore(store);
  res.json({ ok: true });
});

// Stateless "what's due right now" check. Triggered externally (GitHub Actions),
// not by any internal timer. Safe to call as often as needed — already-sent
// reminders are skipped via sentReminders, and overdue-but-unsent reminders are
// caught up regardless of how late the external ping arrives.
app.post("/check-reminders", requireSecret, async (req, res) => {
  const store = loadStore();
  const now = Date.now();
  let sent = 0;
  let skippedComplete = 0;
  let removedExpired = 0;

  for (const key of Object.keys(store)) {
    const subscriber = store[key];
    for (const reminder of REMINDERS) {
      if (subscriber.sentReminders[reminder.id]) continue;
      if (now < Date.parse(reminder.fireAtUTC)) continue;

      if (reminder.condition === "checklistIncomplete" && subscriber.checklistComplete) {
        subscriber.sentReminders[reminder.id] = true; // mark handled, don't send
        skippedComplete++;
        continue;
      }

      try {
        await webpush.sendNotification(
          subscriber.subscription,
          JSON.stringify({ title: "Eclipse reminder", body: reminder.message })
        );
        subscriber.sentReminders[reminder.id] = true;
        sent++;
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          delete store[key];
          removedExpired++;
          break; // this subscriber is gone, stop checking its other reminders
        } else {
          console.error("Push send failed for", key, err.statusCode, err.message);
        }
      }
    }
  }

  saveStore(store);
  res.json({ ok: true, sent, skippedComplete, removedExpired, subscriberCount: Object.keys(store).length });
});

// Debug visibility — how many subscribers exist and what's been sent, without
// exposing push subscription secrets (keys/endpoints).
app.get("/status", requireSecret, (req, res) => {
  const store = loadStore();
  res.json({
    subscriberCount: Object.keys(store).length,
    reminders: REMINDERS.map((r) => ({ id: r.id, fireAtUTC: r.fireAtUTC, condition: r.condition })),
    subscribers: Object.values(store).map((s) => ({
      checklistComplete: s.checklistComplete,
      sentReminders: s.sentReminders,
    })),
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Eclipse push-server listening on " + PORT));
