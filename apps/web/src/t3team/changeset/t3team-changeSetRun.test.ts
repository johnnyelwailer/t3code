import { describe, expect, it, vi } from "vite-plus/test";

import {
  changeSetArtifact,
  FIXTURE_THREAD_ID,
  memberArtifact,
  type FixtureMember,
} from "~/t3team/changeset/t3team-changeSetFixtures";
import { readChangeSetView } from "~/t3team/changeset/t3team-changeSetModel";
import { useChangeSetOutcomeStore } from "~/t3team/changeset/t3team-changeSetOutcomeStore";
import {
  recordOperationVerdict,
  runChangeSet,
  type ChangeSetDeps,
} from "~/t3team/changeset/t3team-changeSetRun";

const members: ReadonlyArray<FixtureMember> = [
  { id: "a", issueKey: "N-1", field: "status", patch: { targetStatus: "Done" } },
  { id: "b", issueKey: "N-2", field: "comment", patch: { body: "Hello" } },
];
const [set] = readChangeSetView(
  [...members.map(memberArtifact), changeSetArtifact({ id: "set-1", title: "t", members })],
  FIXTURE_THREAD_ID,
).resolved;

const reset = () => useChangeSetOutcomeStore.setState({ outcomes: new Map(), running: new Map() });
const outcomeOf = (id: string) => useChangeSetOutcomeStore.getState().outcomes.get(id)?.status;

function deps(overrides: Partial<ChangeSetDeps> = {}): ChangeSetDeps {
  return {
    acceptOp: vi.fn(async () => {}),
    record: vi.fn(async () => {}),
    recordDiscard: vi.fn(async () => {}),
    sleep: async () => {},
    ...overrides,
  };
}

describe("runChangeSet", () => {
  it("keeps going after the card is gone, and a second run cannot start meanwhile", async () => {
    reset();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const d = deps({ acceptOp: vi.fn(() => gate) });
    const running = runChangeSet({
      changeSetId: "set-1",
      deps: d,
      approved: set!.operations,
      rejected: [],
    });
    expect(useChangeSetOutcomeStore.getState().running.get("set-1")).toEqual({ done: 0, total: 2 });
    await runChangeSet({ changeSetId: "set-1", deps: d, approved: set!.operations, rejected: [] });
    expect(d.acceptOp).toHaveBeenCalledTimes(1);
    release();
    await running;
    expect([outcomeOf("a"), outcomeOf("b")]).toEqual(["applied", "applied"]);
    expect(useChangeSetOutcomeStore.getState().running.has("set-1")).toBe(false);
  });

  it("keeps a write whose verdict will not record as unrecorded in the store", async () => {
    reset();
    const d = deps({ record: vi.fn().mockRejectedValue(new Error("offline")) });
    await runChangeSet({
      changeSetId: "set-1",
      deps: d,
      approved: [set!.operations[0]!],
      rejected: [],
    });
    expect(outcomeOf("a")).toBe("unrecorded");
    expect(d.acceptOp).toHaveBeenCalledTimes(1);
  });

  it("without an account, dismisses what was rejected and writes nothing", async () => {
    reset();
    const d = deps({ unavailableReason: "Connect Jira." });
    delete (d as { acceptOp?: unknown }).acceptOp;
    await runChangeSet({
      changeSetId: "set-1",
      deps: d,
      approved: [set!.operations[0]!],
      rejected: [set!.operations[1]!],
    });
    expect([outcomeOf("a"), outcomeOf("b")]).toEqual(["unsupported", "dismissed"]);
  });
});

describe("recordOperationVerdict", () => {
  it("marks an uncertain write as applied without writing it again", async () => {
    reset();
    useChangeSetOutcomeStore.getState().setOutcome({ draftId: "b", status: "uncertain" });
    const d = deps();
    await recordOperationVerdict(d, "b", "applied");
    expect(outcomeOf("b")).toBe("applied");
    expect(d.acceptOp).not.toHaveBeenCalled();
    expect(d.record).toHaveBeenCalledWith("b", "applied");
  });

  it("stays unrecorded when recording keeps failing, and dismiss failing reads as failed", async () => {
    reset();
    const d = deps({ record: vi.fn().mockRejectedValue(new Error("offline")) });
    await recordOperationVerdict(d, "a", "applied");
    await recordOperationVerdict(d, "b", "dismissed");
    expect([outcomeOf("a"), outcomeOf("b")]).toEqual(["unrecorded", "failed"]);
  });
});
