import type { T3TeamDraftMutationPayload } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  changeSetArtifact,
  FIXTURE_THREAD_ID,
  memberArtifact,
  type FixtureMember,
} from "~/t3team/changeset/t3team-changeSetFixtures";
import { WorkItemChangeSetPanel } from "~/t3team/changeset/t3team-WorkItemChangeSetPanel";

import { render } from "../../../test/render";

const members: ReadonlyArray<FixtureMember> = [
  { id: "jira-draft:a", issueKey: "NXAI-1", field: "status", patch: { targetStatus: "Done" } },
  {
    id: "jira-draft:b",
    issueKey: "NXAI-1",
    field: "assignee",
    patch: { assigneeAccountId: "u1", assigneeDisplayName: "Ada" },
  },
  {
    id: "jira-draft:c",
    issueKey: "NXAI-2",
    field: "estimate",
    patch: { estimateMode: "points", estimateValue: 5 },
  },
];

const fullSet = [
  ...members.map(memberArtifact),
  changeSetArtifact({ title: "Sprint cleanup", members }),
];

function setup(artifacts = fullSet) {
  const deps = {
    acceptOp: vi.fn(async (_draft: T3TeamDraftMutationPayload) => {}),
    record: vi.fn(async () => {}),
    recordDiscard: vi.fn(async () => {}),
  };
  const ui = (
    <WorkItemChangeSetPanel threadId={FIXTURE_THREAD_ID} artifacts={artifacts} deps={deps} />
  );
  return { deps, ui };
}

describe("WorkItemChangeSetPanel", () => {
  it("defaults every operation to approved and applies them in order from the member drafts", async () => {
    const { deps, ui } = setup();
    await using screen = await render(ui, { router: false }); // no links or navigation here
    await screen.getByRole("button", { name: /Apply 3$/ }).click();
    await vi.waitFor(() => expect(deps.record).toHaveBeenCalledTimes(3));
    expect(deps.acceptOp.mock.calls.map(([draft]) => draft.id)).toEqual([
      "jira-draft:a",
      "jira-draft:b",
      "jira-draft:c",
    ]);
  });

  it("dismisses a rejected operation instead of applying it", async () => {
    const { deps, ui } = setup();
    await using screen = await render(ui, { router: false }); // no links or navigation here
    await screen.getByRole("checkbox", { name: "Approve proposed Points for NXAI-2" }).click();
    await screen.getByRole("button", { name: /Apply 2 and dismiss 1/ }).click();
    await vi.waitFor(() =>
      expect(deps.record).toHaveBeenLastCalledWith("jira-draft:c", "dismissed"),
    );
    expect(deps.acceptOp).toHaveBeenCalledTimes(2);
  });

  it("shows a member missing from the thread as missing and sends nothing for it", async () => {
    const { deps, ui } = setup([
      ...members.slice(0, 2).map(memberArtifact),
      changeSetArtifact({ title: "Sprint cleanup", members }),
    ]);
    await using screen = await render(ui, { router: false }); // no links or navigation here
    await expect.element(screen.getByText("Missing")).toBeVisible();
    await screen.getByRole("button", { name: /Apply 2$/ }).click();
    await vi.waitFor(() => expect(deps.record).toHaveBeenCalledTimes(2));
    expect(deps.acceptOp).toHaveBeenCalledTimes(2);
  });

  it("shows a comment's text and leaves it unapplied until it is ticked", async () => {
    const withComment: ReadonlyArray<FixtureMember> = [
      ...members,
      {
        id: "jira-draft:d",
        issueKey: "NXAI-2",
        field: "comment",
        patch: { body: "Ship it on Friday." },
      },
    ];
    const { deps, ui } = setup([
      ...withComment.map(memberArtifact),
      changeSetArtifact({ title: "Sprint cleanup", members: withComment }),
    ]);
    await using screen = await render(ui, { router: false }); // no links or navigation here
    await expect.element(screen.getByText("Ship it on Friday.")).toBeVisible();
    await screen.getByRole("checkbox", { name: "Approve proposed Comment for NXAI-2" }).click();
    await screen.getByRole("button", { name: /Apply 4$/ }).click();
    await vi.waitFor(() => expect(deps.acceptOp).toHaveBeenCalledTimes(4));
  });

  it("discards the whole set through the change set id", async () => {
    const { deps, ui } = setup();
    await using screen = await render(ui, { router: false }); // no links or navigation here
    await screen.getByRole("button", { name: "Discard set" }).click();
    await vi.waitFor(() => expect(deps.recordDiscard).toHaveBeenCalledWith("jira-changeset:set-1"));
  });
});
