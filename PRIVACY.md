# Privacy Policy — Google Country Override

_Last updated: 2026-08-04_

**Google Country Override does not collect, transmit, or sell any personal data.**

## What the extension stores

The extension saves only your own settings so it can work across searches:

- the country you selected (or "Auto"),
- whether "Strict" is enabled,
- your list of favourite countries,
- the interface language it detected once, so your language stays fixed when you change country.

These settings are stored using Chrome's `storage.sync` API. They live in your own browser profile
and, if you are signed into Chrome, sync across your devices via your Google account. They are never
sent to the developer or any third party — the extension has no backend server and makes no analytics
or tracking requests.

## What the extension accesses

The extension runs only on Google Search pages. It reads and adjusts the search URL's query
parameters (to apply your chosen country while keeping your language) and injects the country
dropdown into the page. It does not read your search results, browsing history, or any page content
beyond what is needed to place and operate the dropdown.

## Permissions

- **storage** — save the settings listed above.
- **declarativeNetRequest** — rewrite Google Search request URLs to apply the chosen country.
- **Host access to Google Search domains** — run the dropdown and adjust the search URL on those
  pages only.

## Contact

Questions? Open an issue at https://github.com/jmerhar/google-country/issues
