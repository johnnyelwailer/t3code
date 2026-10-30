import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildPendingNewTasks } from "../state/pending-new-tasks-model";
import { newTaskDraftKey } from "../state/new-task-draft-key";
import type { ComposerDraft } from "../state/use-composer-drafts";
import { NO_PENDING_DRAFTS } from "./t3team-pendingDraft";
import type { PendingDraft } from "./t3team-pendingDraftTypes";

const environmentId = EnvironmentId.make("cloud-env");
const projectId = ProjectId.make("cloud-project");
const draftKey = newTaskDraftKey("pending-1");

const pending: PendingDraft = {
  project: { environmentId: "cloud-env", id: "cloud-project", title: "Cloud session" },
  statusLabel: "Starting",
  tone: "working",
  sendBlockedReason: "Waiting for the session to start.",
  Card: null,
};

function draft(text = ""): ComposerDraft {
  return {
    text,
    attachments: [],
    project: { environmentId, projectId, createdAt: "2026-10-30T00:00:00.000Z" },
  };
}

describe("buildPendingNewTasks with a distribution's pending drafts", () => {
  it("is the stock list without a pending map: empty drafts stay out", () => {
    const drafts = { [draftKey]: draft() };
    expect(buildPendingNewTasks({ queuedMessages: [], drafts })).toEqual([]);
    expect(buildPendingNewTasks({ queuedMessages: [], drafts, pendingDrafts: NO_PENDING_DRAFTS })).toEqual([]);
  });

  it("lists an empty draft the distribution holds, and reopens it by its draft key", () => {
    const tasks = buildPendingNewTasks({
      queuedMessages: [],
      drafts: { [draftKey]: draft(), [newTaskDraftKey("other")]: draft() },
      pendingDrafts: new Map([[draftKey, pending]]),
    });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      kind: "draft",
      key: `draft-task:${draftKey}`,
      title: "Cloud session",
      environmentId,
      projectId,
      draftKey,
    });
  });

  it("keeps the prompt as the title of a held draft that has one", () => {
    const [task] = buildPendingNewTasks({
      queuedMessages: [],
      drafts: { [draftKey]: draft("Fix the login bug") },
      pendingDrafts: new Map([[draftKey, pending]]),
    });
    expect(task?.title).toBe("Fix the login bug");
  });
});
