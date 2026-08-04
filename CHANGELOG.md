# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Add an entry under a new `## [x.y.z]` heading **before** cutting a release — the release workflow
publishes that section as the GitHub Release notes, and `make release` refuses to tag a version with
no changelog entry.

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
