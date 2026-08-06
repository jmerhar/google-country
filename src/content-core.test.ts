import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installChromeMock, stubLocation, tick, type ChromeMock, type LocationMock } from "./test-utils";
import {
  applyAdHiding,
  applyOverride,
  buildWidget,
  detectDark,
  ensureLang,
  enforceSticky,
  mount,
  renderList,
  ROOT_ID,
  runContentScript,
  shouldHideAds,
  toggleFavourite,
} from "./content-core";
import { defaultState, type State } from "./shared";

const SEARCH = "https://www.google.com/search?q=coffee";
let mock: ChromeMock;
let loc: LocationMock;
const observers: MutationObserver[] = [];

function state(over: Partial<State> = {}): State {
  return { ...defaultState(), ...over };
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.body.style.backgroundColor = "";
  document.documentElement.lang = "";
  mock = installChromeMock({ override: null, favourites: [], lang: "en" });
  loc = stubLocation(SEARCH);
});

afterEach(() => {
  // Disconnect any re-injection observer before the next test's setup mutates the DOM.
  observers.forEach((o) => o.disconnect());
  observers.length = 0;
  vi.unstubAllGlobals();
});

describe("enforceSticky", () => {
  it("does nothing in Auto mode", async () => {
    expect(await enforceSticky(loc as unknown as Location)).toBe(false);
    expect(loc.replace).not.toHaveBeenCalled();
  });

  it("redirects to the corrected URL when the override isn't yet applied", async () => {
    mock.store.override = { code: "jp", strict: false };
    mock.store.lang = "en";
    expect(await enforceSticky(loc as unknown as Location)).toBe(true);
    expect(loc.replace).toHaveBeenCalledTimes(1);
    const target = new URL(loc.replace.mock.calls[0]![0] as string);
    expect(target.searchParams.get("gl")).toBe("jp");
    expect(target.searchParams.get("hl")).toBe("en");
  });

  it("is a no-op once the URL already satisfies the override (no loop)", async () => {
    mock.store.override = { code: "jp", strict: false };
    mock.store.lang = "en";
    loc.href = "https://www.google.com/search?q=coffee&gl=jp&hl=en";
    expect(await enforceSticky(loc as unknown as Location)).toBe(false);
    expect(loc.replace).not.toHaveBeenCalled();
  });
});

describe("ensureLang", () => {
  it("detects and persists the language once", async () => {
    mock.store.lang = "";
    const doc = { documentElement: { lang: "de-DE" } } as unknown as Document;
    const nav = { language: "fr-FR" } as unknown as Navigator;
    expect(await ensureLang(loc as unknown as Location, doc, nav)).toBe("de");
    expect(mock.store.lang).toBe("de");
  });

  it("keeps an already-detected language", async () => {
    mock.store.lang = "pt";
    await ensureLang(loc as unknown as Location);
    expect(mock.chrome.storage.sync.set).not.toHaveBeenCalled();
  });
});

describe("applyOverride", () => {
  it("stores the override, syncs the SW rule, and navigates with gl+hl", async () => {
    await applyOverride({ code: "JP", strict: false }, loc as unknown as Location);
    expect(mock.store.override).toEqual({ code: "JP", strict: false });
    expect(mock.chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "syncRule" });
    const target = new URL(loc.assign.mock.calls[0]![0] as string);
    expect(target.searchParams.get("gl")).toBe("jp");
    expect(target.searchParams.get("hl")).toBe("en");
  });

  it("clears the override for Auto and strips our params", async () => {
    loc.href = "https://www.google.com/search?q=coffee&gl=jp&hl=en&cr=countryJP";
    await applyOverride(null, loc as unknown as Location);
    expect(mock.store.override).toBeNull();
    const target = new URL(loc.assign.mock.calls[0]![0] as string);
    expect(target.searchParams.has("gl")).toBe(false);
    expect(target.searchParams.has("cr")).toBe(false);
  });

  it("still navigates when the service worker message rejects (e.g. Kiwi)", async () => {
    (mock.chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("no receiver"));
    await applyOverride({ code: "JP", strict: false }, loc as unknown as Location);
    expect(mock.store.override).toEqual({ code: "JP", strict: false });
    expect(loc.assign).toHaveBeenCalledTimes(1);
  });

  it("still navigates when there is no sendMessage at all", async () => {
    (mock.chrome.runtime as { sendMessage?: unknown }).sendMessage = undefined;
    await applyOverride(null, loc as unknown as Location);
    expect(loc.assign).toHaveBeenCalledTimes(1);
  });
});

