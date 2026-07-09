# Cloudflare Worker — subscription write-proxy

Why this exists, and the full reasoning, is documented in `worker.js`'s header
comment and in the main project's `CLAUDE.md` ("Reminder architecture decision") and
`error-log.md`. Short version: the client can't safely hold a real GitHub PAT (GitHub
auto-revokes any exposed GitHub PAT in a public repo), so this small Worker holds it
instead, as a Cloudflare-encrypted secret, and the client talks to this Worker with a
separate, narrow-scope shared secret.

## Setup (no Wrangler/Node needed — dashboard only)

1. Sign up for a free Cloudflare account at https://dash.cloudflare.com/sign-up if
   you don't have one.
2. In the dashboard: **Workers & Pages** → **Create** → **Create Worker**. Give it
   any name (e.g. `eclipse2026-subscribe`).
3. Once created, open it and click **Edit code** (the "Quick Edit" browser editor).
4. Delete the placeholder code and paste in the entire contents of `worker.js` from
   this folder. Click **Save and deploy**.
5. Go to the Worker's **Settings → Variables and Secrets**. Add two secrets
   (use "Secret" type, not "Text", so they're encrypted and never displayed again):
   - `GITHUB_PAT` — a **fresh** fine-grained GitHub PAT (the old one embedded
     directly in the app is dead — GitHub auto-revoked it). Create one at
     https://github.com/settings/personal-access-tokens/new, scoped to **only**
     the `eclipse2026` repository, with **Contents: Read and write** permission.
     This one is safe to create because it will never be committed to any repo or
     sent to any browser — it only ever lives inside this Worker.
   - `APP_SECRET` — the shared secret the client already has embedded
     (`WORKER_APP_SECRET` in `index.html`): `61a8c83d-3149-4350-bab5-fd8df7b79767d06bfb14-da02-44b6-a8e7-83cffef68dbb`
6. Note the Worker's URL, shown at the top of its dashboard page — looks like
   `https://eclipse2026-subscribe.<your-subdomain>.workers.dev`. This needs to be
   pasted into `index.html` in place of `WORKER_URL`'s placeholder value.

## Testing

Once deployed, a quick manual check (replace the URL and secret with your real
values):

```
curl -X POST https://eclipse2026-subscribe.YOUR-SUBDOMAIN.workers.dev \
  -H "Authorization: Bearer 61a8c83d-3149-4350-bab5-fd8df7b79767d06bfb14-da02-44b6-a8e7-83cffef68dbb" \
  -H "Content-Type: application/json" \
  -d '{"subscription":{"endpoint":"https://example.com/test"},"checklistComplete":false}'
```

Should return `{"ok":true}`, and `subscriptions.json` in the main repo should then
contain a `https://example.com/test` entry (remove it afterward — it's not a real
device).
