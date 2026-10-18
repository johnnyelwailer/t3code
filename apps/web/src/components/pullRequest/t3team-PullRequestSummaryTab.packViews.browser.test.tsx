// t3team: the fork's pack Summary views on the PR Summary tab. Upstream's own cases live in
// PullRequestSummaryTab.browser.test.tsx; this file only covers what the fork adds.
import { SourceControlProviderKind } from "@t3tools/contracts";
import { EnvironmentId, ProjectId, type PullRequestDetailView } from "@t3tools/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

vi.mock(import("~/state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: (() => vi.fn()) as never,
}));

import { PullRequestSummaryTab } from "./PullRequestSummaryTab";
import { activateAppViewPacks } from "~/t3team/packs/t3team-appViewRegistry";
import {
  brokenPackWebModule,
  ciInsightsPackWebModule,
} from "~/t3team/packs/t3team-slotsPackFixtures";

const detail: PullRequestDetailView = {
  provider: SourceControlProviderKind.make("github"),
  projectId: ProjectId.make("project"),
  projectTitle: "Project",
  workspaceRoot: "/workspace",
  repository: "owner/repo",
  number: 1,
  title: "Test pull request",
  body: "Original description",
  url: "https://github.com/owner/repo/pull/1",
  author: { login: "author", name: null, avatarUrl: null },
  viewer: "author",
  state: "open",
  isDraft: false,
  mergeability: "mergeable",
  additions: 1,
  deletions: 0,
  changedFiles: 1,
  headBranch: "feature",
  baseBranch: "main",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  mergedAt: null,
  closedAt: null,
  reviewers: [],
  labels: [],
  checks: [{ name: "Unit tests", status: "success", description: null, url: null }],
  comments: [],
  commentCount: 0,
  commentsTruncated: false,
  reviewThreads: [],
  commits: [],
  mergeCapabilities: { merge: false, squash: false, rebase: false },
  capabilities: {
    diff: true,
    comment: true,
    search: true,
    actions: [],
    mergeMethods: [],
    review: { inlineComment: false, reply: false, resolve: false, verdicts: [] },
    reviewers: { request: false, listCandidates: false },
    edit: { changeRequest: true, comment: true },
  },
  viewerPermissions: {
    actions: [],
    comment: true,
    resolve: false,
    verdicts: [],
    requestReviewers: false,
  },
};

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
});

const render = (value = detail) =>
  act(async () =>
    root.render(
      <PullRequestSummaryTab
        scrollerRef={() => {}}
        environmentId={EnvironmentId.make("environment")}
        threadRef={null}
        reference={value}
        detail={value}
        activityPending={false}
        activityError={null}
        onRefresh={() => {}}
      />,
    ),
  );

const paragraphs = () => [...container.querySelectorAll("p")].map((p) => p.textContent ?? "");

it("keeps the panel when a registered Summary view throws", async () => {
  await render();
  expect(paragraphs().some((text) => text.includes("could not be shown"))).toBe(false);

  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  activateAppViewPacks([ciInsightsPackWebModule, brokenPackWebModule]);
  await render({ ...detail });

  // The panel and the healthy card survive; the throwing view shows a one-line notice.
  expect(container.querySelector('section[aria-label="Description"]')).not.toBeNull();
  expect(paragraphs()).toContain("broken.summary could not be shown.");
  expect(paragraphs().some((text) => text.includes("Flaky tests"))).toBe(true);
  logged.mockRestore();
  activateAppViewPacks([]);
});
