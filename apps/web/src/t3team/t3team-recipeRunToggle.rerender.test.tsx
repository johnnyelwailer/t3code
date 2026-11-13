/* oxlint-disable t3code/no-dom-test-environment -- Re-render counts need a DOM; this stays a unit file so CI runs it without Playwright. */
// @vitest-environment jsdom
/* oxlint-disable t3code/require-disposable-render -- Unit-file createRoot, same as the RunToggle unit tests. */
import { act, memo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, it, vi } from "vite-plus/test";

import { T3TeamRecipeRunFixture } from "~/state/t3team-recipeRun";
import type { RecipeRunSnapshot } from "~/state/t3team-recipeRun.logic";
import { BackendContext } from "~/t3team/backend/t3team-BackendContext";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import { FIXTURE_ENVIRONMENT_ID, RUN_OFF } from "~/t3team/t3team-prWatchFixtures";
import { T3TeamRecipeActionViewContext } from "~/t3team/t3team-recipeActionViewContext";
import { RunToggle } from "~/t3team/t3team-recipeRunToggle";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";
import type { SidecarSectionHost } from "~/t3team/t3team-sidecarSectionHost";
import { T3TeamSidecarSectionHostContext } from "~/t3team/t3team-sidecarSectionHostContext";
import { renderCounter } from "~/test/t3team-renderCounter";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("~/state/use-atom-command", () => ({
  useAtomCommand: () => async () => ({ _tag: "Success" as const, value: undefined }),
}));
vi.mock("~/state/environments", () => ({ usePrimaryEnvironmentId: () => FIXTURE_ENVIRONMENT_ID }));
vi.mock("~/state/threads", () => ({
  threadEnvironment: { watchPullRequest: { label: "watch" }, setRuntimeMode: { label: "mode" } },
  environmentThreadShells: { threadShellsAtom: {} },
}));
vi.mock("~/t3team/chat/t3team-useStopCascade", () => ({ stopThreadCascade: { label: "cascade" } }));
vi.mock("~/state/entities", () => ({ useServerConfigs: () => new Map() }));
vi.mock("~/editorPreferences", () => ({
  useOpenInPreferredEditor: () => async () => ({ _tag: "Success" }),
}));

const recipe: T3TeamSidecarRecipeQuickStart = {
  id: "pr-watch",
  title: "Watch my PRs",
  description: "",
  prompt: "",
  workflow: {
    kind: "recipe",
    recipeId: "pr-watch",
    title: "Watch my PRs",
    description: "Babysits PRs",
    source: "pack",
    surface: "project.dashboard.myWork",
    workflowPath: "/ws/.agents/nexi/packs/p/recipes/pr-watch/pr-watch.workflow.ts",
  },
  actionView: {
    source: "",
    context: {
      surface: "project.dashboard.myWork",
      project: { id: "project-nexi", title: "Nexi", workspaceRoot: "/ws" },
    } as never,
  },
};

const host: SidecarSectionHost = {
  placement: "sidecar.section",
  surface: "project.dashboard.myWork",
  projectId: "project-nexi",
  stageKickoff: () => {},
  launchRecipe: () => {},
  launchQuickStart: async () => true,
  openThread: () => {},
};

const counter = renderCounter();

const CountingToggle = memo(function CountingToggle(props: {
  rowId: string;
  run: RecipeRunSnapshot;
}) {
  counter.count(props.rowId);
  return (
    <BackendContext.Provider value={{} as BackendApi}>
      <T3TeamSidecarSectionHostContext.Provider value={host}>
        <T3TeamRecipeActionViewContext.Provider value={recipe}>
          <T3TeamRecipeRunFixture.Provider value={props.run}>
            <RunToggle title="Watch my PRs" offDescription="babysits every open PR" />
          </T3TeamRecipeRunFixture.Provider>
        </T3TeamRecipeActionViewContext.Provider>
      </T3TeamSidecarSectionHostContext.Provider>
    </BackendContext.Provider>
  );
});

function Interactive() {
  const [tick, setTick] = useState(0);
  return (
    <div>
      <button type="button" onClick={() => setTick((n) => n + 1)}>
        tick {tick}
      </button>
      <CountingToggle rowId="toggle-a" run={RUN_OFF} />
      <CountingToggle rowId="toggle-b" run={RUN_OFF} />
    </div>
  );
}

describe("RunToggle re-renders", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    counter.reset();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("mounts each toggle once and does not re-render when an unrelated parent tick changes", async () => {
    await act(async () => {
      root.render(<Interactive />);
    });
    counter.expectRerendered({ "toggle-a": 1, "toggle-b": 1 });
    counter.reset();
    await act(async () => {
      container.querySelector("button")?.click();
    });
    counter.expectRerendered({});
  });
});
