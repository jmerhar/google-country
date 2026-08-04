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
 *   4. In CI, store the JSON key as the CWS_SERVICE_ACCOUNT_KEY secret. Locally, place it at
 *      secrets/cws-service-account.json (git-ignored). The non-secret item/publisher IDs live in the
 *      committed cws.json.
 *
 * Auth: the service account key self-signs a JWT which is exchanged for an access token scoped to
 * `chromewebstore` — the standard two-legged OAuth flow, implemented here with node:crypto so no
 * extra dependencies or gcloud are needed.
 *
 * Endpoints: uses the v2 `publishers/{id}` endpoints when a publisher ID is set (cws.json, or the
 * CWS_PUBLISHER_ID override), else the legacy v1.1 API. (v1 is supported until 2026-10-15.)
 *
 * Package: uploads the ZIP. The Web Store re-signs and manages updates, so the store package must
 * not carry a self-hosted `update_url` — hence we upload the plain zip here, while the self-hosted
 * crx (served on Pages for Kiwi) is the one that gets an `update_url`. (If you later opt into
 * Verified CRX uploads, switch this to a signed crx built without an `update_url`.)
 *
 * Usage: node scripts/cws-publish.mjs <path-to.zip>
 */
import { createSign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Non-secret identifiers live in the committed cws.json; env vars override them when set (e.g. CI).
const cfg = existsSync(join(ROOT, "cws.json")) ? JSON.parse(readFileSync(join(ROOT, "cws.json"), "utf8")) : {};
const extensionId = process.env.CWS_EXTENSION_ID || cfg.extensionId;
const publisherId = process.env.CWS_PUBLISHER_ID || cfg.publisherId || undefined; // set → v2 endpoints

// The service-account key is the only secret here: inline JSON (CWS_SERVICE_ACCOUNT_KEY, used in CI),
// an explicit path (CWS_SERVICE_ACCOUNT_KEY_FILE), or the default secrets/ file for local runs.
const keyFile = process.env.CWS_SERVICE_ACCOUNT_KEY_FILE || join(ROOT, "secrets", "cws-service-account.json");
const keyJson = process.env.CWS_SERVICE_ACCOUNT_KEY || (existsSync(keyFile) ? readFileSync(keyFile, "utf8") : "");

const pkgPath = process.argv[2];
if (!pkgPath) fail("usage: cws-publish.mjs <path-to.zip>");
if (!keyJson) fail("no service-account key (set CWS_SERVICE_ACCOUNT_KEY or add secrets/cws-service-account.json)");
if (!extensionId) fail("no extension id (set cws.json extensionId or CWS_EXTENSION_ID)");

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
