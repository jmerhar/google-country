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
 * Package: uploads a signed `.crx` built WITHOUT an `update_url` (Verified CRX uploads). The store
 * verifies the signature against your registered public key, then re-signs with its own key for
 * distribution — so the store crx must not carry the self-hosted update_url (that lives only in the
 * crx served on Pages for Kiwi). Build it with `pack-crx.mjs --no-update`.
 *
 * Usage: node scripts/cws-publish.mjs <path-to.crx>
 */
import { createSign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
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
if (!pkgPath) fail("usage: cws-publish.mjs <path-to.crx>");
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

// The v2 (Verified CRX) upload is a raw media upload: the store only recognizes the body as a crx
// when told so via the X-Goog-Upload-* headers. Without them it rejects the package with
// INVALID_PACKAGE / PKG_MUST_UPDATE_AS_CRX ("you must update your item with a crx package").
const uploadHeaders = publisherId
  ? { ...auth, "X-Goog-Upload-Protocol": "raw", "X-Goog-Upload-File-Name": basename(pkgPath) }
  : auth;

console.log(`Uploading ${pkgPath} to ${publisherId ? "v2" : "v1.1"} …`);
const upload = await fetch(endpoints.upload, {
  method: publisherId ? "POST" : "PUT",
  headers: uploadHeaders,
  body: readFileSync(pkgPath),
});
const uploadBody = await upload.json().catch(() => ({}));
// Uploads can fail with HTTP 200 and report it in the body. Treat anything that isn't an explicit
// success as failure — the state enum differs between APIs (v2: SUCCEEDED/IN_PROGRESS/FAILED/
// NOT_FOUND; v1.1: SUCCESS/IN_PROGRESS/FAILURE/NOT_FOUND) — and surface any itemError. IN_PROGRESS
// means the package isn't processed yet, so don't publish on it.
const uploadState = uploadBody.uploadState;
const uploadErrors = uploadBody.itemError ?? uploadBody.item_error;
if (!upload.ok || (uploadState && !["SUCCESS", "SUCCEEDED"].includes(uploadState)) || uploadErrors?.length) {
  fail(`upload failed (${upload.status}, state ${uploadState ?? "?"}): ${JSON.stringify(uploadBody)}`);
}
console.log(`Upload OK: ${JSON.stringify(uploadBody)}`);

console.log("Submitting for review / publishing …");
const publish = await fetch(endpoints.publish, { method: "POST", headers: auth });
const publishBody = await publish.json().catch(() => ({}));
// Publish can also report hard errors in a 200 body; ITEM_PENDING_REVIEW is the normal success.
const publishStatus = publishBody.status ?? [];
const publishErrors = publishStatus.filter(
  (s) => !["OK", "ITEM_PENDING_REVIEW", "PUBLISHED_WITH_FRICTION_WARNING"].includes(s),
);
if (!publish.ok || publishErrors.length) {
  fail(`publish failed (${publish.status}): ${JSON.stringify(publishBody)}`);
}
console.log(`Publish requested: ${JSON.stringify(publishBody)}`);
