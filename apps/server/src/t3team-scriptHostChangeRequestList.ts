/**
 * `ctx.changeRequests.list` for recipe scripts: upstream's pull request listing
 * (`PullRequestService.list`) for the run's project only, which already spans the project's own
 * repository and its linked repositories. Each row says how the viewer is involved, so one
 * `involvement: "all"` read answers both "mine" and "asked to review".
 */
import type { ProjectId, PullRequestListEntry, PullRequestListResult } from "@t3tools/contracts";
import {
  type ChangeRequestInvolvement,
  type ChangeRequestList,
  type ChangeRequestListOptions,
  ChangeRequestInputError,
} from "@t3team/sdk";
import * as Effect from "effect/Effect";

import type { PullRequestService } from "./pullRequest/PullRequestService.ts";

const STATES = new Set(["open", "closed", "merged", "all"]);
const INVOLVEMENTS = new Set(["authored", "reviewing", "all"]);

function involvementOf(
  entry: PullRequestListEntry,
  viewers: PullRequestListResult["viewers"],
): ReadonlyArray<ChangeRequestInvolvement> {
  const viewer = viewers[entry.host]?.toLowerCase();
  const authored = viewer !== undefined && entry.author?.login.toLowerCase() === viewer;
  return [
    ...(authored ? (["authored"] as const) : []),
    ...(entry.viewerReviewRequested ? (["reviewing"] as const) : []),
  ];
}

function toChangeRequestList(result: PullRequestListResult): ChangeRequestList {
  return {
    entries: result.entries.map((entry) => ({
      provider: entry.provider,
      host: entry.host,
      repository: entry.repository,
      number: entry.number,
      title: entry.title,
      url: entry.url,
      state: entry.state,
      isDraft: entry.isDraft,
      author: entry.author === null ? null : { login: entry.author.login, name: entry.author.name },
      headBranch: entry.headBranch,
      baseBranch: entry.baseBranch,
      labels: entry.labels.map((label) => label.name),
      updatedAt: entry.updatedAt,
      involvement: involvementOf(entry, result.viewers),
    })),
    viewers: result.viewers,
    unreadable: result.providers
      .filter((provider) => !provider.configured)
      .map((provider) => ({ host: provider.host, detail: provider.detail })),
    errors: result.errors.map((error) => error.message),
    truncated: result.truncated,
  };
}

export const listChangeRequests = (
  pullRequests: PullRequestService["Service"],
  projectId: ProjectId,
  options: ChangeRequestListOptions = {},
) =>
  Effect.gen(function* () {
    const state = options.state ?? "open";
    const involvement = options.involvement ?? "all";
    if (!STATES.has(state) || !INVOLVEMENTS.has(involvement)) {
      return yield* Effect.fail(
        new ChangeRequestInputError(`Invalid change request list filter: ${state}/${involvement}`),
      );
    }
    if (
      options.limit !== undefined &&
      (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 500)
    ) {
      return yield* Effect.fail(
        new ChangeRequestInputError(`Invalid change request list limit: ${options.limit}`),
      );
    }
    const result = yield* pullRequests.list({
      state,
      involvement,
      projectId,
      ...(options.limit === undefined ? {} : { limit: options.limit }),
    });
    return toChangeRequestList(result);
  });
