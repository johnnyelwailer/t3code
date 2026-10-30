import { describe, expect, it } from "vite-plus/test";

import * as Schema from "effect/Schema";

import {
  readWorkItemChangeSetOperationStatuses,
  WorkItemChangeSet,
} from "./t3team-workItemChangeSet.ts";

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

describe("WorkItemChangeSet", () => {
  const operation = (draftId: string) => ({
    draftId,
    issueKey: "NXAI-1",
    field: "status",
    summary: "s",
    payloadHash: "h",
  });
  const changeSet = (draftIds: ReadonlyArray<string>) => ({
    kind: "work-item-change-set",
    id: "jira-changeset:1",
    title: "t",
    sourceThreadId: "thread-1",
    createdAt: "2026-10-30T09:00:00.000Z",
    status: "draft",
    operations: draftIds.map(operation),
  });
  const decode = Schema.decodeUnknownSync(WorkItemChangeSet);

  it("accepts distinct draft ids and rejects a draft id listed twice", () => {
    expect(() => decode(changeSet(["d1", "d2"]))).not.toThrow();
    expect(() => decode(changeSet(["d1", "d1"]))).toThrow(/own draftId/);
  });
});
