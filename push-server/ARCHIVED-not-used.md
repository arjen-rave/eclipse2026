# Archived — this approach is not used

This directory used to hold a Node/Express server (built in Milestone F1) intended
for deployment on Render, with `/sync`, `/check-reminders`, and `/status` endpoints,
plus a companion GitHub Actions workflow that would ping it to work around Render's
free-tier sleep behavior.

**That whole approach was replaced** with a server-less design: GitHub Actions itself
does both the scheduling and the sending, with the subscriber list and a
"what's-already-been-sent" log living as JSON files committed directly to this repo
(`subscriptions.json`, `sent-log.json` at the repo root) instead of on a hosted
server. See `.github/workflows/send-reminders.yml` and
`.github/scripts/send-reminders.js` for the current implementation, and the
"Push-server storage decision" section in `CLAUDE.md` for the reasoning.

Nothing in this directory is deployed or referenced by anything else in the app.
It's kept only so nobody stumbles on `push-server/server.js` later and wonders
whether it's supposed to be running somewhere.
