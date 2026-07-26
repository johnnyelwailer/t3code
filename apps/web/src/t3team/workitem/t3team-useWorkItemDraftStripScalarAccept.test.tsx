/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import { useT3TeamDraftMutationStore } from "~/t3team/t3team-draftMutationStore";
import type { T3TeamScalarDraftMutation } from "~/t3team/t3team-draftMutationTypes";
import { useWorkItemDraftStripScalarAccept } from "~/t3team/workitem/t3team-useWorkItemDraftStripScalarAccept";
import {
  useWorkItemFieldMutations,
  type WorkItemFieldMutations,
} from "~/t3team/workitem/t3team-useWorkItemFieldMutations";
import type { WorkItemFieldModel } from "~/t3team/workitem/t3team-workItemFieldModel";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const MODEL: WorkItemFieldModel = {
  key: "ALPHA-1",
  title: "Test item",
  status: { name: "To Do" },
  labels: [],
  components: [],
  fixVersions: [],
  affectsVersions: [],
  sprints: [],
};

function draft(field: T3TeamScalarDraftMutation["field"], patch: Record<string, unknown>): T3TeamScalarDraftMutation {
  return {
    id: `${field}-1`,
    createdAt: "2026-01-01T00:00:00.000Z",
    target: { provider: "jira", issueIdOrKey: "ALPHA-1" },
    field,
    status: "draft",
    patch,
  };
}

describe("useWorkItemDraftStripScalarAccept", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  beforeEach(() => {
    useT3TeamDraftMutationStore.setState({ drafts: [] });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  function mount(backend: Partial<AtlassianBackendApi>) {
    const latest: {
      resolve: ReturnType<typeof useWorkItemDraftStripScalarAccept> | null;
      mutations: WorkItemFieldMutations | null;
    } = { resolve: null, mutations: null };
    function Harness() {
      // Same hook the chip controls use — proves accept dispatches through the identical shared
      // instance, not a second copy the strip built for itself.
      const mutations = useWorkItemFieldMutations({
        issueIdOrKey: "ALPHA-1",
        model: MODEL,
        backend: backend as unknown as AtlassianBackendApi,
        accountId: "acct-1",
        onReload: () => undefined,
      });
      latest.mutations = mutations;
      latest.resolve = useWorkItemDraftStripScalarAccept({
        issueIdOrKey: "ALPHA-1",
        projectId: "proj-1",
        mutations,
        backend: backend as unknown as AtlassianBackendApi,
        accountId: "acct-1",
        onReload: () => undefined,
      });
      return null;
    }
    act(() => {
      root?.render(<Harness />);
    });
    return latest;
  }

  it("resolves status accept to the real updateIssueStatus call", async () => {
    const calls: unknown[] = [];
    const latest = mount({
      updateIssueStatus: async (input) => (calls.push(input), { status: input.targetStatus }),
    });
    const d = draft("status", { targetStatus: "Done" });
    useT3TeamDraftMutationStore.setState({ drafts: [d] });

    const accept = latest.resolve!(d);
    expect(accept).toBeDefined();
    await act(async () => {
      accept!();
      await Promise.resolve();
    });
    expect(calls).toEqual([{ accountId: "acct-1", issueIdOrKey: "ALPHA-1", targetStatus: "Done" }]);
  });

  it("accepting from the strip sets lastChange on the SAME mutation instance the chip reads for its undo banner", async () => {
    const latest = mount({ updateIssueStatus: async ({ targetStatus }) => ({ status: targetStatus }) });
    const d = draft("status", { targetStatus: "Done" });
    useT3TeamDraftMutationStore.setState({ drafts: [d] });

    expect(latest.mutations!.status.lastChange).toBeNull();

    await act(async () => {
      latest.resolve!(d)!();
      await Promise.resolve();
    });

    // This is exactly what `WorkItemFieldUndoBanner` reads inside the chip — if it's set here, the
    // chip renders the same "Status → Done · Undo" banner it would after a direct edit.
    expect(latest.mutations!.status.lastChange).toEqual({ from: "To Do", to: "Done" });
  });

  it("resolves a link create draft to createIssueLink", async () => {
    const calls: unknown[] = [];
    const latest = mount({ createIssueLink: async (input) => void calls.push(input) });
    const d = draft("link", {
      action: "create",
      otherIssueIdOrKey: "ALPHA-2",
      linkTypeName: "Blocks",
      direction: "outward",
    });
    useT3TeamDraftMutationStore.setState({ drafts: [d] });

    const accept = latest.resolve!(d);
    expect(accept).toBeDefined();
    await act(async () => {
      accept!();
      await Promise.resolve();
    });
    expect(calls).toEqual([
      {
        accountId: "acct-1",
        issueIdOrKey: "ALPHA-1",
        otherIssueIdOrKey: "ALPHA-2",
        linkTypeName: "Blocks",
        direction: "outward",
      },
    ]);
  });

  it("resolves a link remove draft to deleteIssueLink", async () => {
    const calls: unknown[] = [];
    const latest = mount({ deleteIssueLink: async (input) => void calls.push(input) });
    const d = draft("link", { action: "remove", linkId: "10001" });
    useT3TeamDraftMutationStore.setState({ drafts: [d] });

    await act(async () => {
      latest.resolve!(d)!();
      await Promise.resolve();
    });
    expect(calls).toEqual([{ accountId: "acct-1", linkId: "10001" }]);
  });

  it("resolves a subtask draft to createSubtask", async () => {
    const calls: unknown[] = [];
    const latest = mount({
      createSubtask: async (input) => {
        calls.push(input);
        return { id: "1", key: "ALPHA-3" };
      },
    });
    const d = draft("subtask", { summary: "Write the migration" });
    useT3TeamDraftMutationStore.setState({ drafts: [d] });

    await act(async () => {
      latest.resolve!(d)!();
      await Promise.resolve();
    });
    expect(calls).toEqual([
      { accountId: "acct-1", projectId: "proj-1", parentIssueIdOrKey: "ALPHA-1", summary: "Write the migration" },
    ]);
  });

  it("offers no accept for a patch it cannot parse", () => {
    const latest = mount({});
    const d = draft("link", { action: "create" }); // missing required fields
    expect(latest.resolve!(d)).toBeUndefined();
  });
});
