import { describe, expect, it } from "vitest";
import {
  applyToUrl,
  defaultState,
  desiredParams,
  detectLang,
  GOOGLE_DOMAINS,
  HOST_PERMISSION_PATTERNS,
  needsUpdate,
  primarySubtag,
  SEARCH_MATCH_PATTERNS,
} from "./shared";

const SEARCH = "https://www.google.com/search?q=coffee";

describe("desiredParams", () => {
  it("pins gl (lowercase) and hl, and removes cr when not strict", () => {
    expect(desiredParams({ code: "JP", strict: false }, "en")).toEqual({
      gl: "jp",
      hl: "en",
      cr: null,
    });
  });

  it("adds cr=countryXX (uppercase) when strict", () => {
    expect(desiredParams({ code: "jp", strict: true }, "de")).toEqual({
      gl: "jp",
      hl: "de",
      cr: "countryJP",
    });
  });

  it("removes all owned params in Auto mode (override null)", () => {
    expect(desiredParams(null, "en")).toEqual({ gl: null, cr: null, hl: null });
  });

  it("never emits an empty hl when the language is undetected", () => {
    const params = desiredParams({ code: "jp", strict: false }, "");
    expect(params).not.toHaveProperty("hl"); // leaves any existing hl untouched
    expect(params.gl).toBe("jp");
  });
});

describe("applyToUrl", () => {
  it("adds params without disturbing the query", () => {
    const out = applyToUrl(SEARCH, desiredParams({ code: "jp", strict: false }, "en"));
    const sp = new URL(out).searchParams;
    expect(sp.get("q")).toBe("coffee");
    expect(sp.get("gl")).toBe("jp");
    expect(sp.get("hl")).toBe("en");
    expect(sp.has("cr")).toBe(false);
  });

  it("replaces an existing param and deletes null ones", () => {
    const url = "https://www.google.com/search?q=x&gl=us&cr=countryUS&hl=en";
    const out = applyToUrl(url, desiredParams({ code: "fr", strict: false }, "en"));
    const sp = new URL(out).searchParams;
    expect(sp.get("gl")).toBe("fr");
    expect(sp.has("cr")).toBe(false); // stale strict restrict stripped
  });

  it("never changes hl to a country-inferred language (hl stays pinned)", () => {
    const out = applyToUrl(SEARCH, desiredParams({ code: "jp", strict: false }, "en"));
    expect(new URL(out).searchParams.get("hl")).toBe("en");
  });
});

describe("needsUpdate", () => {
  const params = desiredParams({ code: "jp", strict: false }, "en");

  it("is true when a required param is missing or wrong", () => {
    expect(needsUpdate(SEARCH, params)).toBe(true);
    expect(needsUpdate("https://www.google.com/search?q=x&gl=us&hl=en", params)).toBe(true);
  });

  it("is false once the URL already satisfies the params (loop-safe)", () => {
    const done = applyToUrl(SEARCH, params);
    expect(needsUpdate(done, params)).toBe(false);
  });

  it("is true when a param that must be absent is present", () => {
    const strictUrl = "https://www.google.com/search?q=x&gl=jp&hl=en&cr=countryJP";
    expect(needsUpdate(strictUrl, params)).toBe(true); // cr must be removed
  });
});

describe("detectLang", () => {
  it("prefers an explicit hl on the URL, verbatim", () => {
    expect(detectLang("https://www.google.com/search?q=x&hl=pt-BR", "en", "fr-FR")).toBe("pt-BR");
  });
  it("falls back to the page <html lang> primary subtag", () => {
    expect(detectLang(SEARCH, "de-DE", "fr-FR")).toBe("de");
  });
  it("then to the browser language primary subtag", () => {
    expect(detectLang(SEARCH, null, "fr-FR")).toBe("fr");
  });
  it("then to 'en'", () => {
    expect(detectLang(SEARCH, null, null)).toBe("en");
  });
});

describe("misc", () => {
  it("primarySubtag lowercases and strips region", () => {
    expect(primarySubtag("EN-GB")).toBe("en");
  });
  it("defaultState is Auto with no favourites, undetected language, and ad-hiding on", () => {
    expect(defaultState()).toEqual({ override: null, favourites: [], lang: "", hideAds: true });
  });
  it("derives match/host patterns from the domain list", () => {
    expect(GOOGLE_DOMAINS).toContain("google.com");
    expect(SEARCH_MATCH_PATTERNS).toContain("*://*.google.com/search*");
    expect(HOST_PERMISSION_PATTERNS).toContain("*://*.google.com/*");
    expect(SEARCH_MATCH_PATTERNS).toHaveLength(GOOGLE_DOMAINS.length);
  });
});
