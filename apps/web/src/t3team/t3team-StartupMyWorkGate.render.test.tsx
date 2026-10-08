// @vitest-environment jsdom
/**
 * The gate's two-second window used to render `null`: a cold start that landed on the index route
 * showed an empty window until the probe decided. It now renders My Work's own loading animation —
 * the same art My Work shows for its first load, so the hand-off has nothing to jump between.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProjectShellProject } from "@t3tools/project-context";

import type { UseMyWorkDigestGraphResult } from "~/t3team/mywork-digest/t3team-useMyWorkDigestGraphTypes";

const bound: { projects: ReadonlyArray<ProjectShellProject> | null } = { projects: null };

vi.mock("~/env", () => ({ isElectron: false }));
vi.mock("~/t3team/t3team-route-surface-wsUrl", () => ({ resolveWsBaseUrl: () => "ws://test" }));
vi.mock("~/t3team/backend/t3team-index", () => ({
  createT3Backend: () => ({}),
  BackendProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => () => {} }));
vi.mock("~/t3team/t3team-myWorkBoundProjects", () => ({
  useMyWorkBoundProjects: () => bound.projects,
}));
vi.mock("~/t3team/mywork-digest/t3team-useMyWorkDigestGraph", () => ({
  useMyWorkDigestGraph: (): UseMyWorkDigestGraphResult => ({
    graph: null,
    status: "loading",
    freshness: "cached",
    refreshing: false,
    viewerUnresolved: false,
    sessionExpired: false,
    reload: () => {},
  }),
}));

const { T3TeamStartupMyWorkGate } = await import("~/t3team/t3team-StartupMyWorkGate");
const { resetStartupLandingSessionForTests } = await import("~/t3team/t3team-startupLanding.logic");

beforeEach(() => {
  resetStartupLandingSessionForTests();
  vi.spyOn(performance, "getEntriesByType").mockReturnValue([
    { name: "https://app.t3.codes/" } as PerformanceEntry,
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
  resetStartupLandingSessionForTests();
});

describe("startup My Work gate", () => {
  it("paints the loading animation while it decides, not a blank window", () => {
    bound.projects = null;
    const markup = renderToStaticMarkup(
      <T3TeamStartupMyWorkGate>
        <p>draft landing</p>
      </T3TeamStartupMyWorkGate>,
    );
    expect(markup).toContain("Loading My Work");
    // The draft landing must not flash behind the decision.
    expect(markup).not.toContain("draft landing");
  });

  it("hands the index straight to the draft landing when the boot was not a cold start", () => {
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([
      { name: "https://app.t3.codes/settings" } as PerformanceEntry,
    ]);
    const markup = renderToStaticMarkup(
      <T3TeamStartupMyWorkGate>
        <p>draft landing</p>
      </T3TeamStartupMyWorkGate>,
    );
    expect(markup).toContain("draft landing");
    expect(markup).not.toContain("Loading My Work");
  });
});
