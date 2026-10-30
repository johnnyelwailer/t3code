import type { T3TeamDraftMutationPayload } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  applyChangeSetOperations,
  CHANGED_SINCE_PROPOSED,
  RefusedOperationError,
  UnsupportedOperationError,
} from "~/t3team/changeset/t3team-changeSetApply";
import {
  changeSetArtifact,
  FIXTURE_THREAD_ID,
  memberArtifact,
  type FixtureMember,
} from "~/t3team/changeset/t3team-changeSetFixtures";
import {
  readThreadChangeSets,
  resolveChangeSet,
  type ResolvedOperation,
} from "~/t3team/changeset/t3team-changeSetModel";

const PATCHES: Record<string, (id: string) => Record<string, unknown>> = {
  status: (id) => ({ targetStatus: `To ${id}` }),
  assignee: (id) => ({ assigneeAccountId: id }),
  comment: (id) => ({ body: `Comment ${id}` }),
  subtask: (id) => ({ summary: `Subtask ${id}` }),
};

const member = (
  id: string,
  issueKey: string,
  field: FixtureMember["field"],
  extra: Partial<FixtureMember> = {},
): FixtureMember => ({ id, issueKey, field, patch: PATCHES[field]!(id), ...extra });

function ops(members: ReadonlyArray<FixtureMember>): ReadonlyArray<ResolvedOperation> {
  const artifacts = [...members.map(memberArtifact), changeSetArtifact({ title: "t", members })];
  const [set] = readThreadChangeSets(artifacts, FIXTURE_THREAD_ID);
  return resolveChangeSet(set!, artifacts, FIXTURE_THREAD_ID).operations;
}

function deps(failing: ReadonlySet<string> = new Set()) {
  return {
    acceptOp: vi.fn(async (draft: T3TeamDraftMutationPayload) => {
      if (failing.has(draft.id)) throw new Error(`write failed ${draft.id}`);
    }),
    record: vi.fn<(draftId: string, verdict: "applied" | "dismissed") => Promise<void>>(
      async () => {},
    ),
    sleep: vi.fn(async (_ms: number) => {}),
  };
}

type RunDeps = Omit<Parameters<typeof applyChangeSetOperations>[0], "approved" | "rejected">;

const run = (approved: ReadonlyArray<ResolvedOperation>, d: RunDeps = deps(), rest = {}) =>
  applyChangeSetOperations({ approved, rejected: [], ...d, ...rest });

