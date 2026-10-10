// @vitest-environment jsdom
/**
 * The gate's two-second window used to render `null`: a cold start that landed on the home
 * showed an empty window until the probe decided. It now renders My Work's own loading animation —
 * the same art My Work shows for its first load, so the hand-off has nothing to jump between.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProjectShellProject } from "@t3tools/project-context";

import type { UseMyWorkDigestGraphResult } from "~/t3team/mywork-digest/t3team-useMyWorkDigestGraphTypes";

const bound: { projects: ReadonlyArray<ProjectShellProject> | null } = { projects: null };

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
const { claimStartupGate, resetStartupLandingSessionForTests } =
  await import("~/t3team/t3team-startupLanding.logic");

beforeEach(() => {
  resetStartupLandingSessionForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetStartupLandingSessionForTests();
});

describe("startup My Work gate", () => {
  const renderGate = (eligible: boolean) =>
    renderToStaticMarkup(
      <T3TeamStartupMyWorkGate eligible={eligible}>
        <p>draft landing</p>
      </T3TeamStartupMyWorkGate>,
    );

  it("paints the loading animation while it decides, not a blank window", () => {
    bound.projects = null;
    const markup = renderGate(true);
    expect(markup).toContain("Loading My Work");
    // The draft landing must not flash behind the decision.
    expect(markup).not.toContain("draft landing");
  });

  it("hands the home straight to the draft landing when this mount is not the cold start", () => {
    const markup = renderGate(false);
    expect(markup).toContain("draft landing");
    expect(markup).not.toContain("Loading My Work");
  });

  it("probes once per session: a later home mount keeps the draft landing", () => {
    bound.projects = null;
    claimStartupGate();
    const markup = renderGate(true);
    expect(markup).toContain("draft landing");
    expect(markup).not.toContain("Loading My Work");
  });
});
