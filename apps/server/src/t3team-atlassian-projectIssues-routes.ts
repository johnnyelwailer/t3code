import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/unstable/http";

import { errorResponse, okJson, readJsonBody } from "./t3team-atlassian-http.ts";
import {
  loadT3TeamAtlassianProjectIssuesPage,
  type T3TeamAtlassianProjectIssuesInput,
} from "./t3team-atlassian-projectIssues.ts";

/**
 * Read-only projection over the whole-project mirror. There is deliberately no
 * poll/fingerprint variant: the payload is served from local SQLite, and the
 * `unchanged` protocol only pays off when the client keeps its own copy of the
 * payload — which is exactly the browser-side data cache this endpoint exists
 * to remove.
 */
export const t3teamAtlassianProjectIssuesRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/atlassian/project-issues",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamAtlassianProjectIssuesInput>();
    const page = yield* loadT3TeamAtlassianProjectIssuesPage(input);
    return okJson({ page });
  }).pipe(Effect.catch(errorResponse)),
);
