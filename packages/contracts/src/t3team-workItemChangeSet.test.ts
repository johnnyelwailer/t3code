import { describe, expect, it } from "vite-plus/test";

import {
  hashDraftPayload,
  readWorkItemChangeSetOperationStatuses,
  verifyDraftPayloadHash,
} from "./t3team-workItemChangeSet.ts";

const draft = {
  target: { provider: "jira", issueIdOrKey: "A-1" },
  field: "comment",
  patch: { body: "hi", n: [1, undefined] },
} as const;

describe("work item change set payload hash", () => {
  it("is the SHA-256 of the key-sorted JSON of target, field and patch", async () => {
    expect(await hashDraftPayload(draft)).toBe(
      "26f2d9f2f0f6d698380cbba689bc003288e3991cd793295249f68bed6e446314",
    );
    const reordered = {
      patch: { n: [1, null], body: "hi" },
      field: "comment",
      target: { issueIdOrKey: "A-1", provider: "jira" },
    } as const;
    expect(await hashDraftPayload(reordered as never)).toBe(await hashDraftPayload(draft));
  });

  it("fails verification once anything the client acts on changed", async () => {
    const operation = { payloadHash: await hashDraftPayload(draft) };
    expect(await verifyDraftPayloadHash(draft, operation)).toBe(true);
    for (const changed of [
      { ...draft, patch: { ...draft.patch, body: "other" } },
      { ...draft, field: "description" },
      { ...draft, target: { ...draft.target, issueIdOrKey: "A-2" } },
    ]) {
      expect(await verifyDraftPayloadHash(changed as never, operation)).toBe(false);
    }
  });

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
