/**
 * Test-only helpers: an in-memory `chrome` mock and a stubbed `location`. Excluded from coverage.
 */
import { vi } from "vitest";

type Listener = (...args: unknown[]) => void;

export interface ChromeMock {
  store: Record<string, unknown>;
  dnrCalls: unknown[];
  listeners: { changed: Listener[]; installed: Listener[]; startup: Listener[] };
  chrome: typeof chrome;
}

/** Install a fake `chrome` on globalThis backed by an in-memory store; returns handles for assertions. */
export function installChromeMock(initial: Record<string, unknown> = {}): ChromeMock {
  const store: Record<string, unknown> = { ...initial };
  const changed: Listener[] = [];
  const installed: Listener[] = [];
  const startup: Listener[] = [];
  const dnrCalls: unknown[] = [];

  const fake = {
    storage: {
      sync: {
        get: vi.fn(async (defaults: Record<string, unknown>) => {
          const out: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(defaults ?? {})) out[k] = k in store ? store[k] : v;
          return out;
        }),
        set: vi.fn(async (patch: Record<string, unknown>) => {
          const changes: Record<string, { oldValue: unknown; newValue: unknown }> = {};
          for (const [k, v] of Object.entries(patch)) {
            changes[k] = { oldValue: store[k], newValue: v };
            store[k] = v;
          }
          for (const cb of changed) cb(changes, "sync");
        }),
      },
      onChanged: { addListener: (cb: Listener) => changed.push(cb) },
    },
    runtime: {
      onInstalled: { addListener: (cb: Listener) => installed.push(cb) },
      onStartup: { addListener: (cb: Listener) => startup.push(cb) },
    },
    declarativeNetRequest: {
      updateDynamicRules: vi.fn(async (opts: unknown) => void dnrCalls.push(opts)),
    },
  };

  (globalThis as unknown as { chrome: unknown }).chrome = fake;
  return {
    store,
    dnrCalls,
    listeners: { changed, installed, startup },
    chrome: fake as unknown as typeof chrome,
  };
}

export interface LocationMock {
  href: string;
  assign: ReturnType<typeof vi.fn>;
  replace: ReturnType<typeof vi.fn>;
}

/** Replace the global `location` with a controllable stub. */
export function stubLocation(href: string): LocationMock {
  const loc: LocationMock = { href, assign: vi.fn(), replace: vi.fn() };
  vi.stubGlobal("location", loc);
  return loc;
}

/** Flush pending microtasks/timers so fire-and-forget handlers settle. */
export function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
