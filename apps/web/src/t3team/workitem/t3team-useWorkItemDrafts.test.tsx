/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { useT3TeamDraftMutationStore } from "~/t3team/t3team-draftMutationStore";
import type { T3TeamDraftMutation } from "~/t3team/t3team-draftMutationTypes";
import {
  countWorkItemScalarDrafts,
  pickScalarDraft,
  useWorkItemDrafts,
  type WorkItemDraftsByField,
} from "~/t3team/workitem/t3team-useWorkItemDrafts";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function draft(overrides: Partial<T3TeamDraftMutation> & { readonly id: string }): T3TeamDraftMutation {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    target: { provider: "jira", issueIdOrKey: "ALPHA-1" },
    field: "status",
    status: "draft",
    patch: { targetStatus: "In Progress" },
    ...overrides,
  } as T3TeamDraftMutation;
}

describe("useWorkItemDrafts", () => {
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

  function mount(input: { readonly issueIdOrKey: string }): {
    readonly latest: { byField: WorkItemDraftsByField | null };
  } {
    const latest: { byField: WorkItemDraftsByField | null } = { byField: null };

    function Harness() {
      latest.byField = useWorkItemDrafts(input);
      return null;
    }

    act(() => {
      root?.render(<Harness />);
    });
    return { latest };
  }

  it("indexes pending drafts by field", () => {
    useT3TeamDraftMutationStore.setState({
      drafts: [
        draft({ id: "d1", field: "status" }),
        draft({ id: "d2", field: "assignee", patch: { assigneeAccountId: "acc-1" } }),
      ],
    });

    const { latest } = mount({ issueIdOrKey: "ALPHA-1" });
    expect(latest.byField?.status?.id).toBe("d1");
    expect(latest.byField?.assignee?.id).toBe("d2");
    expect(latest.byField?.estimate).toBeUndefined();
  });

  it("keeps the most recent draft when two target the same field", () => {
    useT3TeamDraftMutationStore.setState({
      drafts: [
        draft({ id: "newer", field: "status", createdAt: "2026-01-02T00:00:00.000Z" }),
        draft({ id: "older", field: "status", createdAt: "2026-01-01T00:00:00.000Z" }),
      ],
    });

    const { latest } = mount({ issueIdOrKey: "ALPHA-1" });
    expect(latest.byField?.status?.id).toBe("newer");
  });

  it("excludes drafts that are discarded, applied, or for a different issue", () => {
    useT3TeamDraftMutationStore.setState({
      drafts: [
        draft({ id: "gone-1", field: "status", status: "discarded" }),
        draft({ id: "gone-2", field: "assignee", status: "applied" }),
        draft({ id: "elsewhere", field: "estimate", target: { provider: "jira", issueIdOrKey: "OTHER-9" } }),
      ],
    });

    const { latest } = mount({ issueIdOrKey: "ALPHA-1" });
    expect(latest.byField).toEqual({});
  });

  it("indexes a field kind outside today's union without crashing", () => {
    // Simulates a future draft field (e.g. "link") landing before this module knows its name.
    const futureDraft = draft({ id: "future", field: "link" as T3TeamDraftMutation["field"] });
    useT3TeamDraftMutationStore.setState({ drafts: [futureDraft] });

    expect(() => mount({ issueIdOrKey: "ALPHA-1" })).not.toThrow();
  });

  it("pickScalarDraft narrows to a scalar draft and rejects a document draft on the same key", () => {
    const scalar = draft({ id: "s1", field: "status" });
    const byField: WorkItemDraftsByField = { status: scalar };
    expect(pickScalarDraft(byField, "status")?.id).toBe("s1");

    const document = draft({
      id: "doc1",
      field: "description",
      proposedContent: { format: "plain", body: "x" },
    });
    const mixedByField = { status: document } as unknown as WorkItemDraftsByField;
    expect(pickScalarDraft(mixedByField, "status")).toBeUndefined();
  });

  it("countWorkItemScalarDrafts excludes document drafts", () => {
    const byField: WorkItemDraftsByField = {
      status: draft({ id: "s1", field: "status" }),
      assignee: draft({ id: "a1", field: "assignee", patch: { assigneeAccountId: null } }),
      description: draft({
        id: "d1",
        field: "description",
        proposedContent: { format: "plain", body: "x" },
      }),
    };
    expect(countWorkItemScalarDrafts(byField)).toBe(2);
  });
});
