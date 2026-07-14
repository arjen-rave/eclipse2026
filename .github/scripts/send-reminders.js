// Runs inside .github/workflows/send-reminders.yml — no persistent server. Reads
// subscriptions.json and sent-log.json from the checked-out repo, sends any push
// reminders that are due and not yet resolved, and writes the updated state back to
// those same local files (the workflow commits them afterward).
//
// Deliberately a date-level check (Europe/Amsterdam calendar date), not a specific
// time — this script runs twice a day (see the workflow's cron comments for the
// UTC/CEST reasoning), which is plenty precise for these day-granularity reminders
// (unlike the client-side T-30/T-5 alerts, which need minute precision and stay
// entirely client-side, unaffected by any of this).
//
// Catch-up safe by construction: "due and not yet resolved" rather than "is today
// exactly the target date" — a missed run (GitHub Actions schedules are documented
// as best-effort) is simply caught by the next one, and re-running never re-sends
// something already resolved.

const webpush = require("web-push");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..", "..");
const SUBSCRIPTIONS_FILE = path.join(REPO_ROOT, "subscriptions.json");
const SENT_LOG_FILE = path.join(REPO_ROOT, "sent-log.json");

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error("Missing VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY secrets — aborting.");
  process.exit(1);
}

webpush.setVapidDetails("mailto:arjen.ravestein@gmail.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// Fixed target dates, Europe/Amsterdam calendar. "conditional" reminders are only
// sent to subscribers whose checklistComplete flag (synced from the client into
// subscriptions.json) is NOT true — others are unconditional, sent to everyone.
const REMINDERS = [
  { id: "day7", dateAmsterdam: "2026-08-05", conditional: false, message: "One week to go! Check your eclipse safety checklist." },
  { id: "day3", dateAmsterdam: "2026-08-09", conditional: true, message: "3 days to go — your eclipse checklist isn't complete yet. Get everything ready!" },
  { id: "day1", dateAmsterdam: "2026-08-11", conditional: false, message: "Tomorrow's the day! Make sure everything is ready for the eclipse." },
  { id: "dayOf", dateAmsterdam: "2026-08-12", conditional: false, message: "Don't forget — the eclipse is today! Get everything ready for this evening, and make sure your viewing location is set in the app so the T-30/T-5 alerts fire correctly." },
];

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return fallback;
  }
}
function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
}
function amsterdamDateString(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(date);
}

// Test mode (workflow_dispatch input `test_send`): sends a fixed one-off message to
// every current subscriber, completely bypassing the date/condition/sent-tracking
// logic below. Deliberately does NOT touch sentLog or subscriptions — so this can be
// run as many times as needed while testing without any risk of marking a real
// reminder (e.g. Day-7) as already resolved.
async function testSend() {
  const subscriptions = readJson(SUBSCRIPTIONS_FILE, {});
  const endpoints = Object.keys(subscriptions);
  console.log(`Test send: ${endpoints.length} subscriber(s) found.`);
  let sent = 0;
  for (const endpoint of endpoints) {
    try {
      await webpush.sendNotification(
        subscriptions[endpoint].subscription,
        JSON.stringify({ title: "Eclipse app test", body: "Test notification — if you see this, push delivery works!" })
      );
      sent++;
    } catch (err) {
      console.error("Test send failed for", endpoint, err && err.statusCode, err && err.message);
    }
  }
  console.log(`Test send complete: sent=${sent}/${endpoints.length}`);
}

async function main() {
  if (process.env.TEST_SEND === "true") {
    return testSend();
  }

  const subscriptions = readJson(SUBSCRIPTIONS_FILE, {});
  const sentLog = readJson(SENT_LOG_FILE, {});
  const today = amsterdamDateString(new Date());

  let sentCount = 0;
  let skippedComplete = 0;
  let removedExpired = 0;
  const toRemove = [];

  for (const [endpoint, entry] of Object.entries(subscriptions)) {
    sentLog[endpoint] = sentLog[endpoint] || {};

    for (const reminder of REMINDERS) {
      if (sentLog[endpoint][reminder.id]) continue;
      if (today < reminder.dateAmsterdam) continue;

      if (reminder.conditional && entry.checklistComplete) {
        sentLog[endpoint][reminder.id] = true; // resolved: skip, don't send
        skippedComplete++;
        continue;
      }

      try {
        await webpush.sendNotification(
          entry.subscription,
          JSON.stringify({ title: "Eclipse reminder", body: reminder.message })
        );
        sentLog[endpoint][reminder.id] = true;
        sentCount++;
      } catch (err) {
        const statusCode = err && err.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          toRemove.push(endpoint);
          removedExpired++;
          break; // subscription is gone; stop checking this subscriber's other reminders
        }
        console.error("Push send failed for", endpoint, statusCode, err && err.message);
        // leave unresolved so the next run retries
      }
    }
  }

  for (const endpoint of toRemove) {
    delete subscriptions[endpoint];
    delete sentLog[endpoint];
  }

  writeJson(SUBSCRIPTIONS_FILE, subscriptions);
  writeJson(SENT_LOG_FILE, sentLog);

  console.log(
    `Checked ${Object.keys(subscriptions).length} subscriber(s): sent=${sentCount} skippedComplete=${skippedComplete} removedExpired=${removedExpired}`
  );
}

main().catch((e) => {
  console.error("Fatal error", e);
  process.exit(1);
});
