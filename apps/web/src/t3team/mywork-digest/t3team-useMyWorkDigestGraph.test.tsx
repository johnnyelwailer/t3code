/** @vitest-environment jsdom */
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
import { digestSprintGoals, payloadToDigestGraph } from "./t3team-digestGraphMappers";
import { useMyWorkDigestGraph } from "./t3team-useMyWorkDigestGraph";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createProject(overrides: {
  readonly id: string;
  readonly externalProjectId: string;
}): ProjectShellProject {
  return {
    id: overrides.id as ProjectShellProject["id"],
    title: `Project ${overrides.id}`,
    source: {
      provider: "atlassian",
      accountId: `acct-${overrides.id}`,
      externalProjectId: overrides.externalProjectId,
      raw: {},
    },
    workspace: { rootPath: `/tmp/${overrides.id}`, createdAt: "2026-05-21T18:30:35.000Z" },
    createdAt: "2026-05-21T18:30:35.000Z",
    updatedAt: "2026-05-21T18:30:35.000Z",
  } as ProjectShellProject;
}

function createDigestPayload(): MyWorkDigestPayload {
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
          {
            id: "issue-100",
            displayId: "IES-100",
            title: "Story A",
            provider: "atlassian",
            kind: "issue",
            url: "https://jira/IES-100",
            projectId: "IES",
            status: "In Progress",
            assignee: "Philip",
            updatedAt: "2026-09-13T08:00:00.000Z",
          },
        ],
        claims: [
          {
            threadId: "thr-1",
            threadTitle: "IES-101 FE",
            ticketRef: { issueKey: "IES-101" },
            agent: "codex",
            lastActivityAt: "2026-09-14T07:00:00.000Z",
          },
        ],
        decisions: [
          {
            id: "corr-1",
            threadId: "thr-2",
            ticketRef: { issueId: "issue-100", issueKey: "IES-100" },
            question: "Ship it?",
            askedAt: "2026-09-14T06:00:00.000Z",
          },
        ],
        changeRequests: [
          {
            id: "github.com:hive/ies#64",
            repo: "hive/ies-spital",
            number: 64,
            state: "needs-you",
            updatedAt: "2026-09-14T05:00:00.000Z",
            workItemKey: "IES-101",
          },
        ],
        transitions: [
          {
            ticketRef: { issueId: "issue-101", issueKey: "IES-101" },
            from: "To Do",
            to: "In Progress",
            at: "2026-09-14T04:00:00.000Z",
          },
        ],
        sprint: {
          name: "PW Sprint 8.5",
          goal: "Ready für FAT\nDeep-Link aus PI-5 sichtbar",
          startDate: "2026-09-03T00:00:00.000Z",
          endDate: "2026-09-23T00:00:00.000Z",
        },
      },
    ],
  };
}

describe("digest graph mappers", () => {
  it("splits sprint goals into lines", () => {
    expect(digestSprintGoals("a\nb\n- c")).toEqual(["a", "b", "c"]);
    expect(digestSprintGoals(undefined)).toEqual([]);
  });

  it("joins claims, decisions, PRs, and transitions to ticket ids", () => {
    const project = createProject({ id: "p1", externalProjectId: "IES" });
    const entries = [
      {
        account: { id: "acct-p1", provider: "atlassian" },
        externalProjectId: "IES",
        appProjectId: "p1",
      },
    ];
    const graph = payloadToDigestGraph({
      payload: createDigestPayload(),
      projects: [project],
      entries,
      viewer: { name: "Philip", role: "", lastVisitAt: "2026-09-13T00:00:00.000Z" },
    });

    expect(graph.scope).toBe("project");
    expect(graph.tickets).toHaveLength(2);
    // Newest first.
    expect(graph.tickets[0]?.ref.displayId).toBe("IES-101");
    const taskA = graph.tickets[0]?.id;
    const storyA = graph.tickets[1]?.id;
    expect(taskA).not.toBe(storyA);

    expect(graph.claims).toHaveLength(1);
    expect(graph.claims[0]?.ticketId).toBe(taskA);
    expect(graph.claims[0]?.agent).toBe("codex");

    expect(graph.decisions).toHaveLength(1);
    expect(graph.decisions[0]?.ticketId).toBe(storyA);
    expect(graph.decisions[0]?.question).toBe("Ship it?");
    expect(graph.decisions[0]?.requiredRole).toBe("");

    expect(graph.changeRequests).toHaveLength(1);
    expect(graph.changeRequests[0]?.ticketId).toBe(taskA);
    expect(graph.changeRequests[0]?.state).toBe("needs-you");

    expect(graph.transitions).toHaveLength(1);
    expect(graph.transitions[0]?.ticketId).toBe(taskA);

    expect(graph.sprint?.name).toBe("PW Sprint 8.5");
    expect(graph.sprint?.goal).toEqual(["Ready für FAT", "Deep-Link aus PI-5 sichtbar"]);
  });
});

