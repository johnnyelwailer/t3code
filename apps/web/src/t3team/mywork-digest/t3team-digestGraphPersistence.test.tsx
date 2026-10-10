/** @vitest-environment jsdom */
/**
 * The cold-start half of the digest cache: a graph written in one page session must paint on the
 * NEXT one, before the server has answered — and must be marked "cached" the whole time, so no
 * view concludes "Nothing needs you" from last session's answer.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ProjectShellProject } from "@t3tools/project-context";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type {
  MyWorkDigestPayload,
  MyWorkDigestPollFn,
} from "~/t3team/backend/t3team-myworkDigestBackendApi";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import { createRecordingOrchestrationApi } from "~/t3team/backend/t3team-orchestrationApi.testSupport";
import {
  readPersistedDigestGraphs,
  writePersistedDigestGraphs,
  type PersistedDigestGraph,
} from "./t3team-digestGraphPersistence";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const project: ProjectShellProject = {
  id: "p1" as never,
  title: "Project p1",
  source: { provider: "atlassian", accountId: "acct-1", externalProjectId: "IES", raw: {} },
  workspace: { rootPath: "/tmp/p1", createdAt: "2026-05-21T18:30:35.000Z" },
  createdAt: "2026-05-21T18:30:35.000Z",
  updatedAt: "2026-05-21T18:30:35.000Z",
} as ProjectShellProject;

function payloadWithTicket(): MyWorkDigestPayload {
  return {
    scope: "project",
    projects: [
      {
        project: { id: "IES", name: "IES NG" },
        tickets: [
          {
            id: "issue-101",
            displayId: "IES-101",
            title: "Task A",
            provider: "atlassian",
            kind: "issue",
            url: "https://jira/IES-101",
            projectId: "IES",
            status: "In Progress",
            assignee: "Philip",
            updatedAt: "2026-09-14T08:00:00.000Z",
          },
        ],
        claims: [],
        decisions: [],
        changeRequests: [],
        transitions: [],
      },
    ],
  };
}

let host: HTMLElement | null = null;
let root: Root | null = null;

/**
 * One page session: a fresh module graph over the same localStorage. The backend context has to
 * come from that same graph, or the provider and the hook would hold two different React contexts.
 */
async function mountSession(pollFn: MyWorkDigestPollFn) {
  vi.resetModules();
  const [{ useMyWorkDigestGraph }, { BackendProvider }] = await Promise.all([
    import("./t3team-useMyWorkDigestGraph"),
    import("~/t3team/backend/t3team-BackendContext"),
  ]);
  const backend = {
    state: { connectionStatus: "connected", serverConfig: null, providers: [], error: null },
    connect: async () => undefined,
    disconnect: async () => undefined,
    orchestration: createRecordingOrchestrationApi(),
    listThreadPlacements: async () => [],
    atlassian: {
      pollMyWorkDigest: (input: Parameters<MyWorkDigestPollFn>[0]) => pollFn(input),
    } as unknown as BackendApi["atlassian"],
    github: {} as BackendApi["github"],
    projectWorkspace: {} as BackendApi["projectWorkspace"],
  } as unknown as BackendApi;

  const latest: { result: ReturnType<typeof useMyWorkDigestGraph> | null } = { result: null };
  function Harness() {
    latest.result = useMyWorkDigestGraph({ projects: [project], viewer: { name: "Philip" } });
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
  return latest;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
});

beforeEach(() => {
  localStorage.clear();
});

describe("persisted digest graphs", () => {
  it("paints the previous session's graph at once, as 'cached', then flips to 'fresh'", async () => {
    const first = await mountSession(async () => ({
      unchanged: false,
      fingerprint: "sha256:one",
      value: payloadWithTicket(),
    }));
    await vi.waitFor(() => expect(first.result?.status).toBe("ready"));
    expect(first.result?.freshness).toBe("fresh");
    act(() => root?.unmount());
    root = null;
    host?.remove();
    host = null;

    // A new page: nothing in memory, only what the last session left in localStorage.
    expect(readPersistedDigestGraphs()).toHaveLength(1);
    let release: () => void = () => {};
    let polled = false;
    const second = await mountSession(async () => {
      polled = true;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { unchanged: false, fingerprint: "sha256:two", value: payloadWithTicket() };
    });

    // The whole point: work on screen before the first round of the session answers.
    expect(second.result?.graph?.tickets).toHaveLength(1);
    expect(second.result?.status).toBe("ready");
    expect(second.result?.freshness).toBe("cached");

    await vi.waitFor(() => expect(polled).toBe(true));
    expect(second.result?.freshness).toBe("cached");
    await act(async () => release());
    await vi.waitFor(() => expect(second.result?.freshness).toBe("fresh"));
    expect(second.result?.graph?.tickets).toHaveLength(1);
  });

  it("ignores entries an older build wrote in a shape the plan builder cannot read", () => {
    localStorage.setItem(
      "t3team:mywork-digest:graphs:v1",
      JSON.stringify([
        { signature: "a", viewerUnresolved: false, graph: { scope: "project" } },
        { signature: "b", viewerUnresolved: false, graph: null },
        "not an entry",
      ]),
    );
    expect(readPersistedDigestGraphs()).toEqual([]);

    localStorage.setItem("t3team:mywork-digest:graphs:v1", "{not json");
    expect(readPersistedDigestGraphs()).toEqual([]);
  });

  it("keeps only the newest few scopes", () => {
    const entry = (signature: string): PersistedDigestGraph => ({
      signature,
      viewerUnresolved: false,
      graph: {
        scope: "all",
        projects: [],
        viewer: { name: "Philip", role: "", lastVisitAt: "1970-01-01T00:00:00.000Z" },
        tickets: [],
        claims: [],
        decisions: [],
        changeRequests: [],
        transitions: [],
        blockers: [],
      },
    });
    writePersistedDigestGraphs(["a", "b", "c", "d", "e"].map(entry));
    expect(readPersistedDigestGraphs().map((stored) => stored.signature)).toEqual(["c", "d", "e"]);
  });
});
