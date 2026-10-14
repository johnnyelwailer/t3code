/** @vitest-environment jsdom */
/**
 * The All projects digest paints each project as it lands while the all-scope round is still out,
 * shows which projects are still syncing, and hands over to the all-scope answer once it lands.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ProjectShellProject } from "@t3tools/project-context";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { BackendProvider } from "~/t3team/backend/t3team-BackendContext";
import type {
  MyWorkDigestPayload,
  MyWorkDigestPollFn,
} from "~/t3team/backend/t3team-myworkDigestBackendApi";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import { createRecordingOrchestrationApi } from "~/t3team/backend/t3team-orchestrationApi.testSupport";
import { clearCachedDigestGraphsForTests } from "./t3team-digestGraphCache";
import { useMyWorkDigestGraph } from "./t3team-useMyWorkDigestGraph";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function project(id: string, key: string): ProjectShellProject {
  return {
    id: id as ProjectShellProject["id"],
    title: `Project ${key}`,
    source: { provider: "atlassian", accountId: "acct", externalProjectId: key, raw: {} },
    workspace: { rootPath: `/tmp/${id}`, createdAt: "2026-05-21T18:30:35.000Z" },
    createdAt: "2026-05-21T18:30:35.000Z",
    updatedAt: "2026-05-21T18:30:35.000Z",
  } as ProjectShellProject;
}

function projectData(key: string): MyWorkDigestPayload["projects"][number] {
  return {
    project: { id: key, name: key },
    tickets: [
      {
        id: `${key}-issue`,
        displayId: `${key}-1`,
        title: `${key} task`,
        provider: "atlassian",
        kind: "issue",
        url: `https://jira/${key}-1`,
        projectId: key,
        status: "In Progress",
        assignee: "Philip",
        updatedAt: "2026-10-14T08:00:00.000Z",
      },
    ],
    claims: [],
    decisions: [],
    changeRequests: [],
    transitions: [],
  } as unknown as MyWorkDigestPayload["projects"][number];
}

describe("useMyWorkDigestGraph — progressive All projects", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(async () => {
    window.localStorage.clear();
    clearCachedDigestGraphsForTests();
    if (root) await act(async () => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  it("paints IES first, badges the rest as syncing, then takes the all-scope answer", async () => {
    let releaseAll: (() => void) | undefined;
    const allGate = new Promise<void>((resolve) => {
      releaseAll = resolve;
    });
    let releasePw: (() => void) | undefined;
    const pwGate = new Promise<void>((resolve) => {
      releasePw = resolve;
    });
    const fn: MyWorkDigestPollFn = async (input) => {
      const keys = input.projects.map((entry) => entry.externalProjectId);
      if (keys.length > 1) {
        await allGate;
        return {
          unchanged: false,
          fingerprint: "all",
          value: { scope: "all", projects: keys.map(projectData), viewer: { name: "Philip" } },
        };
      }
      if (keys[0] === "PW") await pwGate;
      return {
        unchanged: false,
        fingerprint: keys[0] ?? "",
        value: { scope: "all", projects: [projectData(keys[0] ?? "")], viewer: { name: "Philip" } },
      };
    };
    const backend = {
      state: { connectionStatus: "connected", serverConfig: null, providers: [], error: null },
      connect: async () => undefined,
      disconnect: async () => undefined,
      orchestration: createRecordingOrchestrationApi(),
      listThreadPlacements: async () => [],
      atlassian: { pollMyWorkDigest: fn } as unknown as BackendApi["atlassian"],
      github: {} as BackendApi["github"],
      projectWorkspace: {} as BackendApi["projectWorkspace"],
    } as unknown as BackendApi;
    const projects = [project("p-ies", "IES"), project("p-pw", "PW")];
    const latest: { result: ReturnType<typeof useMyWorkDigestGraph> | null } = { result: null };
    function Harness() {
      latest.result = useMyWorkDigestGraph({ projects, scope: "all", viewer: { name: "Philip" } });
      return null;
    }
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(
        <BackendProvider backend={backend}>
          <Harness />
        </BackendProvider>,
      );
    });

    // IES landed on its own while the all-scope round is still out: content, not a skeleton.
    await vi.waitFor(() => {
      expect(latest.result?.graph?.tickets.map((t) => t.ref.displayId)).toEqual(["IES-1"]);
    });
    expect(latest.result?.status).toBe("ready");
    expect(latest.result?.freshness).toBe("cached");
    expect(latest.result?.graph?.syncingProjects).toEqual(["Project PW"]);

    await act(async () => releasePw?.());
    await vi.waitFor(() => {
      expect(latest.result?.graph?.tickets).toHaveLength(2);
    });
    expect(latest.result?.graph?.syncingProjects).toBeUndefined();
    expect(latest.result?.freshness).toBe("cached");

    await act(async () => releaseAll?.());
    await vi.waitFor(() => {
      expect(latest.result?.freshness).toBe("fresh");
    });
    expect(latest.result?.graph?.tickets).toHaveLength(2);
    expect(latest.result?.graph?.syncingProjects).toBeUndefined();
  });
});