describe("useMyWorkDigestGraph", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(async () => {
    window.localStorage.clear();
    if (root) {
      await act(async () => root?.unmount());
    }
    host?.remove();
    root = null;
    host = null;
  });

  async function mountWith(
    initialFn: MyWorkDigestPollFn,
    projects: readonly ProjectShellProject[],
  ) {
    const holder: { fn: MyWorkDigestPollFn } = { fn: initialFn };
    const backend = {
      state: { connectionStatus: "connected", serverConfig: null, providers: [], error: null },
      connect: async () => undefined,
      disconnect: async () => undefined,
      dispatchCommand: async () => undefined,
      listThreadPlacements: async () => [],
      atlassian: {
        pollMyWorkDigest: (input: Parameters<MyWorkDigestPollFn>[0]) => holder.fn(input),
      } as unknown as BackendApi["atlassian"],
      github: {} as BackendApi["github"],
      projectWorkspace: {} as BackendApi["projectWorkspace"],
    } as unknown as BackendApi;

    const latest: { result: ReturnType<typeof useMyWorkDigestGraph> | null } = { result: null };

    function Harness() {
      latest.result = useMyWorkDigestGraph({ projects, viewer: { name: "Philip" } });
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
    return { latest, holder };
  }

  it("loads the graph, then short-circuits unchanged rounds", async () => {
    const payload = createDigestPayload();
    const calls: Array<{ knownFingerprint?: string | undefined }> = [];
    const { latest, holder } = await mountWith(
      async (input) => {
        calls.push({ knownFingerprint: input.knownFingerprint });
        return { unchanged: false, fingerprint: "sha256:one", value: payload };
      },
      [createProject({ id: "p1", externalProjectId: "IES" })],
    );

    await vi.waitFor(() => {
      expect(latest.result?.status).toBe("ready");
    });
    const firstGraph = latest.result?.graph;
    expect(firstGraph).not.toBeNull();
    expect(firstGraph?.tickets).toHaveLength(2);
    expect(firstGraph?.viewer.name).toBe("Philip");

    // Second round carries the fingerprint and answers unchanged: the previous
    // graph object is kept, nothing is re-mapped.
    holder.fn = async (input) => {
      calls.push({ knownFingerprint: input.knownFingerprint });
      return { unchanged: true, fingerprint: "sha256:one" };
    };
    await act(async () => {
      latest.result?.reload();
    });

    expect(calls.at(-1)?.knownFingerprint).toBe("sha256:one");
    expect(latest.result?.graph).toBe(firstGraph);
    expect(latest.result?.status).toBe("ready");
  });

  it("reports a readable error when the server lacks the endpoint", async () => {
    // A backend whose atlassian surface has no pollMyWorkDigest: the hook's
    // feature-detection must surface a readable error instead of throwing.
    const backend = {
      state: { connectionStatus: "connected", serverConfig: null, providers: [], error: null },
      connect: async () => undefined,
      disconnect: async () => undefined,
      dispatchCommand: async () => undefined,
      listThreadPlacements: async () => [],
      atlassian: {} as unknown as BackendApi["atlassian"],
      github: {} as BackendApi["github"],
      projectWorkspace: {} as BackendApi["projectWorkspace"],
    } as unknown as BackendApi;

    const latest: { result: ReturnType<typeof useMyWorkDigestGraph> | null } = { result: null };
    function Harness() {
      latest.result = useMyWorkDigestGraph({
        projects: [createProject({ id: "p1", externalProjectId: "IES" })],
      });
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

    await vi.waitFor(() => {
      expect(latest.result?.status).toBe("error");
    });
    expect(latest.result?.error).toContain("digest");
  });
});
