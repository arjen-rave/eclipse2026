// Cloudflare Worker — write-proxy for subscriptions.json.
//
// Why this exists: the client used to write directly to GitHub's Contents API with
// an embedded fine-grained PAT. GitHub's secret scanning automatically revokes any
// GitHub PAT (classic or fine-grained) it detects committed to a public repo —
// confirmed the hard way (a working token died within hours of being pushed). This
// Worker exists purely to keep the real GitHub PAT out of any git repo and out of
// any browser: it lives only as a Cloudflare-encrypted secret (env.GITHUB_PAT),
// referenced here, never logged or returned to the caller.
//
// The client instead authenticates to THIS Worker with a separate, narrow-scope
// shared secret (env.APP_SECRET) — that secret is still visible in the client's
// page source (same accepted trade-off as before), but its blast radius is much
// smaller: it only lets someone trigger the one operation this Worker exposes
// (upsert a subscription entry into subscriptions.json), not full repo access.
//
// Deploy via Cloudflare's dashboard "Quick Edit" (paste this file's contents) —
// no Wrangler/Node needed. Set two secrets in the Worker's settings:
//   GITHUB_PAT   — a fresh fine-grained PAT, Contents read/write, this repo only
//   APP_SECRET   — the shared secret the client sends as "Authorization: Bearer ..."

const GITHUB_REPO = "arjen-rave/eclipse2026";
const SUBSCRIPTIONS_PATH = "subscriptions.json";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: Object.assign({ "Content-Type": "application/json" }, CORS_HEADERS),
  });
}

function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function base64ToUtf8(str) {
  return decodeURIComponent(escape(atob(str)));
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function githubGetFile(githubPat, filePath) {
  const res = await fetch("https://api.github.com/repos/" + GITHUB_REPO + "/contents/" + filePath, {
    headers: {
      Authorization: "Bearer " + githubPat,
      Accept: "application/vnd.github+json",
      "User-Agent": "eclipse2026-worker",
    },
  });
  if (res.status === 404) return { content: {}, sha: null };
  if (!res.ok) throw new Error("GitHub GET failed: " + res.status);
  const data = await res.json();
  return { content: JSON.parse(base64ToUtf8(data.content.replace(/\n/g, ""))), sha: data.sha };
}

async function githubPutFile(githubPat, filePath, contentObj, sha, message) {
  const res = await fetch("https://api.github.com/repos/" + GITHUB_REPO + "/contents/" + filePath, {
    method: "PUT",
    headers: {
      Authorization: "Bearer " + githubPat,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "eclipse2026-worker",
    },
    body: JSON.stringify(
      Object.assign(
        { message: message, content: utf8ToBase64(JSON.stringify(contentObj, null, 2) + "\n") },
        sha ? { sha: sha } : {}
      )
    ),
  });
  if (res.status === 409) throw new Error("conflict");
  if (!res.ok) throw new Error("GitHub PUT failed: " + res.status);
  return res.json();
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") {
      return jsonResponse({ error: "method not allowed" }, 405);
    }

    const auth = request.headers.get("Authorization") || "";
    if (auth !== "Bearer " + env.APP_SECRET) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return jsonResponse({ error: "invalid JSON" }, 400);
    }

    const subscription = body && body.subscription;
    const checklistComplete = body && body.checklistComplete;
    if (!subscription || !subscription.endpoint) {
      return jsonResponse({ error: "missing subscription" }, 400);
    }

    // Same read-after-write propagation lag and retry/backoff logic that lived in
    // the client's syncSubscription before this moved server-side — see the
    // eclipse2026 error-log.md for how that was discovered and confirmed.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const file = await githubGetFile(env.GITHUB_PAT, SUBSCRIPTIONS_PATH);
        file.content[subscription.endpoint] = {
          subscription: subscription,
          checklistComplete: !!checklistComplete,
        };
        await githubPutFile(env.GITHUB_PAT, SUBSCRIPTIONS_PATH, file.content, file.sha, "Sync push subscription (via Worker)");
        return jsonResponse({ ok: true }, 200);
      } catch (e) {
        if (e.message === "conflict" && attempt < 2) {
          await sleep(2000 * (attempt + 1));
          continue;
        }
        return jsonResponse({ error: e.message }, 502);
      }
    }
  },
};
