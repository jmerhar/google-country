/**
 * Content-script logic: the in-page country dropdown plus the sticky-override fallback.
 *
 * Split out from the `content.ts` entry so the whole module can be imported and exercised in tests
 * without triggering the browser bootstrap. Everything here is written to accept its DOM/`location`
 * dependencies as arguments (defaulting to the live globals) so jsdom tests can drive it directly.
 *
 * Applying a selection always navigates the page (a full reload with the new params), so the pill is
 * rebuilt fresh on each load and simply reflects the current URL/state — there is no long-lived UI
 * state to keep in sync beyond the in-place favourite/filter updates while the panel is open.
 */
import {
  applyToUrl,
  defaultState,
  desiredParams,
  detectLang,
  needsUpdate,
  type Override,
  type State,
} from "./shared";
import { COUNTRIES, countryByCode, flagEmoji } from "./countries";

export const ROOT_ID = "gco-root";

/** Selectors tried in order for a seamless inline anchor near the top of the results page. */
const ANCHOR_SELECTORS = [
  "#hdtb-msb", // desktop tools/filters bar
  "#top_nav", // mobile tabs bar
  "form[action='/search']",
  "#tsf",
  "#search",
];

/* --------------------------------- state --------------------------------- */

async function getState(): Promise<State> {
  return (await chrome.storage.sync.get(defaultState())) as State;
}

async function patchState(patch: Partial<State>): Promise<void> {
  await chrome.storage.sync.set(patch);
}

/* ------------------------------- behaviour ------------------------------- */

/**
 * Sticky fallback: if an override is active and the current URL doesn't already satisfy it, replace
 * the location with the corrected URL. A no-op when the network-layer DNR rule already fixed the URL
 * (so the two enforcement layers never fight). Returns whether a redirect was issued.
 */
export async function enforceSticky(loc: Location = location): Promise<boolean> {
  const state = await getState();
  if (!state.override) return false;
  const params = desiredParams(state.override, state.lang);
  if (!needsUpdate(loc.href, params)) return false;
  loc.replace(applyToUrl(loc.href, params));
  return true;
}

/** Detect and persist the interface language once, so `hl` can be pinned on every override. */
export async function ensureLang(
  loc: Location = location,
  doc: Document = document,
  nav: Navigator = navigator,
): Promise<string> {
  const state = await getState();
  if (state.lang) return state.lang;
  const lang = detectLang(loc.href, doc.documentElement.lang, nav.language);
  await patchState({ lang });
  return lang;
}

/** Persist a selection (or `null` for Auto) and navigate the current page to apply it immediately. */
export async function applyOverride(
  override: Override | null,
  loc: Location = location,
  doc: Document = document,
  nav: Navigator = navigator,
): Promise<void> {
  const lang = await ensureLang(loc, doc, nav);
  await patchState({ override });
  loc.assign(applyToUrl(loc.href, desiredParams(override, lang)));
}

/** Toggle a country's favourite status and return the new ordered favourites list. */
export async function toggleFavourite(code: string): Promise<string[]> {
  const { favourites } = await getState();
  const cc = code.toUpperCase();
  const next = favourites.includes(cc)
    ? favourites.filter((c) => c !== cc)
    : [...favourites, cc];
  await patchState({ favourites: next });
  return next;
}

/* --------------------------------- view ---------------------------------- */

type Attrs = Record<string, string>;

function h(tag: string, attrs: Attrs = {}, ...children: (Node | string)[]): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const child of children) node.append(child);
  return node;
}

function countryRow(country: { name: string; code: string }, isFav: boolean): HTMLElement {
  const row = h("div", { class: "gco-item", "data-code": country.code });
  const choose = h(
    "button",
    { class: "gco-choose", type: "button" },
    h("span", { class: "gco-flag" }, flagEmoji(country.code)),
    h("span", { class: "gco-name" }, country.name),
    h("span", { class: "gco-code" }, country.code),
  );
  const star = h(
    "button",
    {
      class: `gco-star${isFav ? " gco-fav" : ""}`,
      type: "button",
      "data-star": country.code,
      "aria-label": isFav ? `Unfavourite ${country.name}` : `Favourite ${country.name}`,
      title: isFav ? "Remove from favourites" : "Add to favourites",
    },
    isFav ? "★" : "☆",
  );
  row.append(choose, star);
  return row;
}

/** Render the (filtered) favourites-first list into `list`. */
export function renderList(list: HTMLElement, state: State, filter = ""): void {
  const q = filter.trim().toLowerCase();
  const match = (c: { name: string; code: string }) =>
    !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);

  list.textContent = "";
  list.append(
    h("button", { class: "gco-item gco-auto", type: "button", "data-code": "" },
      h("span", { class: "gco-flag" }, "🌐"),
      h("span", { class: "gco-name" }, "Auto (my location)")),
  );

  const favs = state.favourites
    .map((code) => countryByCode(code))
    .filter((c): c is { name: string; code: string } => Boolean(c))
    .filter(match);
  if (favs.length) {
    list.append(h("div", { class: "gco-section" }, "Favourites"));
    for (const c of favs) list.append(countryRow(c, true));
  }

  const favSet = new Set(state.favourites);
  list.append(h("div", { class: "gco-section" }, "All countries"));
  for (const c of COUNTRIES) if (match(c)) list.append(countryRow(c, favSet.has(c.code)));
}

