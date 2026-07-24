import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpRouter } from "effect/unstable/http";

import { errorResponse, okJson, readJsonBody } from "./t3team-atlassian-http.ts";
import { type T3TeamPollEnvelope, toT3TeamPollResult } from "./t3team-integration-polling.ts";
import { toT3TeamError } from "./t3team-project-repository-utils.ts";
import type { GitHubInboxDiscoverRequest } from "./t3team-github-routes-shared.ts";
import { VcsProcess } from "./vcs/VcsProcess.ts";
import { loadGitHubInboxResponse } from "./t3team-github-inbox-loader.ts";

type GitHubInboxPollRequest = GitHubInboxDiscoverRequest & {
  readonly poll: T3TeamPollEnvelope;
};

const t3teamGitHubInboxReadRouteLayer = HttpRouter.add(
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

const t3teamGitHubInboxPollRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/github/inbox/poll",
  Effect.gen(function* () {
    const vcs = yield* VcsProcess;
    const input = yield* readJsonBody<GitHubInboxPollRequest>();
    const response = yield* loadGitHubInboxResponse(vcs, input);
    return okJson(toT3TeamPollResult(response, input.poll));
  }).pipe(
    Effect.mapError((cause) => toT3TeamError(cause, "Failed to load GitHub repository inbox.")),
    Effect.catch(errorResponse),
  ),
);

export const t3teamGitHubInboxRouteLayer = Layer.mergeAll(
  t3teamGitHubInboxReadRouteLayer,
  t3teamGitHubInboxPollRouteLayer,
);