describe("toggleFavourite", () => {
  it("adds then removes a favourite (uppercased)", async () => {
    expect(await toggleFavourite("jp")).toEqual(["JP"]);
    expect(mock.store.favourites).toEqual(["JP"]);
    expect(await toggleFavourite("JP")).toEqual([]);
  });
});

describe("renderList", () => {
  it("always offers Auto and lists all countries", () => {
    const list = document.createElement("div");
    renderList(list, state());
    expect(list.querySelector(".gco-auto")).toBeTruthy();
    expect(list.querySelectorAll(".gco-item[data-code]").length).toBeGreaterThan(200);
  });

  it("shows a Favourites section for starred countries", () => {
    const list = document.createElement("div");
    renderList(list, state({ favourites: ["JP"] }));
    const sections = [...list.querySelectorAll(".gco-section")].map((s) => s.textContent);
    expect(sections).toContain("Favourites");
    expect(list.querySelector('.gco-star.gco-fav')).toBeTruthy();
  });

  it("filters by name or code", () => {
    const list = document.createElement("div");
    renderList(list, state(), "japa");
    const names = [...list.querySelectorAll(".gco-name")].map((n) => n.textContent);
    expect(names).toContain("Japan");
    expect(names).not.toContain("Germany");
  });
});

describe("buildWidget", () => {
  function makeWidget(over: Partial<State> = {}) {
    const root = buildWidget(state(over));
    document.body.append(root);
    return {
      root,
      pill: root.querySelector<HTMLElement>(".gco-pill")!,
      panel: root.querySelector<HTMLElement>(".gco-panel")!,
      filter: root.querySelector<HTMLInputElement>(".gco-filter")!,
      strict: root.querySelector<HTMLInputElement>(".gco-strict input")!,
      hideAds: root.querySelector<HTMLInputElement>(".gco-ads input")!,
    };
  }

  it("shows the current selection on the pill", () => {
    const { root } = makeWidget({ override: { code: "JP", strict: false } });
    expect(root.querySelector(".gco-label")!.textContent).toBe("Japan");
  });

  it("labels an unknown override code with the uppercased code", () => {
    const { root } = makeWidget({ override: { code: "zz", strict: false } });
    expect(root.querySelector(".gco-label")!.textContent).toBe("ZZ");
  });

  it("closes the panel on an outside click", () => {
    const { pill, panel } = makeWidget();
    pill.click();
    expect(panel.hasAttribute("hidden")).toBe(false);
    document.body.click(); // outside the widget
    expect(panel.hasAttribute("hidden")).toBe(true);
  });

  it("toggles the panel open and closed via the pill", () => {
    const { pill, panel } = makeWidget();
    expect(panel.hasAttribute("hidden")).toBe(true);
    pill.click();
    expect(panel.hasAttribute("hidden")).toBe(false);
    expect(pill.getAttribute("aria-expanded")).toBe("true");
    pill.click();
    expect(panel.hasAttribute("hidden")).toBe(true);
  });

  it("closes the panel on Escape", () => {
    const { pill, panel } = makeWidget();
    pill.click();
    panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(panel.hasAttribute("hidden")).toBe(true);
  });

  it("filters the list as you type", () => {
    const { root, filter } = makeWidget();
    filter.value = "japa";
    filter.dispatchEvent(new Event("input", { bubbles: true }));
    const names = [...root.querySelectorAll(".gco-name")].map((n) => n.textContent);
    expect(names).toContain("Japan");
    expect(names).not.toContain("Germany");
  });

  it("applies the chosen country (with the Strict toggle) by navigating", async () => {
    const { root, strict } = makeWidget();
    strict.checked = true;
    root.querySelector<HTMLElement>('.gco-item[data-code="JP"] .gco-choose')!.click();
    await tick();
    expect(mock.store.override).toEqual({ code: "JP", strict: true });
    expect(loc.assign).toHaveBeenCalledTimes(1);
  });

  it("returns to Auto via the Auto entry", async () => {
    const { root } = makeWidget({ override: { code: "JP", strict: false } });
    root.querySelector<HTMLElement>(".gco-auto")!.click();
    await tick();
    expect(mock.store.override).toBeNull();
  });

  it("stars a country without navigating", async () => {
    const { root } = makeWidget();
    root.querySelector<HTMLElement>('.gco-item[data-code="JP"] [data-star]')!.click();
    await tick();
    expect(mock.store.favourites).toEqual(["JP"]);
    expect(loc.assign).not.toHaveBeenCalled();
    expect(root.querySelector('.gco-item[data-code="JP"] .gco-star.gco-fav')).toBeTruthy();
  });

  it("reflects and toggles the hide-ads option, applying to the page without navigating", async () => {
    const ad = document.createElement("div");
    ad.id = "tads";
    document.body.append(ad);
    const { hideAds } = makeWidget({ override: { code: "JP", strict: false }, hideAds: false });
    expect(hideAds.checked).toBe(false);

    hideAds.checked = true;
    hideAds.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    expect(mock.store.hideAds).toBe(true);
    expect(ad.classList.contains("gco-ad-hidden")).toBe(true);
    expect(loc.assign).not.toHaveBeenCalled();
  });
});

