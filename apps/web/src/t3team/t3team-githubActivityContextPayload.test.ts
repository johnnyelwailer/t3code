import { describe, expect, it } from "vite-plus/test";

import { buildGitHubActivityContextBundle } from "~/t3team/t3team-githubActivityContextPayload";
import {
  buildGitHubActivityCacheRoot,
  buildGitHubActivityEntryPoint,
  buildJiraTicketCacheRoot,
  buildJiraTicketEntryPoint,
} from "~/t3team/t3team-contextCachePaths";
import type { T3TeamDirectoryBundlePayload } from "~/t3team/t3team-contextDirectoryBundle";
import {
  createActivity,
  createProject,
  createPullRequestContext,
  createTicket,
} from "~/t3team/t3team-githubActivityContextPayload.testFixtures";

const GH_ACTIVITY_INPUT = {
  projectId: "Project Alpha",
  repository: "example/project-alpha",
  activityId: "PR-42",
};
const GH_ROOT = buildGitHubActivityCacheRoot(GH_ACTIVITY_INPUT);
const GH_ENTRY = buildGitHubActivityEntryPoint(GH_ACTIVITY_INPUT);
const LINKED_TICKET_ROOT = buildJiraTicketCacheRoot("Project Alpha", "PROJ-7");

describe("buildGitHubActivityContextBundle", () => {
  it("includes linked ticket entrypoints and merges linked ticket files", () => {
    const project = createProject();
    const ticket = createTicket();
    const linkedTicketEntryPoint = buildJiraTicketEntryPoint(project.id, ticket.ref.displayId);
    const linkedTicketBundle: T3TeamDirectoryBundlePayload = {
      kind: "t3team-directory-bundle",
      dedupeKey: `${project.id}:${ticket.ref.displayId}:work-item`,
      bundleRootRelativePath: LINKED_TICKET_ROOT,
      files: [{ relativePath: linkedTicketEntryPoint, contents: '{"kind":"jira-work-item"}' }],
      fileReferences: [{ label: "Ticket entrypoint", relativePath: linkedTicketEntryPoint }],
      lightweightItem: { kind: "jira-work-item", label: ticket.ref.title },
    };

    const bundle = buildGitHubActivityContextBundle({
      project,
      item: createActivity(),
      linkedWorkItem: ticket,
      linkedTicketBundle,
    });

    expect(bundle.fileReferences).toEqual([
      {
        label: "Activity entrypoint",
        relativePath: GH_ENTRY,
      },
      { label: "Linked ticket entrypoint", relativePath: linkedTicketEntryPoint },
    ]);
    expect(bundle.files.some((file) => file.relativePath === linkedTicketEntryPoint)).toBe(true);

    const entryPoint = bundle.files.find((file) => file.relativePath === GH_ENTRY);
    expect(JSON.parse(entryPoint?.contents ?? "{}")).toMatchObject({
      kind: "github-activity-pr-open",
      paths: {
        linkedWorkItem: `${GH_ROOT}/linked-work-item/context.json`,
      },
    });
  });

  it("writes a rich pull request artifact package when full PR context is available", () => {
    const project = createProject();
    const bundle = buildGitHubActivityContextBundle({
      project,
      item: createActivity(),
      linkedWorkItem: null,
      pullRequestContext: createPullRequestContext(),
    });

    expect(bundle.fileReferences).toEqual(
      expect.arrayContaining([
        {
          label: "PR overview",
          relativePath: `${GH_ROOT}/pull-request/overview.md`,
        },
        {
          label: "PR diff",
          relativePath: `${GH_ROOT}/pull-request/diff.diff`,
        },
        {
          label: "File snapshots index",
          relativePath: `${GH_ROOT}/pull-request/snapshots/index.json`,
        },
      ]),
    );

    expect(
      bundle.files.some((file) => file.relativePath === `${GH_ROOT}/pull-request/diff.diff`),
    ).toBe(true);
    expect(
      bundle.files.some(
        (file) => file.relativePath === `${GH_ROOT}/pull-request/snapshots/head/src/context.ts`,
      ),
    ).toBe(true);

    const entryPoint = bundle.files.find((file) => file.relativePath === GH_ENTRY);
    expect(JSON.parse(entryPoint?.contents ?? "{}")).toMatchObject({
      paths: {
        pullRequest: {
          overview: `${GH_ROOT}/pull-request/overview.md`,
          diff: `${GH_ROOT}/pull-request/diff.diff`,
        },
      },
    });
  });
});
