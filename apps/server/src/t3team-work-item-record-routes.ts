import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/http";
import * as Option from "effect/Option";
import { ProjectId } from "@t3tools/contracts";

import { ProjectStoreV2 } from "./orchestration-v2/ProjectStore.ts";
import {
  errorResponse,
  okJson,
  readJsonBody,
  T3TeamAtlassianError,
} from "./t3team-atlassian-http.ts";
import { toT3TeamError } from "./t3team-project-repository-utils.ts";
import { readWorkItemRecordForProject } from "./t3team-workItemReadLive.ts";

type ReadWorkItemRecordRequest = {
  readonly projectId?: string;
  readonly issueKey?: string;
};

/**
 * The full record of one work item, for a client carrying it to a thread on another environment
 * whose own server may have no Atlassian account. The reply is `t3_work_item_get`'s result, taken
 * from the same service, so the two cannot drift.
 */
export const t3teamWorkItemRecordRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/work-item/record",
  Effect.gen(function* () {
    const input = yield* readJsonBody<ReadWorkItemRecordRequest>();
    const projectId = input.projectId?.trim() ?? "";
    const issueKey = input.issueKey?.trim() ?? "";
    if (projectId.length === 0 || issueKey.length === 0) {
      return yield* new T3TeamAtlassianError({ message: "projectId and issueKey are required." });
    }
    const projects = yield* ProjectStoreV2;
    const shell = yield* projects
      .getShell(ProjectId.make(projectId))
      .pipe(Effect.mapError((error) => new T3TeamAtlassianError({ message: String(error) })));
    if (Option.isNone(shell)) {
      return yield* new T3TeamAtlassianError({ message: "The project was not found." });
    }
    const record = yield* readWorkItemRecordForProject({ project: shell.value, issueKey }).pipe(
      Effect.mapError((message) => new T3TeamAtlassianError({ message })),
    );
    return okJson(record);
  }).pipe(
    Effect.mapError((cause) => toT3TeamError(cause, "Failed to read the work item record.")),
    Effect.catch(errorResponse),
  ),
);
