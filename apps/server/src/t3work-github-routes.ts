import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/unstable/http";
import { VcsProcess } from "./vcs/VcsProcess.ts";
import { errorResponse, okJson, readJsonBody } from "./t3work-atlassian-http.ts";
import type { GitHubAssetDownloadRequest } from "./t3work-github-routes-asset-types.ts";
import { downloadGitHubAsset } from "./t3work-github-routes-asset-download.ts";
import { loadPullRequestContext } from "./t3work-github-routes-pr-context.ts";
import type { GitHubPullRequestContextRequest } from "./t3work-github-routes-pr-types.ts";
import { toT3workError } from "./t3work-project-repository-utils.ts";
export { t3workGitHubInboxRouteLayer } from "./t3work-github-inbox-routes.ts";

export const t3workGitHubPullRequestContextRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/github/pull-request-context",
  Effect.gen(function* () {
    const vcs = yield* VcsProcess;
    const input = yield* readJsonBody<GitHubPullRequestContextRequest>();
    const response = yield* loadPullRequestContext(vcs, input).pipe(
      Effect.mapError((cause) =>
        toT3workError(cause, "Failed to load GitHub pull request context."),
      ),
    );
    return okJson(response);
  }).pipe(Effect.catch(errorResponse)),
);

export const t3workGitHubAssetRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/github/asset",
  Effect.gen(function* () {
    const vcs = yield* VcsProcess;
    const input = yield* readJsonBody<GitHubAssetDownloadRequest>();
    const asset = yield* downloadGitHubAsset(vcs, input);
    return okJson({ asset });
  }).pipe(Effect.catch(errorResponse)),
);
