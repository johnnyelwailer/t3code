import { describe, expect, it } from "vite-plus/test";

import {
  changeSetArtifact,
  FIXTURE_THREAD_ID,
  memberArtifact,
  type FixtureMember,
} from "~/t3team/changeset/t3team-changeSetFixtures";
import { readChangeSetView } from "~/t3team/changeset/t3team-changeSetModel";
import {
  applyButtonLabel,
  decisionOf,
  partitionBySelection,
  toggledDecision,
  type DecisionOverrides,
} from "~/t3team/changeset/t3team-changeSetSelection";

const members: ReadonlyArray<FixtureMember> = [
  { id: "s", issueKey: "N-1", field: "status", patch: { targetStatus: "Done" } },
  { id: "c", issueKey: "N-1", field: "comment", patch: { body: "Hello" } },
  { id: "d", issueKey: "N-1", field: "description", patch: { description: "Rewrite" } },
  {
    id: "x",
    issueKey: "N-2",
    field: "status",
    patch: { targetStatus: "Done" },
    storedPatch: { targetStatus: "Other" },
  },
];

const [set] = readChangeSetView(
  [...members.map(memberArtifact), changeSetArtifact({ title: "t", members })],
  FIXTURE_THREAD_ID,
).resolved;
const [status, comment, description, changed] = set!.operations;
const none: DecisionOverrides = new Map();

describe("default decisions", () => {
  it("approves a scalar change, but leaves a comment to an explicit tick", () => {
    expect(decisionOf(status!, none)).toBe("approve");
    expect(decisionOf(comment!, none)).toBe("undecided");
  });

  it("never approves a description or a changed operation", () => {
    expect(decisionOf(description!, none)).toBe("undecided");
    expect(decisionOf(changed!, none)).toBe("undecided");
    expect(toggledDecision(description!, none)).toBe("reject");
    expect(toggledDecision(changed!, none)).toBe("reject");
  });
});

describe("partitionBySelection", () => {
  it("applies only the scalar by default, and dismisses nothing unasked", () => {
    const { approved, rejected } = partitionBySelection(set!.operations, none);
    expect(approved.map((op) => op.operation.draftId)).toEqual(["s"]);
    expect(rejected).toEqual([]);
  });

  it("applies a comment once ticked, dismisses what is rejected, including a changed one", () => {
    const overrides: DecisionOverrides = new Map([
      ["c", toggledDecision(comment!, none)],
      ["s", toggledDecision(status!, none)],
      ["x", toggledDecision(changed!, none)],
    ]);
    const { approved, rejected } = partitionBySelection(set!.operations, overrides);
    expect(approved.map((op) => op.operation.draftId)).toEqual(["c"]);
    expect(rejected.map((op) => op.operation.draftId)).toEqual(["s", "x"]);
  });

  it("never sends again what is held as uncertain or unrecorded", () => {
    const { approved } = partitionBySelection(set!.operations, none, new Set(["s"]));
    expect(approved).toEqual([]);
  });
});

describe("applyButtonLabel", () => {
  it.each([
    [3, 2, "Apply 3 and dismiss 2"],
    [3, 0, "Apply 3"],
    [0, 2, "Dismiss 2"],
    [0, 0, "Nothing to apply"],
  ])("reads %i approved, %i dismissed as %s", (approved, dismissed, label) => {
    expect(applyButtonLabel(approved, dismissed)).toBe(label);
  });
});