describe("applyChangeSetOperations", () => {
  it("applies in order, from the member payload, then records each verdict", async () => {
    const all = ops([member("d1", "NXAI-1", "status"), member("d2", "NXAI-2", "assignee")]);
    const d = deps();
    const outcomes = await run(all, d);
    expect(outcomes.map((o) => [o.draftId, o.status])).toEqual([
      ["d1", "applied"],
      ["d2", "applied"],
    ]);
    expect(d.acceptOp.mock.calls.map(([draft]) => draft)).toEqual(all.map((op) => op.draft));
    expect(d.record.mock.calls).toEqual([
      ["d1", "applied"],
      ["d2", "applied"],
    ]);
  });

  it("never reads the set's display copies: the write gets the member's own target", async () => {
    const [op] = ops([member("d1", "NXAI-1", "status")]);
    const spoofed = {
      ...op!,
      operation: { ...op!.operation, issueKey: "FAKE-9", field: "comment" as const },
    };
    const d = deps();
    await run([spoofed], d);
    expect(d.acceptOp.mock.calls[0]?.[0].target.issueIdOrKey).toBe("NXAI-1");
    expect(d.acceptOp.mock.calls[0]?.[0].field).toBe("status");
  });

  it("skips what is already applied or dismissed", async () => {
    const all = ops([
      member("d1", "NXAI-1", "status", { status: "applied" }),
      member("d2", "NXAI-1", "assignee", { status: "dismissed" }),
      member("d3", "NXAI-1", "comment"),
    ]);
    const d = deps();
    expect((await run(all, d)).map((o) => o.status)).toEqual(["skipped", "skipped", "applied"]);
    expect(d.acceptOp).toHaveBeenCalledTimes(1);
  });

  it("refuses a payload changed since it was proposed, and writes nothing for it", async () => {
    const all = ops([member("d1", "NXAI-1", "status", { storedPatch: { targetStatus: "Evil" } })]);
    const d = deps();
    expect((await run(all, d))[0]).toMatchObject({
      status: "refused",
      message: CHANGED_SINCE_PROPOSED,
    });
    expect(d.acceptOp).not.toHaveBeenCalled();
    expect(d.record).not.toHaveBeenCalled();
  });

  it("refuses a member that is missing or on another thread", async () => {
    const all = ops([member("d1", "NXAI-1", "status", { threadId: "thread-other" })]);
    const d = deps();
    expect((await run(all, d))[0]?.status).toBe("refused");
    expect(d.acceptOp).not.toHaveBeenCalled();
  });

  it("sends a draft id listed twice once, and refuses the repeat", async () => {
    const [first] = ops([member("d1", "NXAI-1", "status")]);
    const d = deps();
    const repeat = { ...first!, state: "duplicate" as const };
    expect((await run([first!, repeat], d)).map((o) => o.status)).toEqual(["applied", "refused"]);
    expect(d.acceptOp).toHaveBeenCalledTimes(1);
  });

  it("refuses what the accept op refuses, and reports an unsupported kind as such", async () => {
    const all = ops([member("d1", "NXAI-1", "status"), member("d2", "NXAI-2", "status")]);
    const d = {
      acceptOp: vi
        .fn()
        .mockRejectedValueOnce(new RefusedOperationError("wrong project"))
        .mockRejectedValueOnce(new UnsupportedOperationError("from item")),
      record: vi.fn(),
    };
    expect((await run(all, d)).map((o) => o.status)).toEqual(["refused", "unsupported"]);
    expect(d.record).not.toHaveBeenCalled();
  });

  it("continues past a failure of a repeatable write, which stays on that operation", async () => {
    const all = ops([member("d1", "NXAI-1", "status"), member("d2", "NXAI-2", "status")]);
    const outcomes = await run(all, deps(new Set(["d1"])));
    expect(outcomes.map((o) => o.status)).toEqual(["failed", "applied"]);
    expect(outcomes[0]?.message).toContain("write failed d1");
  });

  it("blocks only later writes to the same field of the same issue", async () => {
    const all = ops([
      member("d1", "NXAI-1", "status"),
      member("d2", "nxai-1", "status", { patch: { targetStatus: "Later" } }),
      member("d3", "NXAI-1", "assignee"),
      member("d4", "NXAI-2", "status"),
    ]);
    const outcomes = await run(all, deps(new Set(["d1"])));
    expect(outcomes.map((o) => o.status)).toEqual(["failed", "blocked", "applied", "applied"]);
  });

  it("treats a lost reply on a write that is not repeatable as uncertain, not failed", async () => {
    const all = ops([member("d1", "NXAI-1", "comment"), member("d2", "NXAI-1", "subtask")]);
    const outcomes = await run(all, deps(new Set(["d1", "d2"])));
    expect(outcomes.map((o) => o.status)).toEqual(["uncertain", "uncertain"]);
    expect(outcomes[0]?.message).toContain("May already be in Jira");
  });

  it("calls it failed when the server clearly rejected the write", async () => {
    const all = ops([member("d1", "NXAI-1", "comment")]);
    const outcomes = await run(all, deps(new Set(["d1"])), { isClearRejection: () => true });
    expect(outcomes[0]?.status).toBe("failed");
  });

  it("records rejected operations as dismissed, and reports progress", async () => {
    const [a, b] = ops([member("d1", "NXAI-1", "status"), member("d2", "NXAI-2", "status")]);
    const d = deps();
    const progress: Array<[number, number]> = [];
    const outcomes = await applyChangeSetOperations({
      approved: [a!],
      rejected: [b!],
      ...d,
      onProgress: (done, total) => progress.push([done, total]),
    });
    expect(outcomes.map((o) => o.status)).toEqual(["applied", "dismissed"]);
    expect(d.record).toHaveBeenLastCalledWith("d2", "dismissed");
    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it("is resumable: a re-run over the stored states applies only what is still a draft", async () => {
    const members = [member("d1", "NXAI-1", "status"), member("d2", "NXAI-2", "status")];
    await run(ops(members), deps(new Set(["d2"])));
    const second = deps();
    const outcomes = await run(ops([{ ...members[0]!, status: "applied" }, members[1]!]), second);
    expect(outcomes.map((o) => o.status)).toEqual(["skipped", "applied"]);
    expect(second.acceptOp).toHaveBeenCalledTimes(1);
  });

  it("retries a verdict that will not record, with backoff, and recovers", async () => {
    const all = ops([member("d1", "NXAI-1", "status")]);
    const d = deps();
    d.record
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("offline"));
    expect((await run(all, d))[0]?.status).toBe("applied");
    expect(d.record).toHaveBeenCalledTimes(3);
    expect(d.sleep.mock.calls.map(([ms]) => ms)).toEqual([500, 1500]);
  });

  it("reports a write whose verdict never records as unrecorded, after a bounded number of tries", async () => {
    const all = ops([member("d1", "NXAI-1", "status")]);
    const d = deps();
    d.record.mockRejectedValue(new Error("offline"));
    const [outcome] = await run(all, d);
    expect(outcome).toMatchObject({ status: "unrecorded" });
    expect(outcome?.message).toContain("do not apply it again");
    expect(d.record).toHaveBeenCalledTimes(3);
    expect(d.acceptOp).toHaveBeenCalledTimes(1);
  });
});