describe("shouldHideAds", () => {
  it("hides only when the option is on and an override is active", () => {
    expect(shouldHideAds(state({ override: { code: "jp", strict: false }, hideAds: true }))).toBe(true);
    expect(shouldHideAds(state({ override: { code: "jp", strict: false }, hideAds: false }))).toBe(false);
    expect(shouldHideAds(state({ override: null, hideAds: true }))).toBe(false);
  });
});

describe("applyAdHiding", () => {
  function seedAds() {
    document.body.innerHTML =
      '<div id="tads"></div><div data-text-ad></div>' +
      '<div class="commercial-unit-desktop-top"></div><div id="organic">result</div>';
  }

  it("collapses ad blocks and leaves organic results untouched", () => {
    seedAds();
    expect(applyAdHiding(true)).toBe(3);
    expect(document.querySelectorAll(".gco-ad-hidden")).toHaveLength(3);
    expect(document.getElementById("organic")!.classList.contains("gco-ad-hidden")).toBe(false);
  });

  it("reveals previously hidden ads", () => {
    seedAds();
    applyAdHiding(true);
    expect(applyAdHiding(false)).toBe(0);
    expect(document.querySelectorAll(".gco-ad-hidden")).toHaveLength(0);
  });
});

describe("detectDark", () => {
  it("reports dark for a dark page background and light for a light one", () => {
    document.body.style.backgroundColor = "rgb(32, 33, 36)";
    expect(detectDark()).toBe(true);
    document.body.style.backgroundColor = "rgb(255, 255, 255)";
    expect(detectDark()).toBe(false);
  });

  it("falls back to prefers-color-scheme when the background is transparent", () => {
    document.body.style.backgroundColor = "rgba(0, 0, 0, 0)";
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    expect(detectDark()).toBe(true);
  });

  it("defaults to light when the background can't be parsed", () => {
    document.body.style.backgroundColor = "";
    expect(detectDark()).toBe(false);
  });
});

