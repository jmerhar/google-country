import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installChromeMock } from "./test-utils";
import type { State } from "./shared";

/** background.ts registers listeners against `chrome` at import, so mock first, then import fresh. */
async function loadBackground(initial: Record<string, unknown>) {
  const mock = installChromeMock(initial);
  vi.resetModules();
  const bg = await import("./background");
  return { mock, bg };
}

const OVERRIDE = { override: { code: "jp", strict: false }, favourites: [], lang: "en" } satisfies State;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("buildRule", () => {
  let bg: typeof import("./background");
  beforeEach(async () => ({ bg } = await loadBackground({})));

  it("returns null in Auto mode", () => {
    expect(bg.buildRule({ override: null, favourites: [], lang: "en" })).toBeNull();
  });

  it("builds a main_frame redirect that pins gl+hl and strips cr when not strict", () => {
    const rule = bg.buildRule(OVERRIDE)!;
    expect(rule.action.type).toBe("redirect");
    expect(rule.condition.resourceTypes).toEqual(["main_frame"]);
    expect(rule.condition.requestDomains).toContain("google.com");
    expect(rule.condition.urlFilter).toBe("/search");

    const t = rule.action.redirect!.transform!.queryTransform!;
    expect(t.addOrReplaceParams).toEqual(
      expect.arrayContaining([
        { key: "gl", value: "jp" },
        { key: "hl", value: "en" },
      ]),
    );
    expect(t.removeParams).toEqual(["cr"]);
  });

  it("adds cr and removes nothing when strict", () => {
    const rule = bg.buildRule({ ...OVERRIDE, override: { code: "jp", strict: true } })!;
    const t = rule.action.redirect!.transform!.queryTransform!;
    expect(t.addOrReplaceParams).toEqual(
      expect.arrayContaining([{ key: "cr", value: "countryJP" }]),
    );
    expect(t.removeParams).toEqual([]);
  });
});

describe("syncRule", () => {
  it("installs the rule when an override is stored", async () => {
    const { mock, bg } = await loadBackground(OVERRIDE);
    await bg.syncRule();
    expect(mock.chrome.declarativeNetRequest.updateDynamicRules).toHaveBeenCalledWith(
      expect.objectContaining({ removeRuleIds: [bg.RULE_ID], addRules: [expect.any(Object)] }),
    );
  });

  it("clears the rule in Auto mode", async () => {
    const { mock, bg } = await loadBackground({ override: null });
    await bg.syncRule();
    expect(mock.chrome.declarativeNetRequest.updateDynamicRules).toHaveBeenCalledWith({
      removeRuleIds: [bg.RULE_ID],
      addRules: [],
    });
  });
});

describe("listeners", () => {
  it("registers install/startup/storage listeners and re-syncs on sync-storage changes", async () => {
    const { mock } = await loadBackground(OVERRIDE);
    expect(mock.listeners.installed).toHaveLength(1);
    expect(mock.listeners.startup).toHaveLength(1);
    expect(mock.listeners.changed).toHaveLength(1);

    const dnr = mock.chrome.declarativeNetRequest.updateDynamicRules as ReturnType<typeof vi.fn>;
    dnr.mockClear();

    mock.listeners.changed[0]!({}, "local"); // ignored
    expect(dnr).not.toHaveBeenCalled();

    mock.listeners.changed[0]!({}, "sync"); // triggers a resync
    await vi.waitFor(() => expect(dnr).toHaveBeenCalled());
  });
});
