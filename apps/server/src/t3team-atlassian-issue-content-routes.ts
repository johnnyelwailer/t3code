import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpRouter } from "effect/unstable/http";

import {
  createT3TeamAtlassianIssueComment,
  createT3TeamAtlassianIssueLink,
  deleteT3TeamAtlassianIssueComment,
  deleteT3TeamAtlassianIssueLink,
  listT3TeamAtlassianIssueLinkTypes,
  updateT3TeamAtlassianIssueComment,
  type T3TeamAtlassianIssueCommentCreateInput,
  type T3TeamAtlassianIssueCommentDeleteInput,
  type T3TeamAtlassianIssueCommentUpdateInput,
  type T3TeamAtlassianIssueLinkCreateInput,
  type T3TeamAtlassianIssueLinkDeleteInput,
  type T3TeamAtlassianIssueLinkTypesInput,
} from "./t3team-atlassian-issue-content.ts";
import { errorResponse, okJson, readJsonBody } from "./t3team-atlassian-http.ts";

const t3teamAtlassianIssueCommentCreateRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/atlassian/issue/comment/create",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamAtlassianIssueCommentCreateInput>();
    const created = yield* createT3TeamAtlassianIssueComment(input);
    return okJson({ ok: true, created });
  }).pipe(Effect.catch(errorResponse)),
);

const t3teamAtlassianIssueCommentUpdateRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/atlassian/issue/comment/update",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamAtlassianIssueCommentUpdateInput>();
    yield* updateT3TeamAtlassianIssueComment(input);
    return okJson({ ok: true });
  }).pipe(Effect.catch(errorResponse)),
);

const t3teamAtlassianIssueCommentDeleteRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/atlassian/issue/comment/delete",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamAtlassianIssueCommentDeleteInput>();
    yield* deleteT3TeamAtlassianIssueComment(input);
    return okJson({ ok: true });
  }).pipe(Effect.catch(errorResponse)),
);

const t3teamAtlassianIssueLinkCreateRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/atlassian/issue/link/create",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamAtlassianIssueLinkCreateInput>();
    yield* createT3TeamAtlassianIssueLink(input);
    return okJson({ ok: true });
  }).pipe(Effect.catch(errorResponse)),
);

const t3teamAtlassianIssueLinkDeleteRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/atlassian/issue/link/delete",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamAtlassianIssueLinkDeleteInput>();
    yield* deleteT3TeamAtlassianIssueLink(input);
    return okJson({ ok: true });
  }).pipe(Effect.catch(errorResponse)),
);

const t3teamAtlassianIssueLinkTypesRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/atlassian/issue/link-types",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamAtlassianIssueLinkTypesInput>();
    const linkTypes = yield* listT3TeamAtlassianIssueLinkTypes(input);
    return okJson({ linkTypes });
  }).pipe(Effect.catch(errorResponse)),
);

export const t3teamAtlassianIssueContentRouteLayer = Layer.mergeAll(
  t3teamAtlassianIssueCommentCreateRouteLayer,
  t3teamAtlassianIssueCommentUpdateRouteLayer,
  t3teamAtlassianIssueCommentDeleteRouteLayer,
  t3teamAtlassianIssueLinkCreateRouteLayer,
  t3teamAtlassianIssueLinkDeleteRouteLayer,
  t3teamAtlassianIssueLinkTypesRouteLayer,
);