describe("mount", () => {
  it("injects once as a fixed pill on the body and is idempotent", () => {
    const first = mount(state());
    expect(document.getElementById(ROOT_ID)).toBe(first);
    expect(first.classList.contains("gco-fixed")).toBe(true);
    expect(first.parentElement).toBe(document.body);
    const second = mount(state());
    expect(second).toBe(first);
    expect(document.querySelectorAll(`#${ROOT_ID}`)).toHaveLength(1);
  });

  it("applies the detected theme class", () => {
    document.body.style.backgroundColor = "rgb(20, 20, 20)";
    expect(mount(state()).classList.contains("gco-dark")).toBe(true);
  });
});

describe("runContentScript", () => {
  it("mounts the widget when there is no override", async () => {
    const observer = await runContentScript();
    if (observer) observers.push(observer);
    await tick();
    expect(document.getElementById(ROOT_ID)).toBeTruthy();
  });

  it("re-mounts if the widget root is removed (Google re-render)", async () => {
    const observer = await runContentScript();
    if (observer) observers.push(observer);
    await tick();
    document.getElementById(ROOT_ID)!.remove();
    await tick(); // the MutationObserver should re-inject it
    expect(document.getElementById(ROOT_ID)).toBeTruthy();
  });

  it("redirects instead of mounting when a sticky override needs applying", async () => {
    mock.store.override = { code: "jp", strict: false };
    mock.store.lang = "en";
    const observer = await runContentScript();
    if (observer) observers.push(observer);
    expect(loc.replace).toHaveBeenCalledTimes(1);
    expect(document.getElementById(ROOT_ID)).toBeNull();
  });

  // href already satisfies the override, so enforceSticky is a no-op and we mount (and hide ads).
  const SATISFIED = "https://www.google.com/search?q=coffee&gl=jp&hl=en";

  it("hides ads on mount when an override is active and the option is on", async () => {
    mock.store.override = { code: "jp", strict: false };
    mock.store.lang = "en";
    mock.store.hideAds = true;
    loc.href = SATISFIED;
    document.body.innerHTML = '<div id="tads"></div>';
    const observer = await runContentScript();
    if (observer) observers.push(observer);
    await tick();
    expect(document.getElementById("tads")!.classList.contains("gco-ad-hidden")).toBe(true);
  });

  it("re-hides ads injected after mount (Google lazy-loads them)", async () => {
    mock.store.override = { code: "jp", strict: false };
    mock.store.lang = "en";
    loc.href = SATISFIED;
    const observer = await runContentScript();
    if (observer) observers.push(observer);
    await tick();
    const ad = document.createElement("div");
    ad.id = "tads";
    document.body.append(ad); // triggers the observer
    await tick();
    expect(ad.classList.contains("gco-ad-hidden")).toBe(true);
  });

  it("leaves ads visible when there is no override", async () => {
    document.body.innerHTML = '<div id="tads"></div>';
    const observer = await runContentScript();
    if (observer) observers.push(observer);
    await tick();
    expect(document.getElementById("tads")!.classList.contains("gco-ad-hidden")).toBe(false);
  });

  it("stops re-hiding late-loaded ads once the toggle is turned off mid-page", async () => {
    mock.store.override = { code: "jp", strict: false };
    mock.store.lang = "en";
    mock.store.hideAds = true;
    loc.href = SATISFIED;
    const observer = await runContentScript();
    if (observer) observers.push(observer);
    await tick();

    // Turn hiding off via the panel toggle (no reload).
    const toggle = document.querySelector<HTMLInputElement>(`#${ROOT_ID} .gco-ads input`)!;
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();

    // An ad injected afterwards must stay visible — the observer must honour the live toggle, not a
    // value snapshotted at load (regression: it used to re-hide with the stale captured value).
    const ad = document.createElement("div");
    ad.id = "tads";
    document.body.append(ad);
    await tick();
    expect(ad.classList.contains("gco-ad-hidden")).toBe(false);
  });
});
