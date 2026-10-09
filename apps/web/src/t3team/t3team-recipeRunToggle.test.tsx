// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { T3TeamRecipeRunFixture } from "~/state/t3team-recipeRun";
import type { RecipeRunSnapshot } from "~/state/t3team-recipeRun.logic";
import { BackendContext } from "~/t3team/backend/t3team-BackendContext";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import { FIXTURE_ENVIRONMENT_ID, RUN_NEEDS_YOU, RUN_OFF } from "~/t3team/t3team-prWatchFixtures";
import { T3TeamRecipeActionViewContext } from "~/t3team/t3team-recipeActionViewContext";
import { RunToggle } from "~/t3team/t3team-recipeRunToggle";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";

const commands = vi.hoisted(() => ({ dispatched: [] as Array<{ label: string; input: unknown }> }));

vi.mock("~/state/use-atom-command", () => ({
  useAtomCommand: (command: { label?: string }) => async (input: unknown) => {
    commands.dispatched.push({ label: String(command.label ?? "command"), input });
    return { _tag: "Success" as const, value: undefined };
  },
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

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

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
    workflowPath: "/ws/.nexi/packs/p/recipes/pr-watch/pr-watch.workflow.ts",
  },
  actionView: {
    source: "",
    context: {
      surface: "project.dashboard.myWork",
      project: { id: "project-nexi", title: "Nexi", workspaceRoot: "/ws" },
    } as never,
  },
};

const roots: Array<{ root: ReturnType<typeof createRoot>; container: HTMLElement }> = [];

async function render(run: RecipeRunSnapshot, backend: Partial<BackendApi>) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const tree: ReactNode = (
    <BackendContext.Provider value={backend as BackendApi}>
      <T3TeamRecipeActionViewContext.Provider value={recipe}>
        <T3TeamRecipeRunFixture.Provider value={run}>
          <RunToggle title="Watch my PRs" offDescription="babysits every open PR" />
        </T3TeamRecipeRunFixture.Provider>
      </T3TeamRecipeActionViewContext.Provider>
    </BackendContext.Provider>
  );
  await act(async () => root.render(tree));
  return container;
}

const switchOf = (container: HTMLElement) =>
  container.querySelector<HTMLElement>("[role='switch']")!;
const stateOf = (container: HTMLElement) =>
  container.querySelector<HTMLElement>("[data-testid='run-toggle']")?.dataset.state;
const click = async (target: Element) =>
  act(async () =>
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })),
  );

beforeEach(() => {
  commands.dispatched.length = 0;
});
afterEach(async () => {
  for (const { root, container } of roots.splice(0)) {
    await act(async () => root.unmount());
    container.remove();
  }
});

describe("RunToggle", () => {
  it("launches the recipe's workflow when switched on", async () => {
    const launchRecipeWorkflow = vi.fn<NonNullable<BackendApi["launchRecipeWorkflow"]>>(
      async () => ({ ok: true, mode: "thread" as const }),
    );
    const container = await render(RUN_OFF, { launchRecipeWorkflow });
    expect(stateOf(container)).toBe("off");
    expect(container.textContent).toContain("Off");
    expect(container.textContent).toContain("babysits every open PR");

    await click(switchOf(container));

    expect(launchRecipeWorkflow).toHaveBeenCalledTimes(1);
    const request = launchRecipeWorkflow.mock.calls[0]![0] as {
      workspaceRoot: string;
      launch: { recipeId: string; workflowPath?: string };
    };
    expect(request.workspaceRoot).toBe("/ws");
    expect(request.launch).toMatchObject({
      recipeId: "pr-watch",
      workflowPath: recipe.workflow?.workflowPath,
    });
    expect(stateOf(container)).toBe("starting");
  });

  it("asks once, then stops the run and every watch it launched", async () => {
    const controlWorkflow = vi.fn(async () => ({ ok: true, status: "cancelled" as const }));
    const container = await render(RUN_NEEDS_YOU, { controlWorkflow });
    expect(container.textContent).toContain("2 need you");
    expect(switchOf(container).getAttribute("aria-checked")).toBe("true");

    await click(switchOf(container));
    const dialog = document.body.querySelector("[role='alertdialog']");
    expect(dialog?.textContent).toContain("Stop watching 12 PRs?");
    expect(controlWorkflow).not.toHaveBeenCalled();

    const stop = [...document.body.querySelectorAll("button")].find(
      (b) => b.textContent === "Stop",
    )!;
    await click(stop);

    expect(controlWorkflow).toHaveBeenCalledWith({
      threadId: "thread-pr-watch-home",
      workflowRunId: "run-pr-watch",
      action: "stop",
    });
    const unwatched = commands.dispatched
      .filter((c) => c.label === "watch")
      .map((c) => (c.input as { input: { number: number; watching: boolean } }).input);
    expect(unwatched.map((u) => u.number).sort((a, b) => a - b)).toEqual([377, 398, 412, 412]);
    expect(unwatched.every((u) => u.watching === false)).toBe(true);
  });
});
