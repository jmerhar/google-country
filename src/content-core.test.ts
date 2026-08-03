import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installChromeMock, stubLocation, tick, type ChromeMock, type LocationMock } from "./test-utils";
import {
  applyOverride,
  buildWidget,
  ensureLang,
  enforceSticky,
  findAnchor,
  mount,
  renderList,
  ROOT_ID,
  runContentScript,
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
  it("stores the override and navigates with gl+hl", async () => {
    await applyOverride({ code: "JP", strict: false }, loc as unknown as Location);
    expect(mock.store.override).toEqual({ code: "JP", strict: false });
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
    };
  }

  it("shows the current selection on the pill", () => {
    const { root } = makeWidget({ override: { code: "JP", strict: false } });
    expect(root.querySelector(".gco-label")!.textContent).toBe("Japan");
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
});

describe("findAnchor & mount", () => {
  it("prefers a known inline anchor", () => {
    document.body.innerHTML = '<div id="search"></div>';
    expect(findAnchor().inline).toBe(true);
  });

  it("falls back to the body as a fixed pill", () => {
    const anchor = findAnchor();
    expect(anchor.inline).toBe(false);
    expect(anchor.host).toBe(document.body);
  });

  it("injects once and is idempotent", () => {
    const first = mount(state());
    expect(document.getElementById(ROOT_ID)).toBe(first);
    expect(first.classList.contains("gco-fixed")).toBe(true); // no inline anchor → fixed
    const second = mount(state());
    expect(second).toBe(first);
    expect(document.querySelectorAll(`#${ROOT_ID}`)).toHaveLength(1);
  });
});

describe("runContentScript", () => {
  it("mounts the widget when there is no override", async () => {
    const observer = await runContentScript();
    if (observer) observers.push(observer);
    await tick();
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
});
