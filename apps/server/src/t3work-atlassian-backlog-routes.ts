import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpRouter } from "effect/unstable/http";

import {
  createT3workAtlassianBacklogSubtask,
  loadT3workAtlassianBoardColumns,
  loadT3workAtlassianBacklog,
  searchT3workAtlassianAssignableUsers,
  type T3workAtlassianBoardColumnsInput,
  type T3workAtlassianAssignableUsersInput,
  type T3workAtlassianBacklogAssigneeUpdateInput,
  type T3workAtlassianBacklogCreateSubtaskInput,
  type T3workAtlassianBacklogEstimateUpdateInput,
  type T3workAtlassianBacklogInput,
  type T3workAtlassianIssueStatusUpdateInput,
  updateT3workAtlassianBacklogAssignee,
  updateT3workAtlassianBacklogEstimate,
  updateT3workAtlassianIssueStatus,
} from "./t3work-atlassian-backlog.ts";
import {
  searchT3workAtlassianBacklog,
  type T3workAtlassianBacklogSearchInput,
} from "./t3work-atlassian-backlogSearch.ts";
import { errorResponse, okJson, readJsonBody } from "./t3work-atlassian-http.ts";
import { type T3workPollEnvelope } from "./t3work-integration-polling.ts";

type T3workAtlassianBacklogPollInput = T3workAtlassianBacklogInput & {
  readonly poll: T3workPollEnvelope;
};

const t3workAtlassianBacklogReadRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/atlassian/backlog",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3workAtlassianBacklogInput>();
    const result = yield* loadT3workAtlassianBacklog(input);
    return okJson(result);
  }).pipe(Effect.catch(errorResponse)),
);

const t3workAtlassianBacklogPollRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/atlassian/backlog/poll",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3workAtlassianBacklogPollInput>();
    const { poll, ...request } = input;
    // While a background sync walk is still paging this selection, polls serve
    // the growing cache (and re-kick a stalled walk) instead of hitting the
    // provider; once the walk completes, polls go back to live refreshes.
    const cachedResult = yield* loadT3workAtlassianBacklog(request);
    const result =
      cachedResult.page.nextCursor || cachedResult.cache.source === "live"
        ? cachedResult
        : yield* loadT3workAtlassianBacklog({
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

const t3workAtlassianBacklogSearchRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/atlassian/backlog/search",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3workAtlassianBacklogSearchInput>();
    const result = yield* searchT3workAtlassianBacklog(input);
    return okJson(result);
  }).pipe(Effect.catch(errorResponse)),
);

const t3workAtlassianBoardColumnsRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/atlassian/board-columns",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3workAtlassianBoardColumnsInput>();
    const result = yield* loadT3workAtlassianBoardColumns(input);
    return okJson(result);
  }).pipe(Effect.catch(errorResponse)),
);

const t3workAtlassianBacklogAssignableUsersRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/atlassian/backlog/assignable-users",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3workAtlassianAssignableUsersInput>();
    const users = yield* searchT3workAtlassianAssignableUsers(input);
    return okJson({ users });
  }).pipe(Effect.catch(errorResponse)),
);

const t3workAtlassianBacklogAssigneeRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/atlassian/backlog/update-assignee",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3workAtlassianBacklogAssigneeUpdateInput>();
    yield* updateT3workAtlassianBacklogAssignee(input);
    return okJson({ ok: true });
  }).pipe(Effect.catch(errorResponse)),
);

const t3workAtlassianBacklogEstimateRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/atlassian/backlog/update-estimate",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3workAtlassianBacklogEstimateUpdateInput>();
    const result = yield* updateT3workAtlassianBacklogEstimate(input);
    return okJson({ ok: true, ...result });
  }).pipe(Effect.catch(errorResponse)),
);

const t3workAtlassianIssueStatusRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/atlassian/issue/update-status",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3workAtlassianIssueStatusUpdateInput>();
    const result = yield* updateT3workAtlassianIssueStatus(input);
    return okJson({ ok: true, ...result });
  }).pipe(Effect.catch(errorResponse)),
);

const t3workAtlassianBacklogCreateSubtaskRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/atlassian/backlog/create-subtask",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3workAtlassianBacklogCreateSubtaskInput>();
    const created = yield* createT3workAtlassianBacklogSubtask(input);
    return okJson({ created });
  }).pipe(Effect.catch(errorResponse)),
);

export const t3workAtlassianBacklogRouteLayer = Layer.mergeAll(
  t3workAtlassianBacklogReadRouteLayer,
  t3workAtlassianBacklogPollRouteLayer,
  t3workAtlassianBacklogSearchRouteLayer,
  t3workAtlassianBoardColumnsRouteLayer,
  t3workAtlassianBacklogAssignableUsersRouteLayer,
  t3workAtlassianBacklogAssigneeRouteLayer,
  t3workAtlassianBacklogEstimateRouteLayer,
  t3workAtlassianIssueStatusRouteLayer,
  t3workAtlassianBacklogCreateSubtaskRouteLayer,
);
