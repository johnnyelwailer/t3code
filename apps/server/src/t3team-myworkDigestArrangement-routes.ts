/**
 * Arrangement writes the digest view can make without an agent: reset (back to the default),
 * promote (keep the draft), and discard (drop the draft). The body is the graph route's input
 * (scope + projects), so viewer identity and scope key resolve exactly as for the digest read.
 */
import { ProjectId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpRouter } from "effect/http";

import { badRequestJson, errorResponse, okJson, readJsonBody } from "./t3team-atlassian-http.ts";
import { digestArrangementKey } from "./t3team-myworkDigestArrangement.ts";
import {
  discardDigestDraft,
  promoteDigestDraft,
  resetDigestArrangement,
} from "./t3team-myworkDigestArrangementDraft.ts";
import { toDigestInput } from "./t3team-myworkDigestProjectEntries.ts";
import { ProjectStoreV2 } from "./orchestration-v2/ProjectStore.ts";
import type { T3TeamMyWorkDigestInput } from "./t3team-myworkDigestTypes.ts";

type ArrangementKey = NonNullable<ReturnType<typeof digestArrangementKey>>;

function arrangementRoute<E, R>(
  path: `/${string}`,
  act: (key: ArrangementKey) => Effect.Effect<unknown, E, R>,
) {
  return HttpRouter.add(
    "POST",
    path,
    Effect.gen(function* () {
      const requested = yield* readJsonBody<T3TeamMyWorkDigestInput>();
      // Identity comes from the server's own project bindings, never from the body's account ids.
      const projectId =
        requested.scope === "project" ? requested.projects[0]?.appProjectId?.trim() : undefined;
      if (requested.scope === "project" && !projectId) {
        return badRequestJson("A project-scoped arrangement needs the app project id.");
      }
      const shells = yield* (yield* ProjectStoreV2).listShells(
        projectId === undefined ? undefined : { projectIds: [ProjectId.make(projectId)] },
      );
      const key = digestArrangementKey(toDigestInput(shells, projectId));
      if (key === undefined) {
        return badRequestJson("Cannot resolve a viewer and scope for this arrangement.");
      }
      const rejected = yield* act(key).pipe(
        Effect.as(undefined),
        Effect.catch((error) =>
          isCallerFixable(error) ? Effect.succeed(error.message) : Effect.fail(error),
        ),
      );
      return rejected === undefined ? okJson({ ok: true }) : badRequestJson(rejected);
    }).pipe(Effect.catch(errorResponse)),
  );
}

const CALLER_FIXABLE = new Set([
  "T3TeamViewArrangementError",
  "T3TeamMyWorkArrangementInvalidError",
]);

/** Nothing to promote, or an invalid plan: a 400 with the reason, not a server error. */
const isCallerFixable = (error: unknown): error is { readonly message: string } =>
  error instanceof Error && "_tag" in error && CALLER_FIXABLE.has(String(error._tag));

export const t3teamMyWorkDigestArrangementRouteLayer = Layer.mergeAll(
  arrangementRoute("/api/t3team/mywork-digest/arrangement/reset", (key) =>
    resetDigestArrangement(key.identity, key.scope),
  ),
  arrangementRoute("/api/t3team/mywork-digest/arrangement/promote", (key) =>
    promoteDigestDraft(key.identity, key.scope),
  ),
  arrangementRoute("/api/t3team/mywork-digest/arrangement/discard", (key) =>
    discardDigestDraft(key.identity, key.scope),
  ),
);
