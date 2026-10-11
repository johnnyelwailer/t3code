/**
 * Arrangement writes the digest view can make without an agent: reset (back to the default),
 * promote (keep the draft), and discard (drop the draft). The body is the graph route's input.
 */
import { ProjectId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Either from "effect/Either";
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

const loadArrangementKey = Effect.fn("t3team.digestArrangement.loadKey")(function* () {
  const requested = yield* readJsonBody<T3TeamMyWorkDigestInput>();
  const projectId =
    requested.scope === "project" ? requested.projects[0]?.appProjectId?.trim() : undefined;
  if (requested.scope === "project" && !projectId) {
    return { response: badRequestJson("A project-scoped reset needs the app project id.") };
  }
  const shells = yield* (yield* ProjectStoreV2).listShells(
    projectId === undefined ? undefined : { projectIds: [ProjectId.make(projectId)] },
  );
  const key = digestArrangementKey(toDigestInput(shells, projectId));
  if (key === undefined) {
    return { response: badRequestJson("Cannot resolve a viewer and scope for this arrangement.") };
  }
  return { key };
});

function arrangementRoute(
  path: string,
  act: (key: {
    readonly identity: Parameters<typeof resetDigestArrangement>[0];
    readonly scope: string;
  }) => Effect.Effect<void, Error>,
) {
  return HttpRouter.add(
    "POST",
    path,
    Effect.gen(function* () {
      const loaded = yield* loadArrangementKey();
      if ("response" in loaded) return loaded.response;
      const acted = yield* act(loaded.key).pipe(Effect.either);
      if (Either.isLeft(acted)) return badRequestJson(acted.left.message);
      return okJson({ ok: true });
    }).pipe(Effect.catch(errorResponse)),
  );
}

export const t3teamMyWorkDigestArrangementRouteLayer = Layer.mergeAll(
  arrangementRoute("/api/t3team/mywork-digest/arrangement/reset", (key) =>
    resetDigestArrangement(key.identity, key.scope).pipe(
      Effect.mapError((error) => (error instanceof Error ? error : new Error(String(error)))),
    ),
  ),
  arrangementRoute("/api/t3team/mywork-digest/arrangement/promote", (key) =>
    promoteDigestDraft(key.identity, key.scope).pipe(
      Effect.asVoid,
      Effect.mapError((error) => (error instanceof Error ? error : new Error(String(error)))),
    ),
  ),
  arrangementRoute("/api/t3team/mywork-digest/arrangement/discard", (key) =>
    discardDigestDraft(key.identity, key.scope).pipe(
      Effect.mapError((error) => (error instanceof Error ? error : new Error(String(error)))),
    ),
  ),
);
