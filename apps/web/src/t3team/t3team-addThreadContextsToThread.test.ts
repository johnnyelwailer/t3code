import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { useComposerDraftStore } from "~/composerDraftStore";
import { addThreadContextsToThread } from "~/t3team/t3team-addThreadContextsToThread";

const toastAdd = vi.hoisted(() => vi.fn());

vi.mock("~/state/entities", () => ({
  readThreadShell: (ref: ScopedThreadRef) => ({ title: `Title of ${ref.threadId}` }),
}));
vi.mock("~/components/ui/toast", () => ({ toastManager: { add: toastAdd } }));

function ref(environmentId: string, threadId: string): ScopedThreadRef {
  return { environmentId: environmentId as EnvironmentId, threadId: threadId as ThreadId };
}

function draftContexts() {
  const drafts = useComposerDraftStore.getState().draftsByThreadKey;
  return Object.values(drafts).flatMap((draft) => draft.threadContexts ?? []);
}

describe("addThreadContextsToThread", () => {
  it("adds same-environment threads to a composer that is not mounted", () => {
    toastAdd.mockClear();
    const target = ref("env-a", "target-unmounted");

    const added = addThreadContextsToThread(target, [ref("env-a", "dropped-1")]);

    expect(added).toBe(true);
    expect(draftContexts().map((record) => record.contextId)).toEqual(
      expect.arrayContaining([expect.stringContaining("dropped-1")]),
    );
    expect(toastAdd).not.toHaveBeenCalled();
  });

  it("skips another environment's thread and says why", () => {
    toastAdd.mockClear();
    const target = ref("env-a", "target-foreign");

    const added = addThreadContextsToThread(target, [ref("env-b", "foreign-1")]);

    expect(added).toBe(false);
    expect(toastAdd).toHaveBeenCalledOnce();
  });
});
