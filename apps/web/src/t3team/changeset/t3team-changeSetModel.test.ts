import { describe, expect, it } from "vite-plus/test";

import {
  groupByIssue,
  readChangeSetView,
  readThreadChangeSets,
  resolveChangeSet,
} from "~/t3team/changeset/t3team-changeSetModel";
import {
  changeSetArtifact,
  FIXTURE_THREAD_ID,
  memberArtifact,
  type FixtureMember,
} from "~/t3team/changeset/t3team-changeSetFixtures";

const status: FixtureMember = {
  id: "jira-draft:a",
  issueKey: "NXAI-1",
  field: "status",
  patch: { targetStatus: "Done" },
};
const estimate: FixtureMember = {
  id: "jira-draft:b",
  issueKey: "NXAI-2",
  field: "estimate",
  patch: { estimateMode: "points", estimateValue: 5 },
};

function resolve(members: ReadonlyArray<FixtureMember>, extra: ReadonlyArray<FixtureMember> = []) {
  const set = changeSetArtifact({ title: "Sprint cleanup", members });
  const artifacts = [...members, ...extra].map(memberArtifact).concat(set);
  const [changeSet] = readThreadChangeSets(artifacts, FIXTURE_THREAD_ID);
  return { artifacts, resolved: resolveChangeSet(changeSet!, artifacts, FIXTURE_THREAD_ID) };
}

describe("resolveChangeSet", () => {
  it("reads each operation's state from its member draft", () => {
    const { resolved } = resolve([status, { ...estimate, status: "applied" }]);
    expect(resolved.operations.map((op) => op.state)).toEqual(["draft", "applied"]);
  });

  it("refuses a member that sits on another thread", () => {
    const set = changeSetArtifact({ title: "t", members: [status] });
    const artifacts = [memberArtifact({ ...status, threadId: "thread-other" }), set];
    const [changeSet] = readThreadChangeSets(artifacts, FIXTURE_THREAD_ID);
    const { operations } = resolveChangeSet(changeSet!, artifacts, FIXTURE_THREAD_ID);
    expect(operations[0]).toMatchObject({ state: "missing" });
    expect(operations[0]?.draft).toBeUndefined();
  });

  it("refuses an artifact of the right id but another kind, and an absent member", () => {
    const set = changeSetArtifact({ title: "t", members: [status, estimate] });
    const impostor = { ...memberArtifact(status), kind: "widget" };
    const artifacts = [impostor, set];
    const [changeSet] = readThreadChangeSets(artifacts, FIXTURE_THREAD_ID);
    const { operations } = resolveChangeSet(changeSet!, artifacts, FIXTURE_THREAD_ID);
    expect(operations.map((op) => op.state)).toEqual(["missing", "missing"]);
  });

  it("marks a member edited after the set was proposed as changed", () => {
    const edited = { ...status, storedPatch: { targetStatus: "Cancelled" } };
    expect(resolve([edited]).resolved.operations[0]?.state).toBe("changed");
  });
});

describe("change set membership", () => {
  it("ignores a set that claims another source thread", () => {
    const set = changeSetArtifact({ title: "t", members: [status] });
    const payload = { ...(set.payload as object), sourceThreadId: "thread-other" };
    expect(readThreadChangeSets([{ ...set, payload }], FIXTURE_THREAD_ID)).toEqual([]);
  });

  it("owns its members while draft, and releases them once discarded", () => {
    const open = changeSetArtifact({ title: "t", members: [status, estimate] });
    expect([...readChangeSetView([open], FIXTURE_THREAD_ID).ownedDraftIds]).toEqual([
      "jira-draft:a",
      "jira-draft:b",
    ]);
    const discarded = changeSetArtifact({ title: "t", members: [status], status: "discarded" });
    expect(readChangeSetView([discarded], FIXTURE_THREAD_ID).ownedDraftIds.size).toBe(0);
  });
});

describe("grouping and selection", () => {
  it("groups by the member draft's issue, not the set's display copy", () => {
    const set = changeSetArtifact({
      title: "t",
      members: [status, { ...estimate, issueKey: "NXAI-1" }],
    });
    const spoofed = { ...(set.payload as { operations: Array<{ issueKey: string }> }) };
    spoofed.operations = spoofed.operations.map((op) => ({ ...op, issueKey: "FAKE-9" }));
    const artifacts = [status, { ...estimate, issueKey: "NXAI-1" }].map(memberArtifact);
    const resolved = resolveChangeSet(
      readThreadChangeSets([{ ...set, payload: spoofed }], FIXTURE_THREAD_ID)[0]!,
      artifacts,
      FIXTURE_THREAD_ID,
    );
    const groups = groupByIssue(resolved.operations);
    expect(groups.map((group) => [group.issueKey, group.operations.length])).toEqual([
      ["NXAI-1", 2],
    ]);
  });

  it("groups issue keys that differ only in case or whitespace", () => {
    const { resolved } = resolve([status, { ...estimate, issueKey: " nxai-1 " }]);
    expect(groupByIssue(resolved.operations).map((group) => group.issueKey)).toEqual(["NXAI-1"]);
  });
});

describe("duplicate draft ids", () => {
  it("resolves the first use and marks every repeat as a duplicate that is never applied", () => {
    const { artifacts, resolved } = resolve([status, estimate]);
    const [a, b] = resolved.changeSet.operations;
    const repeated = { ...resolved.changeSet, operations: [a!, a!, b!] };
    const { operations } = resolveChangeSet(repeated, artifacts, FIXTURE_THREAD_ID);
    expect(operations.map((op) => op.state)).toEqual(["draft", "duplicate", "draft"]);
  });

  it("is not rendered as a set at all when the payload repeats a draft id", () => {
    const set = changeSetArtifact({ title: "t", members: [status, status] });
    expect(readThreadChangeSets([set], FIXTURE_THREAD_ID)).toEqual([]);
  });
});

describe("readChangeSetView", () => {
  it("decodes once per artifacts snapshot and again when the snapshot changes", () => {
    const { artifacts } = resolve([status]);
    expect(readChangeSetView(artifacts, FIXTURE_THREAD_ID)).toBe(
      readChangeSetView(artifacts, FIXTURE_THREAD_ID),
    );
    expect(readChangeSetView([...artifacts], FIXTURE_THREAD_ID)).not.toBe(
      readChangeSetView(artifacts, FIXTURE_THREAD_ID),
    );
  });
});
