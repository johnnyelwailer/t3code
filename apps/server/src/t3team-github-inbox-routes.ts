import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/unstable/http";

import { errorResponse, okJson, readJsonBody } from "./t3team-atlassian-http.ts";
import { toT3TeamError } from "./t3team-project-repository-utils.ts";
import type { GitHubInboxDiscoverRequest } from "./t3team-github-routes-shared.ts";
import { VcsProcess } from "./vcs/VcsProcess.ts";
import { loadGitHubInboxResponse } from "./t3team-github-inbox-loader.ts";

/**
 * The repository-discovery flow (`discoverInbox` / `useGitHubRepositoryDiscovery`) still reads
 * this. Only its polling sibling, `/api/t3team/github/inbox/poll`, was dead — nothing calls
 * `pollInbox` since ticket<->PR matching moved onto `pullRequestEnvironment.list`.
 */
export const t3teamGitHubInboxRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/github/inbox",
  Effect.gen(function* () {
    const vcs = yield* VcsProcess;
    const input = yield* readJsonBody<GitHubInboxDiscoverRequest>();
    const response = yield* loadGitHubInboxResponse(vcs, input);
    return okJson(response);
  }).pipe(
    Effect.mapError((cause) => toT3TeamError(cause, "Failed to load GitHub repository inbox.")),
    Effect.catch(errorResponse),
  ),
);
