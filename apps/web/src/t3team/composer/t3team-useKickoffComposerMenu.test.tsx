// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  ProviderDriverKind,
  ProviderInstanceId,
  type EnvironmentId,
  type ServerProvider,
  type ServerProviderSkill,
} from "@t3tools/contracts";
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

const { mockRefreshProviders } = vi.hoisted(() => ({
  mockRefreshProviders: vi.fn((_request: unknown) => new Promise<never>(() => {})),
}));

vi.mock("~/state/use-atom-command", () => ({
  useAtomCommand: () => mockRefreshProviders,
}));

import { useT3TeamKickoffComposerMenu } from "~/t3team/composer/t3team-useKickoffComposerMenu";

type MenuValue = ReturnType<typeof useT3TeamKickoffComposerMenu>;

const PRIMARY_ENVIRONMENT_ID = "env-primary" as EnvironmentId;
const WORKSPACE_ENVIRONMENT_ID = "env-workspace" as EnvironmentId;
const ABSOLUTE_ROOT = "/Users/pj/.t3code/t3team/projects/IES NG";

function renderMenu(
  workspaceRoot: string | null,
  selectedProvider?: ServerProvider,
): { menu: () => MenuValue; unmount: () => void } {
  const captured = { current: null as MenuValue | null };
  const editorRef = createRef<ComposerPromptEditorHandle>();
  let text = "";
  let cursor = 0;

  function Probe() {
    captured.current = useT3TeamKickoffComposerMenu({
      selectedProvider,
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

describe("useT3TeamKickoffComposerMenu path search", () => {
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

    const rendered = renderMenu("~/.t3code/t3team/projects/IES NG");
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

describe("useT3TeamKickoffComposerMenu repo skills", () => {
  const STORED_ROOT = "~/.t3code/t3team/projects/IES NG";
  const LIVE_ROOT = String.raw`C:\Users\pj\.t3code\t3team\projects\IES NG`;
  const repoSkill: ServerProviderSkill = {
    name: "ies-work-item",
    description: "Work a Jira work item.",
    path: String.raw`C:\Users\pj\.t3code\t3team\projects\IES NG\.claude\skills\ies-work-item\SKILL.md`,
    scope: "repo",
    enabled: true,
  };
  const claude = (workspaceSnapshots: ServerProvider["workspaceSnapshots"]): ServerProvider => ({
    instanceId: ProviderInstanceId.make("claudeAgent"),
    driver: ProviderDriverKind.make("claudeAgent"),
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-10-19T07:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
    ...(workspaceSnapshots ? { workspaceSnapshots } : {}),
  });
  const liveIesProject = {
    id: "live-ies",
    workspaceRoot: LIVE_ROOT,
    environmentId: WORKSPACE_ENVIRONMENT_ID,
  };
  const slashMenuIds = (rendered: ReturnType<typeof renderMenu>) => {
    act(() => {
      rendered.menu().handleEditorChange("/", 1, false);
    });
    return rendered.menu().menuItems.map((item) => item.id);
  };

  it("scans the project's repo the way the thread composer does", () => {
    mockRefreshProviders.mockClear();
    mockUsePrimaryEnvironmentId.mockReturnValue(PRIMARY_ENVIRONMENT_ID);
    mockUseProjects.mockReturnValue([liveIesProject]);

    const rendered = renderMenu(STORED_ROOT, claude(undefined));

    expect(mockRefreshProviders).toHaveBeenCalledWith({
      environmentId: WORKSPACE_ENVIRONMENT_ID,
      input: { instanceId: ProviderInstanceId.make("claudeAgent"), cwd: LIVE_ROOT },
    });
    rendered.unmount();
  });

  it("offers the repo's skills from that workspace's snapshot", () => {
    mockUsePrimaryEnvironmentId.mockReturnValue(PRIMARY_ENVIRONMENT_ID);
    mockUseProjects.mockReturnValue([liveIesProject]);
    const snapshot = {
      cwd: LIVE_ROOT,
      checkedAt: new Date().toISOString(),
      slashCommands: [],
      skills: [repoSkill],
    };

    const rendered = renderMenu(STORED_ROOT, claude([snapshot]));

    expect(slashMenuIds(rendered)).toContain("skill:claudeAgent:ies-work-item");
    expect(rendered.menu().skills.map((skill) => skill.name)).toEqual(["ies-work-item"]);
    rendered.unmount();
  });

  it("does not offer skills scanned for another workspace", () => {
    mockUsePrimaryEnvironmentId.mockReturnValue(PRIMARY_ENVIRONMENT_ID);
    mockUseProjects.mockReturnValue([liveIesProject]);
    const otherRepo = {
      cwd: String.raw`C:\Users\pj\.t3code\t3team\projects\Other`,
      checkedAt: new Date().toISOString(),
      slashCommands: [],
      skills: [repoSkill],
    };

    const rendered = renderMenu(STORED_ROOT, claude([otherRepo]));

    expect(slashMenuIds(rendered)).not.toContain("skill:claudeAgent:ies-work-item");
    rendered.unmount();
  });
});
