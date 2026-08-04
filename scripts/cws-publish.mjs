#!/usr/bin/env node
/**
 * Upload and publish the extension to the Chrome Web Store using a Google Cloud **service account**
 * (server-to-server auth — no interactive OAuth, no expiring refresh token). This is the direction
 * Google is steering automated publishing toward.
 *
 * Setup (one-time):
 *   1. Google Cloud project → enable the "Chrome Web Store API".
 *   2. Create a service account and a JSON key for it.
 *   3. Chrome Web Store Developer Dashboard → Account → add the service account's email (this links
 *      it to your publisher account; only one service account per publisher is allowed).
 *   4. Store the JSON key as the CWS_SERVICE_ACCOUNT_KEY secret and the item ID as CWS_EXTENSION_ID.
 *
 * Auth: the service account key self-signs a JWT which is exchanged for an access token scoped to
 * `chromewebstore` — the standard two-legged OAuth flow, implemented here with node:crypto so no
 * extra dependencies or gcloud are needed.
 *
 * Endpoints: defaults to the v1.1 API (no publisher ID needed). If CWS_PUBLISHER_ID is set, uses the
 * v2 `publishers/{id}` endpoints instead. (v1 is supported until 2026-10-15; migrating later is just
 * setting CWS_PUBLISHER_ID.)
 *
 * Package: uploads the signed `.crx` (signed with CRX_PRIVATE_KEY), which is what "Verified CRX
 * uploads" requires. The store verifies the signature against the registered public key, then
 * re-signs with its own key for distribution (the extension ID is unchanged).
 *
 * Usage: node scripts/cws-publish.mjs <path-to.crx>
 */
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const pkgPath = process.argv[2];
// Key from CWS_SERVICE_ACCOUNT_KEY (JSON, as in CI) or CWS_SERVICE_ACCOUNT_KEY_FILE (a path, handy
// for local runs so the JSON blob need not live in an env var).
const keyJson = process.env.CWS_SERVICE_ACCOUNT_KEY
  || (process.env.CWS_SERVICE_ACCOUNT_KEY_FILE ? readFileSync(process.env.CWS_SERVICE_ACCOUNT_KEY_FILE, "utf8") : "");
const extensionId = process.env.CWS_EXTENSION_ID;
const publisherId = process.env.CWS_PUBLISHER_ID; // optional → selects v2 endpoints

if (!pkgPath) fail("usage: cws-publish.mjs <path-to.crx>");
if (!keyJson) fail("set CWS_SERVICE_ACCOUNT_KEY (JSON) or CWS_SERVICE_ACCOUNT_KEY_FILE (path)");
if (!extensionId) fail("CWS_EXTENSION_ID is not set");

function fail(msg) {
  console.error(`cws-publish: ${msg}`);
  process.exit(1);
}

const b64url = (input) => Buffer.from(input).toString("base64url");

/** Mint a short-lived access token from the service-account key via the JWT-bearer grant. */
async function accessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/chromewebstore",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = createSign("RSA-SHA256").update(`${header}.${claim}`).sign(key.private_key, "base64url");
  const assertion = `${header}.${claim}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const body = await res.json();
  if (!res.ok) fail(`token exchange failed: ${JSON.stringify(body)}`);
  return body.access_token;
}

const endpoints = publisherId
  ? {
      upload: `https://chromewebstore.googleapis.com/upload/v2/publishers/${publisherId}/items/${extensionId}:upload`,
      publish: `https://chromewebstore.googleapis.com/v2/publishers/${publisherId}/items/${extensionId}:publish`,
    }
  : {
      upload: `https://www.googleapis.com/upload/chromewebstore/v1.1/items/${extensionId}`,
      publish: `https://www.googleapis.com/chromewebstore/v1.1/items/${extensionId}/publish`,
    };

const token = await accessToken(JSON.parse(keyJson));
const auth = { Authorization: `Bearer ${token}`, "x-goog-api-version": "2" };

console.log(`Uploading ${pkgPath} to ${publisherId ? "v2" : "v1.1"} …`);
const upload = await fetch(endpoints.upload, {
  method: publisherId ? "POST" : "PUT",
  headers: auth,
  body: readFileSync(pkgPath),
});
const uploadBody = await upload.json().catch(() => ({}));
if (!upload.ok || uploadBody.uploadState === "FAILURE") {
  fail(`upload failed (${upload.status}): ${JSON.stringify(uploadBody)}`);
}
console.log(`Upload OK: ${JSON.stringify(uploadBody)}`);

console.log("Submitting for review / publishing …");
const publish = await fetch(endpoints.publish, { method: "POST", headers: auth });
const publishBody = await publish.json().catch(() => ({}));
if (!publish.ok) fail(`publish failed (${publish.status}): ${JSON.stringify(publishBody)}`);
console.log(`Publish requested: ${JSON.stringify(publishBody)}`);
