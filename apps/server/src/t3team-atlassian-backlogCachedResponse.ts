import * as Effect from "effect/Effect";

import {
  fingerprintBacklogPayload,
  readCachedT3TeamAtlassianBacklog,
  type T3TeamAtlassianBacklogPayload,
  type T3TeamBacklogSelectionInput,
} from "./t3team-atlassian-backlog-cache.ts";
import {
  createCachedBacklogResponse,
  type T3TeamAtlassianBacklogCacheMetadata,
} from "./t3team-atlassian-backlogTypes.ts";

export function readCachedT3TeamAtlassianBacklogResponse(input: {
  readonly provider: string;
  readonly accountId: string;
  readonly externalProjectId: string;
  readonly selection: T3TeamBacklogSelectionInput;
  readonly source: "persisted" | "stale-fallback";
}) {
  return readCachedT3TeamAtlassianBacklog({
    provider: input.provider,
    accountId: input.accountId,
    externalProjectId: input.externalProjectId,
    selection: input.selection,
  }).pipe(
    Effect.catch(() => Effect.succeed(null)),
    Effect.map((cached) =>
      cached
        ? createCachedBacklogResponse(cached.response, {
            source: input.source,
            updatedAt: cached.updatedAt,
            fingerprint: cached.fingerprint,
          })
        : null,
    ),
  );
}

export function createLiveT3TeamAtlassianBacklogResponse(input: {
  readonly payload: T3TeamAtlassianBacklogPayload;
  readonly updatedAt: number;
  readonly fingerprint?: string;
}) {
  return createCachedBacklogResponse(input.payload, {
    source: "live",
    updatedAt: input.updatedAt,
    fingerprint: input.fingerprint ?? fingerprintBacklogPayload(input.payload),
  } satisfies T3TeamAtlassianBacklogCacheMetadata);
}
