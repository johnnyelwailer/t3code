import { describe, expect, it, vi } from "vite-plus/test";

import type { T3TeamDraftMutationPayload } from "@t3tools/contracts";

import {
  applyChangeSetOperations,
  CHANGED_SINCE_PROPOSED,
  UnsupportedOperationError,
} from "~/t3team/changeset/t3team-changeSetApply";
import {
  readThreadChangeSets,
  resolveChangeSet,
  type ResolvedOperation,
} from "~/t3team/changeset/t3team-changeSetModel";
import {
  changeSetArtifact,
  FIXTURE_THREAD_ID,
  memberArtifact,
  type FixtureMember,
} from "~/t3team/changeset/t3team-changeSetFixtures";

const member = (id: string, issueKey: string, field: FixtureMember["field"], extra = {}) =>
  ({ id, issueKey, field, patch: { v: id }, ...extra }) as FixtureMember;

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
    record: vi.fn(async () => {}),
  };
}

const run = (approved: ReadonlyArray<ResolvedOperation>, d = deps(), rest = {}) =>
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
      member("d3", "NXAI-1", "estimate"),
    ]);
    const d = deps();
    const outcomes = await run(all, d);
    expect(outcomes.map((o) => o.status)).toEqual(["skipped", "skipped", "applied"]);
    expect(d.acceptOp).toHaveBeenCalledTimes(1);
  });

  it("refuses a payload changed since it was proposed, and writes nothing for it", async () => {
    const all = ops([member("d1", "NXAI-1", "status", { storedPatch: { v: "tampered" } })]);
    const d = deps();
    const [outcome] = await run(all, d);
    expect(outcome).toMatchObject({ status: "refused", message: CHANGED_SINCE_PROPOSED });
    expect(d.acceptOp).not.toHaveBeenCalled();
    expect(d.record).not.toHaveBeenCalled();
  });

  it("refuses a member that is missing or on another thread", async () => {
    const all = ops([member("d1", "NXAI-1", "status", { threadId: "thread-other" })]);
    const d = deps();
    expect((await run(all, d))[0]?.status).toBe("refused");
    expect(d.acceptOp).not.toHaveBeenCalled();
  });

  it("continues past a failure, which stays on that operation", async () => {
    const all = ops([member("d1", "NXAI-1", "status"), member("d2", "NXAI-2", "status")]);
    const outcomes = await run(all, deps(new Set(["d1"])));
    expect(outcomes.map((o) => o.status)).toEqual(["failed", "applied"]);
    expect(outcomes[0]?.message).toContain("write failed d1");
  });

  it("stops the rest of an issue when a failed field is written again later on it", async () => {
    const all = ops([
      member("d1", "NXAI-1", "status"),
      member("d2", "NXAI-1", "assignee"),
      member("d3", "NXAI-1", "status", { patch: { v: "second" } }),
      member("d4", "NXAI-2", "status"),
    ]);
    const outcomes = await run(all, deps(new Set(["d1"])));
    expect(outcomes.map((o) => o.status)).toEqual(["failed", "blocked", "blocked", "applied"]);
  });

  it("keeps going on the same issue when no later operation repeats the failed field", async () => {
    const all = ops([member("d1", "NXAI-1", "status"), member("d2", "NXAI-1", "assignee")]);
    expect((await run(all, deps(new Set(["d1"])))).map((o) => o.status)).toEqual([
      "failed",
      "applied",
    ]);
  });

  it("reports an operation kind with no accept path as unsupported", async () => {
    const all = ops([member("d1", "NXAI-1", "estimate")]);
    const d = {
      acceptOp: vi.fn().mockRejectedValue(new UnsupportedOperationError("from item")),
      record: vi.fn(),
    };
    expect((await run(all, d))[0]).toMatchObject({ status: "unsupported", message: "from item" });
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
    const failing = deps(new Set(["d2"]));
    await run(ops(members), failing);
    // d1's verdict is now stored as applied; d2 failed and is still a draft.
    const second = deps();
    const outcomes = await run(ops([{ ...members[0]!, status: "applied" }, members[1]!]), second);
    expect(outcomes.map((o) => o.status)).toEqual(["skipped", "applied"]);
    expect(second.acceptOp).toHaveBeenCalledTimes(1);
  });

  it("a write whose verdict could not be recorded is only re-recorded on retry", async () => {
    const all = ops([member("d1", "NXAI-1", "status")]);
    const flaky = {
      acceptOp: vi.fn(async () => {}),
      record: vi.fn().mockRejectedValueOnce(new Error("offline")),
    };
    expect((await run(all, flaky))[0]?.status).toBe("unrecorded");
    const retry = await run(all, flaky, { unrecordedDraftIds: new Set(["d1"]) });
    expect(retry[0]?.status).toBe("applied");
    expect(flaky.acceptOp).toHaveBeenCalledTimes(1);
  });
});
