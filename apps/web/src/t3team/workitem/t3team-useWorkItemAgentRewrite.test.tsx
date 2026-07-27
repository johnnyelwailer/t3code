/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useT3TeamStagedComposerActionStore } from "~/t3team/t3team-stagedComposerActionStore";
import {
  useWorkItemAgentRewrite,
  type UseWorkItemAgentRewriteInput,
} from "./t3team-useWorkItemAgentRewrite";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const WORKSPACE_ROOT = "/tmp/project-alpha";
const RECIPE_PATH = `${WORKSPACE_ROOT}/.t3team/recipes/describe-rewrite`;
const STAGED_KEY = "proj-1:ticket-1";

type Result = ReturnType<typeof useWorkItemAgentRewrite>;

function mount(): {
  readonly latest: { result: Result | null };
  readonly rerender: (nextProps: UseWorkItemAgentRewriteInput) => Promise<void>;
  readonly unmount: () => Promise<void>;
} {
  const latest: { result: Result | null } = { result: null };
  const host = document.createElement("div");
  document.body.append(host);
  const root: Root = createRoot(host);

  function Harness(props: UseWorkItemAgentRewriteInput) {
    latest.result = useWorkItemAgentRewrite(props);
    return null;
  }

  const rerender = async (nextProps: UseWorkItemAgentRewriteInput) => {
    await act(async () => {
      root.render(<Harness {...nextProps} />);
    });
  };

  return {
    latest,
    rerender,
    unmount: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

function baseProps(overrides?: Partial<UseWorkItemAgentRewriteInput>): UseWorkItemAgentRewriteInput {
  return {
    projectId: "proj-1",
    ticketId: "ticket-1",
    issueIdOrKey: "PROJ-42",
    projectWorkspaceRoot: WORKSPACE_ROOT,
    descriptionText: "Current text.",
    summary: "Camera resets on reload",
    hasPendingDescriptionDraft: false,
    hasLoadedWorkItem: true,
    ...overrides,
  };
}

function stagedAction() {
  return useT3TeamStagedComposerActionStore.getState().byKey[STAGED_KEY];
}

describe("useWorkItemAgentRewrite", () => {
  let harness: ReturnType<typeof mount> | null = null;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useT3TeamStagedComposerActionStore.setState({ byKey: {} });
    fetchSpy = vi.fn();
    (globalThis as unknown as { fetch: unknown }).fetch = fetchSpy;
  });

  afterEach(async () => {
    await harness?.unmount();
    harness = null;
  });

  async function mounted(overrides?: Partial<UseWorkItemAgentRewriteInput>) {
    harness = mount();
    await harness.rerender(baseProps(overrides));
    return harness;
  }

  /**
   * The whole point of the restructure: the click is free. Nothing is created, nothing is sent, so
   * "no model turn before the human has submitted their intent" holds structurally — this hook has
   * no backend to reach even if it wanted to.
   */
  it("opens the popout and preselects the workflow without any network call", async () => {
    const h = await mounted();

    act(() => h.latest.result?.open());

    expect(h.latest.result?.isComposing).toBe(true);
    expect(h.latest.result?.isStaged).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();

    const staged = stagedAction();
    // Preselected, not launched: the recipe paths are staged so that the composer's submit can hand
    // the server a run whose tool scope resolves.
    expect(staged?.selectedRecipe.recipe.workflow?.recipePath).toBe(RECIPE_PATH);
    expect(staged?.selectedRecipe.recipe.workflow?.workflowPath).toBe(`${RECIPE_PATH}/workflow.ts`);
    expect(staged?.selectedRecipe.recipe.workflow?.parameters).toMatchObject({
      issueIdOrKey: "PROJ-42",
      currentBody: "Current text.",
    });
    // Submit-time inputs are NOT staged; they are collected by the composer.
    expect(staged?.selectedRecipe.recipe.workflow?.parameters).not.toHaveProperty("instructions");
    expect(staged?.comments).toEqual([]);
  });

  it("attaches the popout note as a comment and still launches nothing", async () => {
    const h = await mounted();

    act(() => h.latest.result?.open());
    act(() => h.latest.result?.submitComment("Lead with the user impact."));

    expect(h.latest.result?.isComposing).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(stagedAction()?.comments).toEqual([
      {
        id: expect.stringContaining("description:") as unknown as string,
        blockId: "description",
        // Empty on purpose: nothing was selected, and the workflow body drops its `On "…":` prefix
        // rather than inventing a quote the user never wrote.
        quote: "",
        body: "Lead with the user impact.",
      },
    ]);
  });

  it("keeps both notes when a second one is attached, and each stays removable", async () => {
    const h = await mounted();

    act(() => h.latest.result?.open());
    act(() => h.latest.result?.submitComment("Lead with the user impact."));
    act(() => h.latest.result?.open());
    act(() => h.latest.result?.submitComment("Drop the changelog section."));

    const bodies = stagedAction()?.comments.map((comment) => comment.body);
    expect(bodies).toEqual(["Lead with the user impact.", "Drop the changelog section."]);
    expect(h.latest.result?.stagedCommentCount).toBe(2);

    const firstId = stagedAction()?.comments[0]?.id ?? "";
    act(() => {
      useT3TeamStagedComposerActionStore
        .getState()
        .removeComment({ projectId: "proj-1", ticketId: "ticket-1" }, firstId);
    });

    expect(stagedAction()?.comments.map((comment) => comment.body)).toEqual([
      "Drop the changelog section.",
    ]);
    // Removing a note must not un-preselect the action.
    expect(stagedAction()?.selectedRecipe.recipe.workflow?.recipePath).toBe(RECIPE_PATH);
  });

  it("drops empty notes rather than staging feedback with nothing in it", async () => {
    const h = await mounted();

    act(() => h.latest.result?.open());
    act(() => h.latest.result?.submitComment("   "));

    expect(stagedAction()?.comments).toEqual([]);
  });

  it("un-preselects on cancel when the human left no note behind", async () => {
    const h = await mounted();

    act(() => h.latest.result?.open());
    act(() => h.latest.result?.cancel());

    expect(stagedAction()).toBeUndefined();
    expect(h.latest.result?.isStaged).toBe(false);
  });

  it("keeps the staged notes when the popout is cancelled after one was attached", async () => {
    const h = await mounted();

    act(() => h.latest.result?.open());
    act(() => h.latest.result?.submitComment("Lead with the user impact."));
    act(() => h.latest.result?.open());
    act(() => h.latest.result?.cancel());

    expect(stagedAction()?.comments).toHaveLength(1);
  });

  it("surfaces a missing workspace instead of preselecting a run with no draft tools", async () => {
    const { projectWorkspaceRoot: _omitted, ...withoutWorkspace } = baseProps();
    harness = mount();
    await harness.rerender(withoutWorkspace);

    act(() => harness!.latest.result?.open());

    expect(harness.latest.result?.error).not.toBeNull();
    expect(harness.latest.result?.isComposing).toBe(false);
    expect(stagedAction()).toBeUndefined();
  });

  it("does not open while the work item has not loaded", async () => {
    const h = await mounted({ hasLoadedWorkItem: false });

    expect(h.latest.result?.isDisabled).toBe(true);
    act(() => h.latest.result?.open());
    expect(h.latest.result?.isComposing).toBe(false);
    expect(stagedAction()).toBeUndefined();
  });

  it("is disabled while a description draft is already pending", async () => {
    const h = await mounted({ hasPendingDescriptionDraft: true });

    expect(h.latest.result?.isDisabled).toBe(true);
    act(() => h.latest.result?.open());
    expect(stagedAction()).toBeUndefined();
  });
});
