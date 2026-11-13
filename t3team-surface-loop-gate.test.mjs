import { describe, expect, it } from "vite-plus/test";

import { SURFACES, evaluateSurfaceLoopGate } from "./t3team-surface-loop-gate.mjs";

describe("t3team surface-loop gate", () => {
  it("accepts a loop test that uses live-shaped fakes and does not mock discovery", () => {
    const result = evaluateSurfaceLoopGate([
      {
        path: "apps/web/src/t3team/t3team-CreateProjectRoute.loop.test.tsx",
        source: `
          import { LIVE_SHAPED_DISCOVERY, RENDER_CAP } from "./helper";
          import { CreateProjectRoute } from "./t3team-CreateProjectRoute";
          void LIVE_SHAPED_DISCOVERY;
          expect(renders).toBeLessThan(RENDER_CAP);
        `,
      },
    ]);
    expect(result.missing).not.toContain("add-project");
  });

  it("rejects a test that fully mocks useGitHubRepositoryDiscovery", () => {
    const result = evaluateSurfaceLoopGate([
      {
        path: "apps/web/src/t3team/t3team-CreateProjectRoute.loop.test.tsx",
        source: `
          import { LIVE_SHAPED_DISCOVERY, RENDER_CAP } from "./helper";
          import { CreateProjectRoute } from "./t3team-CreateProjectRoute";
          vi.mock("~/t3team/hooks/t3team-useGitHubRepositoryDiscovery", () => ({
            useGitHubRepositoryDiscovery: () => ({}),
          }));
        `,
      },
    ]);
    expect(result.missing).toContain("add-project");
  });

  it("fails when a required surface has no loop test", () => {
    const result = evaluateSurfaceLoopGate([]);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(SURFACES.map((s) => s.id));
  });
});
