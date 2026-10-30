import { describe, expect, it } from "vite-plus/test";

import { readWorkItemChangeSetOperationStatuses } from "./t3team-workItemChangeSet.ts";

describe("work item change set statuses", () => {
  it("reads each operation's status from the member drafts, missing when removed", () => {
    const operations = [{ draftId: "d1" }, { draftId: "d2" }] as never;
    expect(
      readWorkItemChangeSetOperationStatuses({ operations }, [
        { id: "d1", payload: { kind: "draft-mutation", draft: { status: "applied" } } },
      ]),
    ).toEqual([
      { draftId: "d1", status: "applied" },
      { draftId: "d2", status: "missing" },
    ]);
  });
});
