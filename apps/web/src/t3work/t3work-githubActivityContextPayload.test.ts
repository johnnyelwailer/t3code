import { describe, expect, it } from "vitest";

import { buildGitHubActivityContextBundle } from "~/t3work/t3work-githubActivityContextPayload";
import { buildJiraTicketEntryPoint } from "~/t3work/t3work-contextCachePaths";
import type { T3WorkDirectoryBundlePayload } from "~/t3work/t3work-contextDirectoryBundle";
import {
  createActivity,
  createProject,
  createPullRequestContext,
  createTicket,
} from "~/t3work/t3work-githubActivityContextPayload.testFixtures";

describe("buildGitHubActivityContextBundle", () => {
  it("includes linked ticket entrypoints and merges linked ticket files", () => {
    const project = createProject();
    const ticket = createTicket();
    const linkedTicketEntryPoint = buildJiraTicketEntryPoint(project.id, ticket.ref.displayId);
    const linkedTicketBundle: T3WorkDirectoryBundlePayload = {
      kind: "t3work-directory-bundle",
      dedupeKey: `${project.id}:${ticket.ref.displayId}:work-item`,
      bundleRootRelativePath: ".t3work/context/jira/project-alpha/items/proj-7",
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
        relativePath:
          ".t3work/context/github/project-alpha/example-project-alpha/pr-42/entrypoint.json",
      },
      { label: "Linked ticket entrypoint", relativePath: linkedTicketEntryPoint },
    ]);
    expect(bundle.files.some((file) => file.relativePath === linkedTicketEntryPoint)).toBe(true);

    const entryPoint = bundle.files.find(
      (file) =>
        file.relativePath ===
        ".t3work/context/github/project-alpha/example-project-alpha/pr-42/entrypoint.json",
    );
    expect(JSON.parse(entryPoint?.contents ?? "{}")).toMatchObject({
      kind: "github-activity-pr-open",
      paths: {
        linkedWorkItem:
          ".t3work/context/github/project-alpha/example-project-alpha/pr-42/linked-work-item/context.json",
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
          relativePath:
            ".t3work/context/github/project-alpha/example-project-alpha/pr-42/pull-request/overview.md",
        },
        {
          label: "PR diff",
          relativePath:
            ".t3work/context/github/project-alpha/example-project-alpha/pr-42/pull-request/diff.diff",
        },
        {
          label: "File snapshots index",
          relativePath:
            ".t3work/context/github/project-alpha/example-project-alpha/pr-42/pull-request/snapshots/index.json",
        },
      ]),
    );

    expect(
      bundle.files.some(
        (file) =>
          file.relativePath ===
          ".t3work/context/github/project-alpha/example-project-alpha/pr-42/pull-request/diff.diff",
      ),
    ).toBe(true);
    expect(
      bundle.files.some(
        (file) =>
          file.relativePath ===
          ".t3work/context/github/project-alpha/example-project-alpha/pr-42/pull-request/snapshots/head/src/context.ts",
      ),
    ).toBe(true);

    const entryPoint = bundle.files.find(
      (file) =>
        file.relativePath ===
        ".t3work/context/github/project-alpha/example-project-alpha/pr-42/entrypoint.json",
    );
    expect(JSON.parse(entryPoint?.contents ?? "{}")).toMatchObject({
      paths: {
        pullRequest: {
          overview:
            ".t3work/context/github/project-alpha/example-project-alpha/pr-42/pull-request/overview.md",
          diff: ".t3work/context/github/project-alpha/example-project-alpha/pr-42/pull-request/diff.diff",
        },
      },
    });
  });
});
