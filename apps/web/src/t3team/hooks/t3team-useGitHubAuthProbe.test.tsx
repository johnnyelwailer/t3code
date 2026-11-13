/* oxlint-disable t3code/no-dom-test-environment -- Re-render and probe-call budgets need a DOM; this stays a unit file so CI runs it without Playwright. */
/* oxlint-disable t3code/require-disposable-render -- Custom root so a render-loop cap can fail the test. */
/* oxlint-disable react/immutability -- The probe/call budget lives outside the tree so a loop can fail the test. */
// @vitest-environment jsdom
import { act, createElement, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AsyncResult } from "effect/reactivity";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const live = vi.hoisted(() => ({
  runnerCalls: 0,
  authCalls: 0,
  renderCount: 0,
}));

vi.mock("~/state/environments", () => ({
  usePrimaryEnvironmentId: () => "env-1",
}));

vi.mock("~/state/sourceControl", () => ({
  sourceControlEnvironment: { discovery: {} },
}));

vi.mock("./t3team-integrationCache", () => ({
  writeIntegrationCache: () => {},
}));

vi.mock("./t3team-githubRepositoryDiscoveryUtils", () => ({
  parseGitHubAuth: () => ({
    status: "authenticated" as const,
    host: "nexplore.ghe.com",
    account: "yg",
    accounts: [{ host: "nexplore.ghe.com", account: "yg", active: true }],
  }),
}));

// A new function identity every time this hook runs — the real useAtomQueryRunner
// does the same from an uncompiled caller that passes a fresh options object.
vi.mock("~/state/use-atom-query-runner", () => ({
  useAtomQueryRunner: () => {
    return async () => {
      live.runnerCalls += 1;
      if (live.runnerCalls > 40) {
        throw new Error(`probe loop: discoverSourceControl ran ${live.runnerCalls} times (cap 40)`);
      }
      return AsyncResult.success({ sourceControlProviders: [] });
    };
  },
}));

import { useGitHubAuthProbe } from "./t3team-useGitHubAuthProbe";
import { useAtomQueryRunner } from "~/state/use-atom-query-runner";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CALL_CAP = 40;
const RENDER_CAP = 80;

const noopSetter = () => {};

function ProbeHost() {
  live.renderCount += 1;
  if (live.renderCount > RENDER_CAP) {
    throw new Error(`render loop: probe host rendered more than ${RENDER_CAP} times`);
  }
  const [, setCatalogTick] = useState(0);
  const onAuthenticated = () => {
    live.authCalls += 1;
    if (live.authCalls > CALL_CAP) {
      throw new Error(`probe loop: onAuthenticated ran ${live.authCalls} times (cap ${CALL_CAP})`);
    }
    // The discovery hook's onAuthenticated always setCatalog's a new array — that
    // re-render is what used to retrigger the probe effect. The real onAuthenticated
    // is already held in a ref; this setState is what used to change the runner
    // identity and retrigger the effect.
    setCatalogTick((n) => n + 1);
  };
  useGitHubAuthProbe({
    enabled: true,
    onAuthenticated,
    // Stable identities, like useState setters in the real hook. Unstable test
    // stubs here would themselves retrigger the effect and hide the runner bug.
    setAuthStatus: noopSetter,
    setAuthDetail: noopSetter,
    setLoadingAuth: noopSetter,
    setGithubHost: noopSetter,
    setGithubAccount: noopSetter,
    setAuthenticatedHosts: noopSetter,
  });
  return createElement("div", { "data-testid": "probe-host" });
}

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeEach(() => {
  live.runnerCalls = 0;
  live.authCalls = 0;
  live.renderCount = 0;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

/** The pre-#923 hook: `discoverSourceControl` is in the effect deps. Kept only so a
 * test can prove the loop cap still fires on that pattern. */
function useGitHubAuthProbeBefore923(params: {
  readonly enabled: boolean;
  readonly onAuthenticated: () => void;
  readonly setAuthStatus: (status: string) => void;
  readonly setAuthDetail: (detail: string | undefined) => void;
  readonly setLoadingAuth: (loading: boolean) => void;
  readonly setGithubHost: (host: string) => void;
  readonly setGithubAccount: (account: string | undefined) => void;
  readonly setAuthenticatedHosts: (hosts: ReadonlyArray<unknown>) => void;
}): void {
  const { enabled, onAuthenticated, setLoadingAuth, setAuthStatus, setAuthDetail } = params;
  const onAuthenticatedRef = { current: onAuthenticated };
  onAuthenticatedRef.current = onAuthenticated;
  const discoverSourceControl = useAtomQueryRunner({} as never, {} as never) as (
    input: unknown,
  ) => Promise<unknown>;
  // The buggy pattern: unstable hook-returned function in the dependency list,
  // plus setState in the effect — this is what froze Add on "Adding…".
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const run = async () => {
      setLoadingAuth(true);
      try {
        await discoverSourceControl({});
        if (cancelled) return;
        setAuthStatus("authenticated");
        setAuthDetail(undefined);
        await onAuthenticatedRef.current();
      } finally {
        if (!cancelled) setLoadingAuth(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [discoverSourceControl, enabled, setAuthDetail, setAuthStatus, setLoadingAuth]);
}

function Before923Host() {
  live.renderCount += 1;
  if (live.renderCount > RENDER_CAP) {
    throw new Error(`render loop: probe host rendered more than ${RENDER_CAP} times`);
  }
  const [, setCatalogTick] = useState(0);
  const onAuthenticated = () => {
    live.authCalls += 1;
    // Stop setState after the loop is proven, so the test can assert and unmount
    // without an unhandled rejection from the mock's 40-call cap.
    if (live.authCalls >= 15) return;
    setCatalogTick((n) => n + 1);
  };
  useGitHubAuthProbeBefore923({
    enabled: true,
    onAuthenticated,
    setAuthStatus: noopSetter,
    setAuthDetail: noopSetter,
    setLoadingAuth: noopSetter,
    setGithubHost: noopSetter,
    setGithubAccount: noopSetter,
    setAuthenticatedHosts: noopSetter,
  });
  return createElement("div", { "data-testid": "probe-host-before" });
}

describe("useGitHubAuthProbe", () => {
  it("probes once on mount even when onAuthenticated setStates and the runner identity changes every render", async () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(createElement(ProbeHost));
      await Promise.resolve();
      await Promise.resolve();
    });
    // Flush the in-flight probe and any follow-up renders a loop would schedule.
    for (let i = 0; i < 8; i += 1) {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    }
    expect(live.runnerCalls).toBe(1);
    expect(live.authCalls).toBe(1);
    expect(live.renderCount).toBeLessThan(RENDER_CAP);
    expect(live.renderCount).toBeLessThan(12);
  });

  it("the pre-#923 probe retriggers many times — this is the loop the lint rule and this test guard against", async () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(createElement(Before923Host));
      await Promise.resolve();
      await Promise.resolve();
    });
    for (let i = 0; i < 8 && live.authCalls < 15; i += 1) {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    }
    // Without the fix, each setState retriggers the effect. The fixed hook
    // makes exactly one probe call (asserted above). Fifteen is far past that.
    expect(live.runnerCalls).toBeGreaterThanOrEqual(15);
    expect(live.authCalls).toBeGreaterThanOrEqual(15);
  });
});
