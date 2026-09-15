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
  readonly accountId?: string;
}): ProjectShellProject {
  return {
    id: overrides.id as ProjectShellProject["id"],
    title: `Project ${overrides.id}`,
    source: {
      provider: "atlassian",
      accountId: overrides.accountId ?? `acct-${overrides.id}`,
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
            reviewers: [
              { name: "Alice", login: "alice" },
              { name: "bob", login: "bob" },
            ],
            unhandledReviewThreads: [
              { lastCommentAt: "2026-09-14T01:00:00.000Z" },
              { lastCommentAt: "2026-09-12T01:00:00.000Z" },
              {},
            ],
          },
        ],
        blockers: [{ ticketRef: { issueKey: "IES-101" }, repo: "hive/ies-spital", number: 64 }],
        burndown: {
          unit: "points",
          total: 5,
          points: [
            { date: "2026-09-03", remaining: 5 },
            { date: "2026-09-04", remaining: 3 },
          ],
        },
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
    expect(graph.changeRequests[0]?.reviewers).toEqual([
      { name: "Alice", login: "alice" },
      { name: "bob", login: "bob" },
    ]);
    // Unhandled = unresolved AND newer than the last visit (09-13): the
    // 09-14 comment counts, the 09-12 one does not, the untimed one always does.
    expect(graph.changeRequests[0]?.unhandledComments).toBe(2);

    expect(graph.blockers).toHaveLength(1);
    expect(graph.blockers[0]).toEqual({ ticketId: taskA, repo: "hive/ies-spital", number: 64 });

    expect(graph.burndown?.unit).toBe("points");
    expect(graph.burndown?.total).toBe(5);
    expect(graph.burndown?.points).toEqual([
      { date: "2026-09-03", remaining: 5 },
      { date: "2026-09-04", remaining: 3 },
    ]);

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

  // `projectsRef` is what the harness reads on every render, so a test can swap the
  // project list (a scope change) after the first mount without remounting.
  async function mountWith(
    initialFn: MyWorkDigestPollFn,
    initialProjects: readonly ProjectShellProject[],
  ) {
    const holder: { fn: MyWorkDigestPollFn } = { fn: initialFn };
    const projectsRef: { projects: readonly ProjectShellProject[] } = {
      projects: initialProjects,
    };
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
      latest.result = useMyWorkDigestGraph({
        projects: projectsRef.projects,
        viewer: { name: "Philip" },
      });
      return null;
    }

    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const render = () =>
      root?.render(
        <BackendProvider backend={backend}>
          <Harness />
        </BackendProvider>,
      );
    await act(async () => {
      render();
    });
    const rerender = () => act(async () => render());
    return { latest, holder, projectsRef, rerender };
  }

  it("loads the graph, then short-circuits unchanged rounds", async () => {
    const payload = createDigestPayload();
    const calls: Array<{
      knownFingerprint?: string | undefined;
      viewer?: { readonly name?: string } | undefined;
    }> = [];
    const { latest, holder } = await mountWith(
      async (input) => {
        calls.push({ knownFingerprint: input.knownFingerprint, viewer: input.viewer });
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
    // The request carries the viewer's display name for the server's burndown join.
    expect(calls[0]?.viewer?.name).toBe("Philip");

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

  it("reports 'retrying' on a failed fetch, carries no raw error, and recovers on its own", async () => {
    const { latest, holder } = await mountWith(async () => {
      // The kind of failure the owner saw on a cold start: the fetch never reaches
      // the route. The raw text here must never surface in the UI.
      throw new Error(
        "Request to /api/t3team/mywork-digest/graph/poll failed: CORS mismatch or blocked preflight.",
      );
    }, [createProject({ id: "p1", externalProjectId: "IES" })]);

    await vi.waitFor(() => {
      expect(latest.result?.status).toBe("retrying");
    });
    expect(latest.result?.error).toBeUndefined();
    expect(latest.result?.graph).toBeNull();

    // The backend "comes up": the next successful round recovers the view with no user action.
    holder.fn = async () => ({
      unchanged: false,
      fingerprint: "sha256:up",
      value: createDigestPayload(),
    });
    await act(async () => {
      latest.result?.reload();
    });
    await vi.waitFor(() => {
      expect(latest.result?.status).toBe("ready");
    });
    expect(latest.result?.graph?.tickets).toHaveLength(2);
  });

  it("takes the last-visit cutoff from the server receipt and writes no digest state to localStorage", async () => {
    const { latest } = await mountWith(
      async () => ({
        unchanged: false,
        fingerprint: "sha256:lv",
        value: {
          ...createDigestPayload(),
          viewer: { name: "Philip", lastVisitAt: "2026-09-13T00:00:00.000Z" },
        },
      }),
      [createProject({ id: "p1", externalProjectId: "IES" })],
    );
    await vi.waitFor(() => {
      expect(latest.result?.status).toBe("ready");
    });
    expect(latest.result?.graph?.viewer.lastVisitAt).toBe("2026-09-13T00:00:00.000Z");
    // The owner storage rule: localStorage in My Work holds view preferences only.
    expect(window.localStorage.getItem("t3team.mywork-digest.last-visit.project")).toBeNull();
  });

  it("invalidates and refetches when the project scope changes", async () => {
    const calls: string[] = [];
    const payloadFor = (key: string) => ({
      scope: "project" as const,
      projects: [
        {
          project: { id: key, name: key },
          tickets: [],
          claims: [],
          decisions: [],
          changeRequests: [],
          transitions: [],
        },
      ],
    });
    const { latest, projectsRef, rerender } = await mountWith(
      async (input) => {
        const key = input.projects[0]?.externalProjectId ?? "?";
        calls.push(key);
        return { unchanged: false, fingerprint: `fp-${key}`, value: payloadFor(key) };
      },
      [createProject({ id: "pA", externalProjectId: "AAA" })],
    );
    await vi.waitFor(() => {
      expect(latest.result?.status).toBe("ready");
    });
    expect(calls).toEqual(["AAA"]);

    // The owner repro: switching the project in the selector must not keep the
    // previous project's content — the scope change invalidates and re-fetches.
    projectsRef.projects = [createProject({ id: "pB", externalProjectId: "BBB" })];
    await rerender();
    await vi.waitFor(() => {
      expect(latest.result?.graph?.projects[0]?.name).toBe("BBB");
    });
    expect(calls.at(-1)).toBe("BBB");
  });

  it("reaches a proper ready state for a scope where the user has no items", async () => {
    // The owner repro: the digest "loads" in one project but hangs in another. An
    // empty scope (no assigned tickets) is a well-formed answer, not a failure —
    // the hook must land on "ready" with an empty graph, never sit in a stuck state.
    const payloadFor = (key: string, withItems: boolean) => ({
      scope: "project" as const,
      projects: [
        {
          project: { id: key, name: `${key} NG` },
          tickets: withItems
            ? [
                {
                  id: "issue-900",
                  displayId: `${key}-900`,
                  title: "Only item",
                  provider: "atlassian" as const,
                  kind: "issue" as const,
                  url: `https://jira/${key}-900`,
                  projectId: key,
                  status: "To Do",
                  assignee: "Philip",
                  updatedAt: "2026-09-14T08:00:00.000Z",
                },
              ]
            : [],
          claims: [],
          decisions: [],
          changeRequests: [],
          transitions: [],
        },
      ],
    });
    const calls: string[] = [];
    const { latest, projectsRef, rerender } = await mountWith(
      async (input) => {
        const key = input.projects[0]?.externalProjectId ?? "?";
        calls.push(key);
        return {
          unchanged: false,
          fingerprint: `fp-${key}`,
          value: payloadFor(key, key === "AAA"),
        };
      },
      [createProject({ id: "pA", externalProjectId: "AAA" })],
    );
    await vi.waitFor(() => {
      expect(latest.result?.status).toBe("ready");
    });
    expect(latest.result?.graph?.tickets).toHaveLength(1);

    // Switch to the empty scope: the refetch lands on ready with zero tickets.
    // The view renders the "Nothing needs you" panel from this state — it must
    // not be "loading", "retrying", or stuck behind a stale graph.
    projectsRef.projects = [createProject({ id: "pB", externalProjectId: "BBB" })];
    await rerender();
    await vi.waitFor(() => {
      expect(latest.result?.graph?.projects[0]?.name).toBe("BBB NG");
    });
    expect(latest.result?.status).toBe("ready");
    expect(latest.result?.graph?.tickets).toHaveLength(0);
    expect(latest.result?.error).toBeUndefined();
  });

  it("refetches when switching between two app projects bound to the same Jira project", async () => {
    // Same account + external project id, different APP project id: the scope
    // signature must still change, because the server joins claims and decisions
    // per app project.
    const calls: string[] = [];
    const { latest, projectsRef, rerender } = await mountWith(
      async (input) => {
        const appProjectId = input.projects[0]?.appProjectId ?? "?";
        calls.push(appProjectId);
        return {
          unchanged: false,
          fingerprint: `fp-${appProjectId}`,
          value: {
            scope: "project" as const,
            projects: [
              {
                project: { id: appProjectId, name: "IES NG" },
                tickets: [],
                claims: [],
                decisions: [],
                changeRequests: [],
                transitions: [],
              },
            ],
          },
        };
      },
      [createProject({ id: "appA", externalProjectId: "IES", accountId: "acct-same" })],
    );
    await vi.waitFor(() => {
      expect(latest.result?.status).toBe("ready");
    });
    expect(calls).toEqual(["appA"]);

    projectsRef.projects = [
      createProject({ id: "appB", externalProjectId: "IES", accountId: "acct-same" }),
    ];
    await rerender();
    await vi.waitFor(() => {
      expect(latest.result?.graph?.projects[0]?.id).toBe("appB");
    });
    expect(calls.at(-1)).toBe("appB");
  });
});
