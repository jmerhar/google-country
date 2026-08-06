# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Add an entry under a new `## [x.y.z]` heading **before** cutting a release — the release workflow
publishes that section as the GitHub Release notes, and `make release` refuses to tag a version with
no changelog entry.

## [0.2.0] - 2026-08-06

### Added
- Sponsored results are now hidden while a country override is active. Google serves ads from your
  real location regardless of `gl`/`cr`, so they'd otherwise stay in the wrong country; hiding them
  keeps the page consistent with the chosen country. A **Hide sponsored results while overriding**
  toggle in the panel turns it off (on by default), and it applies to the current page immediately
  without a reload. No new permissions — the ad blocks are hidden in the content script.

## [0.1.6] - 2026-08-04

### Fixed
- The dropdown no longer leaks an outside-click listener when closed via Escape, an outside click, or
  a Google page re-render.
- The interface language is now resolved before the sticky override is enforced, so an override
  whose language hadn't been detected yet (e.g. state synced from another device) can't briefly let
  Google infer the language from the country.

## [0.1.5] - 2026-08-04

### Fixed
- The self-hosted `.crx` now includes an `update_url`, so Kiwi/Chrome can auto-update it and the
  **Update** button works. Previously a manually-installed crx had no update source and never
  updated. (The store package keeps *no* `update_url` — the Web Store manages those updates.)
  Note: because the build you already have installed has no `update_url`, install this version's crx
  once manually; updates after that are automatic.

## [0.1.4] - 2026-08-04

### Fixed
- Selecting **Auto (my location)** now reliably clears the country. Previously a race with the
  removal of the network redirect rule could re-apply the previous country to the cleared page, so
  after switching result tabs you could still see that country's results. The content script now
  waits for the service worker to update the rule before navigating.

## [0.1.3] - 2026-08-04

### Changed
- Request `declarativeNetRequestWithHostAccess` instead of the broad `declarativeNetRequest`, so the
  extension no longer asks to "block content on any page" — it only acts on Google Search, which it
  already has host access to. Removes a scary permission prompt (e.g. on Kiwi) with no loss of
  functionality.

## [0.1.2] - 2026-08-04

### Changed
- New app icon: a cleaner globe mark (no map marker), used consistently across the extension, the
  store listing, and the website.

## [0.1.1] - 2026-08-04

### Fixed
- The country pill is now a fixed, unobtrusive control instead of being spliced into Google's
  results header, which broke the page layout on some result pages.
- Dark mode now follows Google's own theme (detected from the page background) rather than only the
  operating system's `prefers-color-scheme`, so it renders correctly when Google is dark but the OS
  is light.

### Changed
- Reworded the store-facing description to drop technical URL-parameter jargon.

### Added
- Releases now publish a signed `.crx` + `updates.xml`, and release notes are sourced from this
  changelog.

## [0.1.0] - 2026-08-03

### Added
- Initial release: a country-override dropdown for Google Search that sets the search country
  (and optionally restricts results to it) while pinning the interface language, so switching
  country never changes your language.
- Sticky selection enforced via `declarativeNetRequest` with a content-script fallback (also works
  on Kiwi Browser for Android).
- Favourites pinned above the full ISO 3166-1 country list.
- TypeScript source bundled with esbuild, Vitest test suite with a coverage gate, and
  zip/crx/Chrome Web Store release automation.
