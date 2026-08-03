/**
 * Service worker: keeps a single dynamic declarativeNetRequest rule in sync with the stored state.
 *
 * This is the "fast path" for the sticky override — it rewrites the query parameters of Google
 * search navigations at the network layer, before the page loads, so switching country carries over
 * to every subsequent search with no flash of wrong-country results. When the service worker or DNR
 * is unavailable (e.g. some Kiwi builds), the content script's fallback provides the same behaviour.
 */
import { defaultState, desiredParams, GOOGLE_DOMAINS, type State } from "./shared";

/** We only ever maintain one dynamic rule; reusing the id makes updates a clean remove+add. */
export const RULE_ID = 1;

/** Read the merged state, falling back to defaults for any missing keys. */
export async function readState(): Promise<State> {
  return (await chrome.storage.sync.get(defaultState())) as State;
}

/**
 * The dynamic rule that enforces the override, or `null` when in Auto mode (no rule → Google behaves
 * normally). Non-null params become `addOrReplaceParams`; null params (a non-strict `cr`) become
 * `removeParams`, so a stale country restrict from an earlier strict search is stripped.
 */
export function buildRule(state: State): chrome.declarativeNetRequest.Rule | null {
  if (!state.override) return null;

  const addOrReplaceParams: { key: string; value: string }[] = [];
  const removeParams: string[] = [];
  for (const [key, value] of Object.entries(desiredParams(state.override, state.lang))) {
    if (value === null) removeParams.push(key);
    else addOrReplaceParams.push({ key, value });
  }

  // Built as a plain object and asserted to the DNR Rule type: the enum-typed fields (`type`,
  // `resourceTypes`) are plain strings at runtime so this stays independent of the `chrome` global,
  // which the unit tests mock without the declarativeNetRequest enum objects.
  return {
    id: RULE_ID,
    priority: 1,
    action: {
      type: "redirect",
      redirect: { transform: { queryTransform: { addOrReplaceParams, removeParams } } },
    },
    condition: {
      requestDomains: [...GOOGLE_DOMAINS],
      urlFilter: "/search",
      resourceTypes: ["main_frame"],
    },
  } as chrome.declarativeNetRequest.Rule;
}

/** Replace the dynamic rule set with whatever the current state calls for. */
export async function syncRule(): Promise<void> {
  const rule = buildRule(await readState());
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [RULE_ID],
    addRules: rule ? [rule] : [],
  });
}

chrome.runtime.onInstalled.addListener(() => void syncRule());
chrome.runtime.onStartup.addListener(() => void syncRule());
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "sync") void syncRule();
});
