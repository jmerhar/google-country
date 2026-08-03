import { describe, expect, it } from "vitest";
import { COUNTRIES, countryByCode, flagEmoji } from "./countries";

describe("COUNTRIES list", () => {
  it("is a plausible size for ISO 3166-1", () => {
    expect(COUNTRIES.length).toBeGreaterThan(200);
    expect(COUNTRIES.length).toBeLessThan(300);
  });

  it("has unique, valid two-letter uppercase codes and non-empty names", () => {
    const codes = new Set<string>();
    for (const c of COUNTRIES) {
      expect(c.name.trim().length).toBeGreaterThan(0);
      expect(c.code).toMatch(/^[A-Z]{2}$/);
      expect(codes.has(c.code)).toBe(false);
      codes.add(c.code);
    }
  });

  it("is sorted alphabetically by name", () => {
    const names = COUNTRIES.map((c) => c.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it("includes well-known countries", () => {
    for (const code of ["US", "JP", "DE", "GB", "PT"]) {
      expect(COUNTRIES.some((c) => c.code === code)).toBe(true);
    }
  });
});

describe("countryByCode", () => {
  it("looks up case-insensitively", () => {
    expect(countryByCode("jp")?.name).toBe("Japan");
    expect(countryByCode("JP")?.name).toBe("Japan");
  });
  it("returns undefined for unknown codes", () => {
    expect(countryByCode("zz")).toBeUndefined();
  });
});

describe("flagEmoji", () => {
  it("maps a code to regional indicator symbols", () => {
    // 🇯🇵 = U+1F1EF U+1F1F5
    expect(flagEmoji("JP")).toBe("\u{1F1EF}\u{1F1F5}");
    expect(flagEmoji("jp")).toBe(flagEmoji("JP"));
  });
  it("returns a neutral flag for invalid input", () => {
    expect(flagEmoji("123")).toBe("🏳️");
    expect(flagEmoji("U")).toBe("🏳️");
  });
});
