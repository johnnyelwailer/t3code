/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { useT3TeamDraftMutationStore } from "~/t3team/t3team-draftMutationStore";
import type { T3TeamScalarDraftMutation } from "~/t3team/t3team-draftMutationTypes";
import { useWorkItemFieldDraftAccept } from "~/t3team/workitem/t3team-useWorkItemFieldDraftAccept";
import { useWorkItemFieldMutation } from "~/t3team/workitem/t3team-useWorkItemFieldMutation";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function makeDraft(id: string): T3TeamScalarDraftMutation {
  return {
    id,
    createdAt: "2026-01-01T00:00:00.000Z",
    target: { provider: "jira", issueIdOrKey: "ALPHA-1" },
    field: "status",
    status: "draft",
    patch: { targetStatus: "Done" },
  };
}

describe("useWorkItemFieldDraftAccept", () => {
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

  function mount(mutate: (next: string) => Promise<void>) {
    const latest: { accept: ((draft: T3TeamScalarDraftMutation, value: string) => void) | null } = {
      accept: null,
    };

    function Harness() {
      const mutation = useWorkItemFieldMutation<string>({
        value: "To Do",
        action: "testing",
        mutate,
      });
      latest.accept = useWorkItemFieldDraftAccept(mutation);
      return null;
    }

    act(() => {
      root?.render(<Harness />);
    });
    return latest;
  }

  it("accepting a draft commits through the same mutation path a direct edit uses", async () => {
    const calls: string[] = [];
    useT3TeamDraftMutationStore.setState({ drafts: [makeDraft("d1")] });
    const latest = mount((next) => {
      calls.push(next);
      return Promise.resolve();
    });

    await act(async () => {
      latest.accept?.(makeDraft("d1"), "Done");
      await Promise.resolve();
    });

    expect(calls).toEqual(["Done"]);
  });

  it("marks the draft applying immediately, then applied once the commit resolves", async () => {
    useT3TeamDraftMutationStore.setState({ drafts: [makeDraft("d1")] });
    const latest = mount(() => Promise.resolve());

    act(() => {
      latest.accept?.(makeDraft("d1"), "Done");
    });
    expect(useT3TeamDraftMutationStore.getState().drafts[0]?.status).toBe("applying");

    await act(async () => {
      await Promise.resolve();
    });
    expect(useT3TeamDraftMutationStore.getState().drafts[0]?.status).toBe("applied");
  });

  it("marks the draft error when the commit is rejected", async () => {
    useT3TeamDraftMutationStore.setState({ drafts: [makeDraft("d1")] });
    const latest = mount(() => Promise.reject(new Error("Request failed with 500")));

    await act(async () => {
      latest.accept?.(makeDraft("d1"), "Done");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(useT3TeamDraftMutationStore.getState().drafts[0]?.status).toBe("error");
  });

  it("dismiss (discardDraft) marks the draft discarded without touching the mutation", () => {
    useT3TeamDraftMutationStore.setState({ drafts: [makeDraft("d1")] });
    useT3TeamDraftMutationStore.getState().discardDraft("d1");
    expect(useT3TeamDraftMutationStore.getState().drafts[0]?.status).toBe("discarded");
  });
});
