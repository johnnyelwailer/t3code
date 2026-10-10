// @vitest-environment jsdom
/**
 * "New thread" with nothing open starts in the project the sidebar is scoped to — not the first
 * project in the user's order. Everything but the project list, the scope mirror and the
 * reachability of environments is stubbed.
 */
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const harness = vi.hoisted(() => ({
  projects: [] as Array<{ id: string; environmentId: string; workspaceRoot: string }>,
  environments: [] as Array<{ environmentId: string; connection: { phase: string } }>,
}));

vi.mock("@effect/atom-react", () => ({ useAtomValue: () => new Map() }));
vi.mock("@tanstack/react-router", () => ({
  useParams: () => null,
  useRouter: () => ({ state: { location: { href: "/" }, matches: [] }, navigate: vi.fn() }),
}));
vi.mock("../composerDraftStore", () => ({
  composerDraftHasUserContent: () => false,
  markPromotedDraftThreadByRef: vi.fn(),
  useComposerDraftStore: Object.assign((selector: (state: unknown) => unknown) => selector({}), {
    getState: () => ({}),
  }),
}));
vi.mock("../state/entities", () => ({
  readProjects: () => harness.projects,
  readThreadShell: () => null,
  useProjects: () => harness.projects,
  useThreadShell: () => undefined,
}));
vi.mock("../state/environments", () => ({
  useEnvironments: () => ({ environments: harness.environments }),
  usePrimaryEnvironmentId: () => "env-local",
}));
vi.mock("../state/server", () => ({ environmentServerConfigsAtom: {} }));
vi.mock("../uiStateStore", () => ({
  legacyProjectCwdPreferenceKey: (root: string) => root,
  useUiStateStore: (selector: (state: unknown) => unknown) => selector({ projectOrder: [] }),
}));
vi.mock("../logicalProject", () => ({
  deriveLogicalProjectKeyFromSettings: () => "key",
  getProjectOrderKey: (project: { id: string }) => project.id,
  selectProjectGroupingSettings: () => ({}),
}));
vi.mock("../lib/t3ProjectFileDefaults", () => ({ readT3ProjectFile: async () => null }));
vi.mock("./useSettings", () => ({ useClientSettings: () => ({}) }));

import { useT3TeamSidebarProjectScope } from "../t3team/t3team-sidebarProjectScopeStore";
import { useHandleNewThread } from "./useHandleNewThread";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("useHandleNewThread default project", () => {
  let root: Root;

  const defaultRef = async () => {
    let ref: unknown = "unset";
    function Probe() {
      const value = useHandleNewThread();
      useEffect(() => {
        ref = value.defaultProjectRef;
      });
      return null;
    }
    await act(async () => {
      root.render(<Probe />);
    });
    return ref;
  };

  beforeEach(() => {
    harness.projects = [
      { id: "p1", environmentId: "env-local", workspaceRoot: "/p1" },
      { id: "p2", environmentId: "env-local", workspaceRoot: "/p2" },
      { id: "p3", environmentId: "env-cloud", workspaceRoot: "/p3" },
    ];
    harness.environments = [];
    useT3TeamSidebarProjectScope.setState({ scopedProjectId: null, scopedProjectRefs: null });
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  it("is the first project when the sidebar is on All projects", async () => {
    expect(await defaultRef()).toEqual({ environmentId: "env-local", projectId: "p1" });
  });

  it("is the scoped project once the sidebar is scoped", async () => {
    useT3TeamSidebarProjectScope.setState({
      scopedProjectId: "p2",
      scopedProjectRefs: [{ environmentId: "env-local", projectId: "p2" }] as never,
    });
    expect(await defaultRef()).toEqual({ environmentId: "env-local", projectId: "p2" });
  });

  it("falls back to the first reachable project when the scoped one's machine is gone", async () => {
    harness.environments = [{ environmentId: "env-cloud", connection: { phase: "disconnected" } }];
    useT3TeamSidebarProjectScope.setState({
      scopedProjectId: "p3",
      scopedProjectRefs: [{ environmentId: "env-cloud", projectId: "p3" }] as never,
    });
    expect(await defaultRef()).toEqual({ environmentId: "env-local", projectId: "p1" });
  });
});