/** The current selection's label + flag for the pill. */
function pillFace(state: State): { flag: string; label: string } {
  if (!state.override) return { flag: "🌐", label: "Auto" };
  const country = countryByCode(state.override.code);
  return {
    flag: flagEmoji(state.override.code),
    label: country ? country.name : state.override.code.toUpperCase(),
  };
}

/**
 * Build the pill + panel and wire all interactions. The returned element is the self-contained root
 * that gets injected into the page.
 */
export function buildWidget(state: State): HTMLElement {
  const root = h("div", { id: ROOT_ID, class: "gco-root" });

  const face = pillFace(state);
  const pill = h(
    "button",
    { class: "gco-pill", type: "button", "aria-haspopup": "true", "aria-expanded": "false" },
    h("span", { class: "gco-flag" }, face.flag),
    h("span", { class: "gco-label" }, face.label),
    h("span", { class: "gco-caret" }, "▾"),
  );

  const panel = h("div", { class: "gco-panel", role: "dialog", hidden: "" });
  const filter = h("input", {
    class: "gco-filter",
    type: "search",
    placeholder: "Search countries…",
    "aria-label": "Search countries",
  }) as HTMLInputElement;
  const list = h("div", { class: "gco-list", role: "listbox" });
  const strictWrap = h("label", { class: "gco-strict" });
  const strict = h("input", { type: "checkbox" }) as HTMLInputElement;
  strict.checked = Boolean(state.override?.strict);
  strictWrap.append(strict, document.createTextNode(" Strict — only pages from this country"));
  panel.append(filter, list, strictWrap);
  root.append(pill, panel);

  renderList(list, state, "");

  const open = (isOpen: boolean) => {
    panel.toggleAttribute("hidden", !isOpen);
    pill.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) filter.focus();
  };
  const onDocClick = (e: Event) => {
    if (!root.contains(e.target as Node)) open(false);
  };

  pill.addEventListener("click", () => {
    const willOpen = panel.hasAttribute("hidden");
    open(willOpen);
    if (willOpen) document.addEventListener("click", onDocClick, { capture: true });
    else document.removeEventListener("click", onDocClick, { capture: true });
  });
  panel.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape") open(false);
  });
  filter.addEventListener("input", () => renderList(list, state, filter.value));

  // One delegated handler for both choosing a country and toggling a favourite.
  list.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const starBtn = target.closest<HTMLElement>("[data-star]");
    if (starBtn) {
      void toggleFavourite(starBtn.dataset.star!).then((favourites) => {
        state.favourites = favourites;
        renderList(list, state, filter.value);
      });
      return;
    }
    const item = target.closest<HTMLElement>("[data-code]");
    if (!item) return;
    const code = item.getAttribute("data-code") ?? "";
    void applyOverride(code ? { code, strict: strict.checked } : null);
  });

  return root;
}

/* -------------------------------- mounting ------------------------------- */

/** Pick the insertion point: a seamless inline anchor if found, else a fixed-position fallback. */
export function findAnchor(doc: Document = document): { host: Element; inline: boolean } {
  for (const sel of ANCHOR_SELECTORS) {
    const el = doc.querySelector(sel);
    if (el) return { host: el, inline: true };
  }
  return { host: doc.body, inline: false };
}

/** Inject the widget once. Returns the root (existing or new); idempotent by `ROOT_ID`. */
export function mount(state: State, doc: Document = document): HTMLElement {
  const existing = doc.getElementById(ROOT_ID);
  if (existing) return existing;
  const { host, inline } = findAnchor(doc);
  const root = buildWidget(state);
  if (!inline) root.classList.add("gco-fixed");
  if (inline) host.insertBefore(root, host.firstChild);
  else host.appendChild(root);
  return root;
}

/**
 * Bootstrap for the live content script: enforce the sticky override immediately, then mount the
 * widget as soon as the DOM allows and re-mount if Google re-renders the results and drops it.
 * Returns the re-injection observer (undefined when a redirect is underway) so callers/tests can
 * disconnect it.
 *
 * The observer watches `document.documentElement`, which exists at `document_start` even before
 * `<body>`. That makes it do double duty: it fires when `<body>`/results first appear (initial
 * mount) and again whenever Google's dynamic re-render drops our root — so re-injection works
 * regardless of exactly when this async bootstrap resolves relative to page parsing.
 */
export async function runContentScript(): Promise<MutationObserver | undefined> {
  if (await enforceSticky()) return undefined; // a redirect is underway; the reloaded page will mount.
  await ensureLang();

  const state = await getState();
  const tryMount = () => {
    if (document.body) mount(state);
  };

  tryMount(); // in case the body already exists by the time storage resolved
  const observer = new MutationObserver(() => {
    if (!document.getElementById(ROOT_ID)) tryMount();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  return observer;
}
