import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpRouter } from "effect/unstable/http";

import { errorResponse, okJson, readJsonBody } from "./t3work-atlassian-http.ts";
import { type T3workPollEnvelope, toT3workPollResult } from "./t3work-integration-polling.ts";
import { toT3workError } from "./t3work-project-repository-utils.ts";
import type { GitHubInboxDiscoverRequest } from "./t3work-github-routes-shared.ts";
import { VcsProcess } from "./vcs/VcsProcess.ts";
import { loadGitHubInboxResponse } from "./t3work-github-inbox-loader.ts";

type GitHubInboxPollRequest = GitHubInboxDiscoverRequest & {
  readonly poll: T3workPollEnvelope;
};

const t3workGitHubInboxReadRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/github/inbox",
  Effect.gen(function* () {
    const vcs = yield* VcsProcess;
    const input = yield* readJsonBody<GitHubInboxDiscoverRequest>();
    const response = yield* loadGitHubInboxResponse(vcs, input);
    return okJson(response);
  }).pipe(
    Effect.mapError((cause) => toT3workError(cause, "Failed to load GitHub repository inbox.")),
    Effect.catch(errorResponse),
  ),
);

const t3workGitHubInboxPollRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/github/inbox/poll",
  Effect.gen(function* () {
    const vcs = yield* VcsProcess;
    const input = yield* readJsonBody<GitHubInboxPollRequest>();
    const response = yield* loadGitHubInboxResponse(vcs, input);
    return okJson(toT3workPollResult(response, input.poll));
  }).pipe(
    Effect.mapError((cause) => toT3workError(cause, "Failed to load GitHub repository inbox.")),
    Effect.catch(errorResponse),
  ),
);

export const t3workGitHubInboxRouteLayer = Layer.mergeAll(
  t3workGitHubInboxReadRouteLayer,
  t3workGitHubInboxPollRouteLayer,
);
