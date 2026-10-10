/**
 * Builds the per-run `ScriptHostContext` a recipe script sees as `ctx.store` and
 * `ctx.changeRequests` (seam S4). Called where a run's scripts are resolved: the recipe launch
 * route and boot rehydration, so a restored run gets the same members it launched with.
 *
 * Each member is present only when the run is entitled to it:
 *  - `store`: the recipe is a pack recipe (its directory is a registered pack recipe root) and that
 *    pack registered persistence, which requires `store:v1`. Bound to that pack id; never another.
 *  - `changeRequests` and `project`: the recipe's own declared tool groups include
 *    `integration.read`. Scoped to the run's project (t3team-scriptHostChangeRequests.ts).
 */
import type { ProjectId } from "@t3tools/contracts";
import type { ScriptHostContext, ScriptPackStore } from "@t3team/sdk";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { PullRequestService } from "./pullRequest/PullRequestService.ts";
import { getPackRecipeSources, type PackRecipeSource } from "./t3team-packRecipeSources.ts";
import { makeChangeRequestReader } from "./t3team-scriptHostChangeRequests.ts";
import { makeProjectScope } from "./t3team-scriptHostFiles.ts";
import type { PackDocumentStore } from "./t3team-v2/t3team-packDocumentApi.ts";
import {
  PackDocumentCollections,
  T3TeamPackDocumentStore,
  type T3TeamPackDocumentStoreError,
} from "./t3team-v2/t3team-packDocumentStore.ts";

const CHANGE_REQUEST_READ_TOOL_GROUP = "integration.read";

export interface ScriptHostRunInput {
  readonly projectId: ProjectId;
  /** The launching recipe's directory; absent for runs that are not recipe launches. */
  readonly recipePath: string | null | undefined;
  /** The recipe's declared tool groups, as granted at launch; absent grants nothing. */
  readonly toolGroups: ReadonlyArray<string> | null | undefined;
}

export class T3TeamScriptHost extends Context.Service<
  T3TeamScriptHost,
  { readonly forRun: (input: ScriptHostRunInput) => ScriptHostContext }
>()("t3/t3team-scriptHostContext/T3TeamScriptHost") {}

const withoutTrailingSeparator = (path: string) => path.trim().replace(/[\\/]+$/, "");

/** The pack whose registered recipe root is exactly `recipePath`, if any. */
function packIdForRecipePath(
  recipePath: string | null | undefined,
  sources: ReadonlyArray<PackRecipeSource> = getPackRecipeSources().sources,
): string | undefined {
  if (recipePath == null || recipePath.trim().length === 0) return undefined;
  const target = withoutTrailingSeparator(recipePath);
  return sources.find((source) => withoutTrailingSeparator(source.recipeRoot) === target)?.packId;
}

/** Promise view of one pack's store; binding is per call, so nothing is held between calls. */
function toScriptPackStore(
  bind: Effect.Effect<PackDocumentStore, T3TeamPackDocumentStoreError>,
): ScriptPackStore {
  const run = <A>(
    use: (store: PackDocumentStore) => Effect.Effect<A, T3TeamPackDocumentStoreError>,
  ) => Effect.runPromise(Effect.flatMap(bind, use));
  return {
    get: (collection, key) => run((store) => store.get(collection, key)),
    list: (collection, options) => run((store) => store.list(collection, options)),
    insertOrGet: (collection, key, doc) => run((store) => store.insertOrGet(collection, key, doc)),
    put: (collection, key, doc, options) =>
      run((store) => store.put(collection, key, doc, options)),
    increment: (collection, key, field, by) =>
      run((store) => store.increment(collection, key, field, by)),
  };
}

const make = Effect.gen(function* () {
  const packStore = yield* T3TeamPackDocumentStore;
  const collections = yield* PackDocumentCollections;
  const pullRequests = yield* PullRequestService;
  const forRun = (input: ScriptHostRunInput): ScriptHostContext => {
    const packId = packIdForRecipePath(input.recipePath);
    const hasStore = packId !== undefined && collections.has(packId);
    const readsChangeRequests = input.toolGroups?.includes(CHANGE_REQUEST_READ_TOOL_GROUP) ?? false;
    return {
      ...(hasStore ? { store: toScriptPackStore(packStore.forPack(packId)) } : {}),
      ...(readsChangeRequests
        ? {
            changeRequests: makeChangeRequestReader(pullRequests, input.projectId),
            project: makeProjectScope(pullRequests, input.projectId),
          }
        : {}),
    };
  };
  return T3TeamScriptHost.of({ forRun });
});

export const layer = Layer.effect(T3TeamScriptHost, make);
