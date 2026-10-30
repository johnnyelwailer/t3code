import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveRouteDraft } from "../features/threads/new-task-flow-state";
import { newTaskDraftKey } from "../state/new-task-draft-key";
import {
  draftRowTitle,
  followDraftStamp,
  listsDraft,
  pendingDraftHolding,
  pendingDraftSendBlock,
  placeholderProject,
  withPlaceholderProject,
} from "./t3team-pendingDraft";
import type { PendingDraft } from "./t3team-pendingDraftTypes";

const environmentId = EnvironmentId.make("cloud-env");
const projectId = ProjectId.make("cloud-project");
const draftKey = newTaskDraftKey("pending-1");

const pending: PendingDraft = {
  project: { environmentId: "cloud-env", id: "cloud-project", title: "Cloud session" },
  statusLabel: "Starting",
  tone: "working",
  sendBlockedReason: "Waiting for the session to start.",
  Card: () => null,
};

describe("placeholderProject", () => {
  it("builds a project with no checkout, so every workspace read is skipped", () => {
    expect(placeholderProject(pending.project)).toMatchObject({
      environmentId,
      id: projectId,
      title: "Cloud session",
      workspaceRoot: "",
      repositoryIdentity: null,
      defaultModelSelection: null,
      scripts: [],
    });
  });

  it("keeps a given workspace root and falls back to the id for a blank title", () => {
    expect(
      placeholderProject({ ...pending.project, title: " ", workspaceRoot: " /work/repo " }),
    ).toMatchObject({ title: "cloud-project", workspaceRoot: "/work/repo" });
  });

  it("is null for blank ids, which the contracts cannot brand", () => {
    expect(placeholderProject({ ...pending.project, id: " " })).toBeNull();
    expect(placeholderProject({ ...pending.project, environmentId: "" })).toBeNull();
  });
});

describe("withPlaceholderProject", () => {
  const placeholder = placeholderProject(pending.project) as EnvironmentProject;
  const listed = { ...placeholder, workspaceRoot: "/real" } satisfies EnvironmentProject;

  it("appends the placeholder to a catalog that lacks the project", () => {
    expect(withPlaceholderProject([], placeholder)).toEqual([placeholder]);
  });

  it("returns the catalog itself once it lists the project, or without a placeholder", () => {
    const catalog = [listed];
    expect(withPlaceholderProject(catalog, placeholder)).toBe(catalog);
    expect(withPlaceholderProject(catalog, null)).toBe(catalog);
  });

  it("lets the route draft resolve to open instead of returning to the picker", () => {
    const resolve = (projects: ReadonlyArray<EnvironmentProject>) =>
      resolveRouteDraft({
        flow: {
          environmentId: null,
          projectKey: null,
          draftKey: null,
          submitting: false,
          expandedProvider: null,
        },
        routeDraftId: draftKey,
        draftsLoaded: true,
        stamp: { environmentId, projectId },
        projects,
        stampedEnvironmentLoading: false,
      }).kind;
    expect(resolve([])).toBe("missing");
    expect(resolve(withPlaceholderProject([], placeholder))).toBe("open");
  });
});

describe("pendingDraftSendBlock", () => {
  it("prefers the distribution's reason and is the stock reason without a pending draft", () => {
    expect(pendingDraftSendBlock(pending, "stock")).toBe("Waiting for the session to start.");
    expect(pendingDraftSendBlock(pending, null)).toBe("Waiting for the session to start.");
    expect(pendingDraftSendBlock({ ...pending, sendBlockedReason: null }, "stock")).toBe("stock");
    expect(pendingDraftSendBlock(null, "stock")).toBe("stock");
    expect(pendingDraftSendBlock(null, null)).toBeNull();
  });
});

describe("the pending drafts list", () => {
  it("lists a draft with user content, or one the distribution holds", () => {
    expect(listsDraft(true, undefined)).toBe(true);
    expect(listsDraft(false, undefined)).toBe(false);
    expect(listsDraft(false, pending)).toBe(true);
  });

  it("titles an empty pending draft with its project and keeps a prompt's title", () => {
    expect(draftRowTitle(pending, false, "0 attachments")).toBe("Cloud session");
    expect(draftRowTitle(pending, true, "Fix the bug")).toBe("Fix the bug");
    expect(draftRowTitle(undefined, true, "Fix the bug")).toBe("Fix the bug");
  });
});

describe("pendingDraftHolding", () => {
  const stamp = { environmentId: "cloud-env", projectId: "cloud-project" };

  it("holds while the draft is on the placeholder's project", () => {
    expect(pendingDraftHolding(pending, stamp)).toBe(pending);
  });

  it("lets go once the draft is retargeted to another project or environment", () => {
    expect(pendingDraftHolding(pending, { ...stamp, projectId: "real-project" })).toBeNull();
    expect(pendingDraftHolding(pending, { ...stamp, environmentId: "real-env" })).toBeNull();
  });

  it("holds nothing without a pending draft or a project", () => {
    expect(pendingDraftHolding(undefined, stamp)).toBeNull();
    expect(pendingDraftHolding(null, stamp)).toBeNull();
    expect(pendingDraftHolding(pending, null)).toBeNull();
  });
});

describe("followDraftStamp", () => {
  const bound = {
    environmentId,
    projectKey: `${environmentId}:${projectId}`,
    draftKey,
    submitting: false,
    expandedProvider: null,
  };
  const real = { environmentId: EnvironmentId.make("real-env"), projectId: ProjectId.make("real") };

  it("moves the flow's selection to a restamped route draft", () => {
    expect(followDraftStamp(bound, draftKey, real)).toEqual({
      ...bound,
      environmentId: real.environmentId,
      projectKey: "real-env:real",
    });
  });

  it("returns the flow itself when the stamp already matches, or there is nothing to follow", () => {
    expect(followDraftStamp(bound, draftKey, { environmentId, projectId })).toBe(bound);
    expect(followDraftStamp(bound, draftKey, undefined)).toBe(bound);
    expect(followDraftStamp(bound, undefined, real)).toBe(bound);
    expect(followDraftStamp({ ...bound, draftKey: null }, draftKey, real)).toEqual({
      ...bound,
      draftKey: null,
    });
    expect(followDraftStamp(bound, newTaskDraftKey("other"), real)).toBe(bound);
  });
});
