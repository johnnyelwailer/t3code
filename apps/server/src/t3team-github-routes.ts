import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/unstable/http";
import { VcsProcess } from "./vcs/VcsProcess.ts";
import { errorResponse, okJson, readJsonBody } from "./t3team-atlassian-http.ts";
import type { GitHubAssetDownloadRequest } from "./t3team-github-routes-asset-types.ts";
import { downloadGitHubAsset } from "./t3team-github-routes-asset-download.ts";
import { loadPullRequestContext } from "./t3team-github-routes-pr-context.ts";
import type { GitHubPullRequestContextRequest } from "./t3team-github-routes-pr-types.ts";
import { toT3TeamError } from "./t3team-project-repository-utils.ts";
export { t3teamGitHubInboxRouteLayer } from "./t3team-github-inbox-routes.ts";

export const t3teamGitHubPullRequestContextRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/github/pull-request-context",
  Effect.gen(function* () {
    const input = yield* readJsonBody<GitHubPullRequestContextRequest>();
    const response = yield* loadPullRequestContext(input).pipe(
      Effect.mapError((cause) =>
        toT3TeamError(cause, "Failed to load GitHub pull request context."),
      ),
    );
    return okJson(response);
  }).pipe(Effect.catch(errorResponse)),
);

export const t3teamGitHubAssetRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/github/asset",
  Effect.gen(function* () {
    const vcs = yield* VcsProcess;
    const input = yield* readJsonBody<GitHubAssetDownloadRequest>();
    const asset = yield* downloadGitHubAsset(vcs, input);
    return okJson({ asset });
  }).pipe(Effect.catch(errorResponse)),
);
