import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpRouter } from "effect/unstable/http";

import {
  createT3TeamAtlassianBacklogSubtask,
  loadT3TeamAtlassianBoardColumns,
  loadT3TeamAtlassianBacklog,
  searchT3TeamAtlassianAssignableUsers,
  type T3TeamAtlassianBoardColumnsInput,
  type T3TeamAtlassianAssignableUsersInput,
  type T3TeamAtlassianBacklogAssigneeUpdateInput,
  type T3TeamAtlassianBacklogCreateSubtaskInput,
  type T3TeamAtlassianBacklogEstimateUpdateInput,
  type T3TeamAtlassianBacklogInput,
  type T3TeamAtlassianIssueStatusUpdateInput,
  updateT3TeamAtlassianBacklogAssignee,
  updateT3TeamAtlassianBacklogEstimate,
  updateT3TeamAtlassianIssueStatus,
} from "./t3team-atlassian-backlog.ts";
import {
  searchT3TeamAtlassianBacklog,
  type T3TeamAtlassianBacklogSearchInput,
} from "./t3team-atlassian-backlogSearch.ts";
import { errorResponse, okJson, readJsonBody } from "./t3team-atlassian-http.ts";
import { type T3TeamPollEnvelope } from "./t3team-integration-polling.ts";

type T3TeamAtlassianBacklogPollInput = T3TeamAtlassianBacklogInput & {
  readonly poll: T3TeamPollEnvelope;
};

const t3teamAtlassianBacklogReadRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/atlassian/backlog",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamAtlassianBacklogInput>();
    const result = yield* loadT3TeamAtlassianBacklog(input);
    return okJson(result);
  }).pipe(Effect.catch(errorResponse)),
);

const t3teamAtlassianBacklogPollRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/atlassian/backlog/poll",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamAtlassianBacklogPollInput>();
    const { poll, ...request } = input;
    // While a background sync walk is still paging this selection, polls serve
    // the growing cache (and re-kick a stalled walk) instead of hitting the
    // provider; once the walk completes, polls go back to live refreshes.
    const cachedResult = yield* loadT3TeamAtlassianBacklog(request);
    const result =
      cachedResult.page.nextCursor || cachedResult.cache.source === "live"
        ? cachedResult
        : yield* loadT3TeamAtlassianBacklog({
            ...request,
            forceRefresh: true,
          });

    if (poll.knownFingerprint === result.cache.fingerprint) {
      return okJson({
        unchanged: true,
        fingerprint: result.cache.fingerprint,
      });
    }

    return okJson({
      unchanged: false,
      fingerprint: result.cache.fingerprint,
      value: result,
    });
  }).pipe(Effect.catch(errorResponse)),
);

const t3teamAtlassianBacklogSearchRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/atlassian/backlog/search",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamAtlassianBacklogSearchInput>();
    const result = yield* searchT3TeamAtlassianBacklog(input);
    return okJson(result);
  }).pipe(Effect.catch(errorResponse)),
);

const t3teamAtlassianBoardColumnsRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/atlassian/board-columns",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamAtlassianBoardColumnsInput>();
    const result = yield* loadT3TeamAtlassianBoardColumns(input);
    return okJson(result);
  }).pipe(Effect.catch(errorResponse)),
);

const t3teamAtlassianBacklogAssignableUsersRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/atlassian/backlog/assignable-users",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamAtlassianAssignableUsersInput>();
    const users = yield* searchT3TeamAtlassianAssignableUsers(input);
    return okJson({ users });
  }).pipe(Effect.catch(errorResponse)),
);

const t3teamAtlassianBacklogAssigneeRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/atlassian/backlog/update-assignee",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamAtlassianBacklogAssigneeUpdateInput>();
    yield* updateT3TeamAtlassianBacklogAssignee(input);
    return okJson({ ok: true });
  }).pipe(Effect.catch(errorResponse)),
);

const t3teamAtlassianBacklogEstimateRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/atlassian/backlog/update-estimate",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamAtlassianBacklogEstimateUpdateInput>();
    const result = yield* updateT3TeamAtlassianBacklogEstimate(input);
    return okJson({ ok: true, ...result });
  }).pipe(Effect.catch(errorResponse)),
);

const t3teamAtlassianIssueStatusRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/atlassian/issue/update-status",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamAtlassianIssueStatusUpdateInput>();
    const result = yield* updateT3TeamAtlassianIssueStatus(input);
    return okJson({ ok: true, ...result });
  }).pipe(Effect.catch(errorResponse)),
);

const t3teamAtlassianBacklogCreateSubtaskRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/atlassian/backlog/create-subtask",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamAtlassianBacklogCreateSubtaskInput>();
    const created = yield* createT3TeamAtlassianBacklogSubtask(input);
    return okJson({ created });
  }).pipe(Effect.catch(errorResponse)),
);

export const t3teamAtlassianBacklogRouteLayer = Layer.mergeAll(
  t3teamAtlassianBacklogReadRouteLayer,
  t3teamAtlassianBacklogPollRouteLayer,
  t3teamAtlassianBacklogSearchRouteLayer,
  t3teamAtlassianBoardColumnsRouteLayer,
  t3teamAtlassianBacklogAssignableUsersRouteLayer,
  t3teamAtlassianBacklogAssigneeRouteLayer,
  t3teamAtlassianBacklogEstimateRouteLayer,
  t3teamAtlassianIssueStatusRouteLayer,
  t3teamAtlassianBacklogCreateSubtaskRouteLayer,
);
