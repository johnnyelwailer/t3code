/**
 * POST /api/t3team/mywork-digest/arrangement/reset — drop the viewer's stored arrangement for a
 * scope, back to the client's heuristic default. The body is the graph route's input (scope +
 * projects), so viewer identity and scope key resolve exactly as they do for the digest read.
 */

import { ProjectId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/unstable/http";

import { badRequestJson, errorResponse, okJson, readJsonBody } from "./t3team-atlassian-http.ts";
import { clearDigestArrangement, digestArrangementKey } from "./t3team-myworkDigestArrangement.ts";
import { toDigestInput } from "./t3team-myworkDigestProjectEntries.ts";
import { ProjectStoreV2 } from "./orchestration-v2/ProjectStore.ts";
import type { T3TeamMyWorkDigestInput } from "./t3team-myworkDigestTypes.ts";

export const t3teamMyWorkDigestArrangementRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/mywork-digest/arrangement/reset",
  Effect.gen(function* () {
    const requested = yield* readJsonBody<T3TeamMyWorkDigestInput>();
    // Identity comes from the server's own project bindings, never from the body's account ids:
    // the body only says which scope (and, for a project scope, which app project).
    const projectId =
      requested.scope === "project" ? requested.projects[0]?.appProjectId?.trim() : undefined;
    if (requested.scope === "project" && !projectId) {
      return badRequestJson("A project-scoped reset needs the app project id.");
    }
    const shells = yield* (yield* ProjectStoreV2).listShells(
      projectId === undefined ? undefined : { projectIds: [ProjectId.make(projectId)] },
    );
    const key = digestArrangementKey(toDigestInput(shells, projectId));
    if (key === undefined) {
      return badRequestJson("Cannot resolve a viewer and scope for this arrangement.");
    }
    yield* clearDigestArrangement(key.identity, key.scope);
    return okJson({ ok: true });
  }).pipe(Effect.catch(errorResponse)),
);
