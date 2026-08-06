# Google Country Override

[![CI](https://github.com/jmerhar/google-country/actions/workflows/ci.yml/badge.svg)](https://github.com/jmerhar/google-country/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/jmerhar/google-country/branch/main/graph/badge.svg)](https://app.codecov.io/gh/jmerhar/google-country)
[![Release](https://img.shields.io/github/v/release/jmerhar/google-country?sort=semver)](https://github.com/jmerhar/google-country/releases)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

A Chrome/Chromium extension that adds a country dropdown to the Google search results page so you
can search **as if you were in another country** — without changing your language. Pick any country,
pin favourites to the top, and the choice sticks across searches until you change it.

## What it does

- Injects a small, native-looking country **pill** into the results header.
- Picking a country reloads the search from that country and keeps the selection for every
  subsequent search (sticky) until you pick another or choose **Auto (my location)**.
- **Favourites** (starred countries) are pinned above the full country list.
- A **Strict** toggle hard-restricts results to that country's pages.
- **Sponsored results are hidden while a country is overridden** (Google serves ads from your real
  location regardless of `gl`/`cr`, so they'd otherwise stay in the wrong country). Toggle it off in
  the panel to show them.
- **Your language never changes** when you switch country.

### How it maps to Google's URL parameters

| Param | Meaning | This extension |
|-------|---------|----------------|
| `gl`  | Country **bias** — "search as if I'm in country X" | Set to the chosen country (lowercase, e.g. `gl=jp`) |
| `cr`  | Country **restrict** — only pages from that country | Added only when **Strict** is on (e.g. `cr=countryJP`) |
| `hl`  | Interface/results **language** | **Pinned** to your detected language so switching country never changes it |
| `lr`  | Content-language restrict | Never touched |

Why pin `hl`? When `hl` is absent, Google infers the language from your locale — which includes
`gl` — so `gl=jp` alone tends to flip the page into Japanese. Pinning `hl` to the language Google
was already serving you keeps the experience in your language regardless of the country you pick.

## Install

### From a release zip (desktop, Load unpacked)

1. Download the ZIP — latest stable link: <https://jmerhar.github.io/google-country/google-country.zip>
   (or a specific version from the [Releases](../../releases) page) — and unzip it.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the
   unzipped folder.

### Chrome Web Store

One-click install with auto-updates. The store link — and whether the listing has cleared review
yet — is shown on the [landing page](https://jmerhar.github.io/google-country/); it's derived from
`cws.json` (`published`), so the status lives in one place rather than being repeated here.

### `.crx` (Kiwi / enterprise)

Latest signed crx: <https://jmerhar.github.io/google-country/google-country.crx> (with `updates.xml`
alongside for auto-update). Modern desktop Chrome blocks `.crx` installs from outside the Web Store,
so this path is mainly for **Kiwi Browser on Android** and enterprise force-install policies. The
[landing page](https://jmerhar.github.io/google-country/) links both downloads directly.

### Kiwi Browser (Android)

Kiwi is Chromium-based and can run this extension. In Kiwi: **⋮ → Extensions**, enable developer
mode, and install the `.crx` (or a `.zip`/unpacked folder). Kiwi's Manifest V3 support is
experimental and version-dependent: if the background service worker or `declarativeNetRequest`
isn't available, the extension falls back to enforcing the sticky country in the content script
(one brief redirect per search). Verify against your installed Kiwi build.

## Usage

- Click the pill in the results header to open the panel.
- Type to filter, click a country to search from there, or click the ★ to (un)favourite it.
- Tick **Strict** to also restrict results to that country's pages (`cr`).
- Untick **Hide sponsored results while overriding** if you'd rather see Google's ads (they reflect
  your real location, not the overridden country).
- Choose **Auto (my location)** to clear the override and return to your real location.

> Note: flag emoji don't render on Windows Chrome — you'll see the two-letter code instead.

## Development

```
make install     # install dependencies
make dev         # rebuild dist/ on change; reload the unpacked extension after changes
make check       # lint + type-check + tests + coverage gate (run before committing)
make build       # bundle src/ into dist/
make help        # list all targets
```

The source is TypeScript in `src/`; `scripts/build.mjs` bundles it with esbuild into `dist/`, which
is the loadable/zippable/packable extension. `dist/manifest.json`'s `matches`/`host_permissions`
and `version` are generated from `src/google-domains.json` and `package.json` so they can't drift.

### Tests & coverage

Vitest (+ `@vitest/coverage-v8`, jsdom). `make coverage` runs the suite and enforces the line-coverage
gate in `scripts/coverage-report.py`. CI additionally uploads to Codecov (informational) and, on
green pushes to `main`, publishes the HTML report to the shared `jmerhar/coverage` site.

## Releasing

1. Add a `## [x.y.z]` section to [`CHANGELOG.md`](CHANGELOG.md) describing the changes (this becomes
   the GitHub Release body; `make release` refuses to tag a version with no changelog entry).
2. Cut the release:

```
make keygen                 # once: writes secrets/key.pem; also store it as the CRX_PRIVATE_KEY secret
make release VERSION=1.2.3  # bump package.json, tag v1.2.3, and push (triggers the release workflow)
```

The **Release** workflow re-runs lint/type-check/tests, builds `dist/`, then produces a **zip**, a
signed **`.crx` + `updates.xml`** (when `CRX_PRIVATE_KEY` is set), attaches them to a GitHub Release
with the changelog notes, and publishes to the **Chrome Web Store** via a service account (when its
key is set). The [Pages workflow](.github/workflows/pages.yml) serves the site + the latest crx.

### Configuration vs. secrets

Non-secret identifiers — the Chrome Web Store **item ID** and **publisher ID** — live in the
committed [`cws.json`](cws.json) (the single source of truth; the site derives its store URL from
it). Only two things are actually secret:

| Secret (CI) / local file | Used for |
|--------------------------|----------|
| `CRX_PRIVATE_KEY` / `secrets/key.pem` | Sign the `.crx`. Keep a backup — it can't be re-read from the CI secret |
| `CWS_SERVICE_ACCOUNT_KEY` / `secrets/cws-service-account.json` | Chrome Web Store publishing (service account) |
| `CODECOV_TOKEN`, `COVERAGE_PAGES_TOKEN` (CI only) | Codecov upload + coverage-site publish |

The `.crx` and CWS steps skip cleanly when their secrets are absent, so tagging still ships the zip.

### Running secret-dependent targets locally

Most `make` targets need no secrets. For the one that does — `make cws-publish` — just drop the two
files into `secrets/` (git-ignored): `secrets/key.pem` (or `make keygen`) and
`secrets/cws-service-account.json`. No env vars or exports needed; the IDs come from `cws.json`.

## License

GPL-3.0-or-later.
