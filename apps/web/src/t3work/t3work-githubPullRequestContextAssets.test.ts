import { describe, expect, it } from "vitest";

import { createMockGitHubBackendApi } from "~/t3work/backend/t3work-mockBackendGitHub";
import { buildGitHubActivityContextBundle } from "~/t3work/t3work-githubActivityContextPayload";
import { buildGitHubActivityCacheRoot } from "~/t3work/t3work-contextCachePaths";
import { buildGitHubPullRequestRemoteAssetBundle } from "~/t3work/t3work-githubPullRequestContextAssets";
import {
  createActivity,
  createProject,
  createPullRequestContext,
} from "~/t3work/t3work-githubActivityContextPayload.testFixtures";

describe("buildGitHubPullRequestRemoteAssetBundle", () => {
  it("downloads remote PR images into local bundle assets and rewrites local references", async () => {
    const project = createProject();
    const item = createActivity();
    const context = {
      ...createPullRequestContext(),
      pullRequest: {
        ...createPullRequestContext().pullRequest,
        body: "## Summary\n\n![Architecture](https://images.example.test/pull-request-diagram.png)",
        body_html:
          '<h2>Summary</h2><p><img src="https://images.example.test/pull-request-diagram.png" alt="Architecture"></p>',
      },
      issueComments: [
        {
          id: 3,
          body: "Looks good\n\n![Comment screenshot](https://images.example.test/comment-screenshot.png)",
          body_html:
            '<p>Looks good</p><p><img src="https://images.example.test/comment-screenshot.png" alt="Comment screenshot"></p>',
        },
      ],
    };
    const root = buildGitHubActivityCacheRoot({
      projectId: project.id,
      repository: item.repository,
      activityId: item.id,
    });

    const remoteAssets = await buildGitHubPullRequestRemoteAssetBundle({
      backend: { github: createMockGitHubBackendApi() },
      root,
      context,
    });
    const bundle = buildGitHubActivityContextBundle({
      project,
      item,
      linkedWorkItem: null,
      pullRequestContext: context,
      pullRequestRemoteAssets: remoteAssets,
    });

    expect(remoteAssets.assetCount).toBe(2);
    expect(remoteAssets.downloadedCount).toBe(2);
    expect(bundle.fileReferences).toEqual(
      expect.arrayContaining([
        {
          label: "Remote assets index",
          relativePath: `${root}/pull-request/assets/index.json`,
        },
      ]),
    );

    const description = bundle.files.find(
      (file) => file.relativePath === `${root}/pull-request/description.md`,
    );
    const descriptionHtml = bundle.files.find(
      (file) => file.relativePath === `${root}/pull-request/description.html`,
    );
    const issueComments = bundle.files.find(
      (file) => file.relativePath === `${root}/pull-request/comments/issue-comments.md`,
    );
    const entryPoint = bundle.files.find((file) => file.relativePath === `${root}/entrypoint.json`);

    expect(description?.contents).toContain("assets/001-pull-request-diagram.png");
    expect(descriptionHtml?.contents).toContain('src="assets/001-pull-request-diagram.png"');
    expect(issueComments?.contents).toContain("../assets/002-comment-screenshot.png");
    expect(bundle.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relativePath: `${root}/pull-request/assets/001-pull-request-diagram.png`,
          encoding: "base64",
        }),
        expect.objectContaining({
          relativePath: `${root}/pull-request/assets/002-comment-screenshot.png`,
          encoding: "base64",
        }),
      ]),
    );
    expect(JSON.parse(entryPoint?.contents ?? "{}")).toMatchObject({
      paths: {
        pullRequest: {
          assets: {
            index: `${root}/pull-request/assets/index.json`,
            count: 2,
          },
        },
      },
    });
  });
});
