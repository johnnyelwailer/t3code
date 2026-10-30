import { describe, expect, it } from "vite-plus/test";

import {
  changeSetArtifact,
  FIXTURE_THREAD_ID,
  memberArtifact,
  type FixtureMember,
} from "~/t3team/changeset/t3team-changeSetFixtures";
import type { OperationOutcome } from "~/t3team/changeset/t3team-changeSetApply";
import { readChangeSetView } from "~/t3team/changeset/t3team-changeSetModel";
import { operationPolicy } from "~/t3team/changeset/t3team-changeSetPolicy";
import {
  applyButtonLabel,
  decisionOf,
  partitionBySelection,
  retryTargets,
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

describe("defaults per kind", () => {
  const kinds: ReadonlyArray<[string, FixtureMember, boolean]> = [
    [
      "status",
      { id: "k1", issueKey: "N-1", field: "status", patch: { targetStatus: "Done" } },
      true,
    ],
    [
      "assignee",
      { id: "k2", issueKey: "N-1", field: "assignee", patch: { assigneeAccountId: "u" } },
      true,
    ],
    [
      "story points",
      {
        id: "k3",
        issueKey: "N-1",
        field: "estimate",
        patch: { estimateMode: "points", estimateValue: 3 },
      },
      true,
    ],
    [
      "link removal",
      { id: "k4", issueKey: "N-1", field: "link", patch: { action: "remove", linkId: "L1" } },
      true,
    ],
    [
      "link creation",
      {
        id: "k5",
        issueKey: "N-1",
        field: "link",
        patch: { otherIssueIdOrKey: "N-2", linkTypeName: "Blocks", direction: "outward" },
      },
      false,
    ],
    [
      "subtask creation",
      { id: "k6", issueKey: "N-1", field: "subtask", patch: { summary: "Write tests" } },
      false,
    ],
    ["comment", { id: "k7", issueKey: "N-1", field: "comment", patch: { body: "Hi" } }, false],
  ];

  it.each(kinds)("%s: pre-approved is %s", (_name, member, approved) => {
    const [only] = readChangeSetView(
      [memberArtifact(member), changeSetArtifact({ title: "t", members: [member] })],
      FIXTURE_THREAD_ID,
    ).resolved[0]!.operations;
    expect(decisionOf(only!, none)).toBe(approved ? "approve" : "undecided");
    expect(operationPolicy(only!.draft).hint !== undefined).toBe(!approved);
  });
});

describe("retryTargets", () => {
  const outcome = (status: OperationOutcome["status"]) => ({ draftId: "", status });

  it("runs only failed and blocked approved operations, and not a failed one outside the selection", () => {
    const ops = [status!, comment!];
    const outcomes = new Map([
      ["s", { ...outcome("failed"), draftId: "s" }],
      ["c", { ...outcome("failed"), draftId: "c" }],
    ]);
    const selection = partitionBySelection(ops, none);
    const targets = retryTargets(selection, ops, outcomes, new Set());
    expect(targets.approved.map((op) => op.operation.draftId)).toEqual(["s"]);
  });

  it("leaves an operation blocked behind a held one on the same field", () => {
    const sameSlot = readChangeSetView(
      [
        ...["h", "b"].map((id) =>
          memberArtifact({ id, issueKey: "N-1", field: "status", patch: { targetStatus: id } }),
        ),
        changeSetArtifact({
          title: "t",
          members: ["h", "b"].map((id) => ({
            id,
            issueKey: "N-1",
            field: "status" as const,
            patch: { targetStatus: id },
          })),
        }),
      ],
      FIXTURE_THREAD_ID,
    ).resolved[0]!.operations;
    const outcomes = new Map<string, OperationOutcome>([
      ["h", { draftId: "h", status: "uncertain" }],
      ["b", { draftId: "b", status: "blocked" }],
    ]);
    const held = new Set(["h"]);
    const selection = partitionBySelection(sameSlot, none, held);
    expect(retryTargets(selection, sameSlot, outcomes, held).approved).toEqual([]);
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
