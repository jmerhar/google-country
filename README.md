# Google Country Override

A Chrome/Chromium extension that adds a country dropdown to the Google search results page so you
can search **as if you were in another country** — without changing your language. Pick any country,
pin favourites to the top, and the choice sticks across searches until you change it.

## What it does

- Injects a small, native-looking country **pill** into the results header.
- Picking a country reloads the search from that country and keeps the selection for every
  subsequent search (sticky) until you pick another or choose **Auto (my location)**.
- **Favourites** (starred countries) are pinned above the full country list.
- A **Strict** toggle hard-restricts results to that country's pages.
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

1. Download `google-country-<version>.zip` from the [Releases](../../releases) page and unzip it.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the
   unzipped folder.

### Chrome Web Store

Once published, install in one click from the store listing (auto-updates). *(Link added when live.)*

### `.crx` (Kiwi / enterprise)

Each release also ships a signed `google-country-<version>.crx` and an `updates.xml`. Modern desktop
Chrome blocks `.crx` installs from outside the Web Store, so this path is mainly for **Kiwi Browser
on Android** and enterprise force-install policies.

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

Releases are cut from version tags:

```
make keygen                 # once: generate key.pem, then store it as the CRX_PRIVATE_KEY secret
make release VERSION=1.2.3  # bump package.json, tag v1.2.3, and push (triggers the release workflow)
```

The **Release** workflow builds `dist/` and produces a **zip**, a signed **`.crx` + `updates.xml`**
(when `CRX_PRIVATE_KEY` is set), attaches them to a GitHub Release, publishes the crx/updates.xml to
GitHub Pages, and uploads to the **Chrome Web Store** (when the CWS secrets are set).

### Required secrets

| Secret | Used for |
|--------|----------|
| `CODECOV_TOKEN`, `COVERAGE_PAGES_TOKEN` | CI: Codecov upload + coverage-site publish |
| `CRX_PRIVATE_KEY` | Sign the `.crx` (stable extension ID) |
| `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `CWS_EXTENSION_ID` | Chrome Web Store publishing |

The `.crx` and CWS steps skip cleanly when their secrets are absent, so tagging still ships the zip.

## License

GPL-3.0-or-later.
