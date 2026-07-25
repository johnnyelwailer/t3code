// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import type { ComposerPromptEditorHandle } from "~/components/ComposerPromptEditor";

const { recordedTargets, pathEntries, mockUseProjects, mockUsePrimaryEnvironmentId } = vi.hoisted(
  () => ({
    recordedTargets: [] as Array<{
      environmentId: string | null;
      cwd: string | null;
      query: string | null;
    }>,
    pathEntries: {
      current: [] as ReadonlyArray<{ path: string; kind: "file" | "directory" }>,
    },
    mockUseProjects: vi.fn(),
    mockUsePrimaryEnvironmentId: vi.fn(),
  }),
);

vi.mock("~/lib/composerPathSearchState", () => ({
  useComposerPathSearch: (target: {
    environmentId: string | null;
    cwd: string | null;
    query: string | null;
  }) => {
    recordedTargets.push(target);
    const queryable =
      target.environmentId !== null && target.cwd !== null && (target.query ?? "").length > 0;
    return {
      entries: queryable ? pathEntries.current : [],
      error: null,
      isPending: false,
    };
  },
}));

vi.mock("~/state/entities", () => ({
  useProjects: () => mockUseProjects(),
}));

vi.mock("~/state/environments", () => ({
  usePrimaryEnvironmentId: () => mockUsePrimaryEnvironmentId(),
}));

import { useT3workKickoffComposerMenu } from "~/t3work/composer/t3work-useKickoffComposerMenu";

type MenuValue = ReturnType<typeof useT3workKickoffComposerMenu>;

const PRIMARY_ENVIRONMENT_ID = "env-primary" as EnvironmentId;
const WORKSPACE_ENVIRONMENT_ID = "env-workspace" as EnvironmentId;
const ABSOLUTE_ROOT = "/Users/pj/.t3code/t3work/projects/IES NG";

function renderMenu(workspaceRoot: string | null): { menu: () => MenuValue; unmount: () => void } {
  const captured = { current: null as MenuValue | null };
  const editorRef = createRef<ComposerPromptEditorHandle>();
  let text = "";
  let cursor = 0;

  function Probe() {
    captured.current = useT3workKickoffComposerMenu({
      selectedProvider: undefined,
      workspaceRoot,
      editorRef,
      text,
      cursor,
      setText: (next) => {
        text = next;
      },
      setCursor: (next) => {
        cursor = next;
      },
      setInteractionMode: () => {},
    });
    return null;
  }

  const container = document.createElement("div");
  let root: Root | undefined;
  act(() => {
    root = createRoot(container);
    root.render(<Probe />);
  });

  return {
    menu: () => {
      if (!captured.current) throw new Error("Expected the kickoff menu hook to render.");
      return captured.current;
    },
    unmount: () => {
      act(() => {
        root?.unmount();
      });
    },
  };
}

describe("useT3workKickoffComposerMenu path search", () => {
  it("queries the environment-registered workspace and surfaces the results as menu items", () => {
    recordedTargets.length = 0;
    pathEntries.current = [
      { path: "AGENTS.md", kind: "file" },
      { path: "hive-ies-koordination", kind: "directory" },
    ];
    mockUsePrimaryEnvironmentId.mockReturnValue(PRIMARY_ENVIRONMENT_ID);
    mockUseProjects.mockReturnValue([
      {
        id: "live-1",
        workspaceRoot: ABSOLUTE_ROOT,
        environmentId: WORKSPACE_ENVIRONMENT_ID,
      },
    ]);

    const rendered = renderMenu("~/.t3code/t3work/projects/IES NG");
    act(() => {
      rendered.menu().handleEditorChange("@AGENTS", 7, false);
    });

    const lastTarget = recordedTargets.at(-1);
    expect(lastTarget).toEqual({
      environmentId: WORKSPACE_ENVIRONMENT_ID,
      cwd: ABSOLUTE_ROOT,
      query: "AGENTS",
    });

    const menu = rendered.menu();
    expect(menu.menuOpen).toBe(true);
    expect(menu.menuItems.map((item) => item.id)).toEqual([
      "path:file:AGENTS.md",
      "path:directory:hive-ies-koordination",
    ]);
    rendered.unmount();
  });

  it("does not search when the project has no workspace root", () => {
    recordedTargets.length = 0;
    pathEntries.current = [{ path: "AGENTS.md", kind: "file" }];
    mockUsePrimaryEnvironmentId.mockReturnValue(PRIMARY_ENVIRONMENT_ID);
    mockUseProjects.mockReturnValue([]);

    const rendered = renderMenu(null);
    act(() => {
      rendered.menu().handleEditorChange("@AGENTS", 7, false);
    });

    expect(recordedTargets.at(-1)).toEqual({
      environmentId: PRIMARY_ENVIRONMENT_ID,
      cwd: null,
      query: "AGENTS",
    });
    expect(rendered.menu().menuItems).toEqual([]);
    rendered.unmount();
  });
});
