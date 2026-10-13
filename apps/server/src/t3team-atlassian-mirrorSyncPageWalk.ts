/**
 * The paging core shared by the mirror's catch-up and reconcile walks: fetch
 * `ORDER BY updated ASC` pages, pace them in bursts, upsert each page, and say
 * how the walk ended. Callers decide what a page means (watermark, seen ids).
 */
import type { IntegrationAccountRef } from "@t3tools/integrations-core";
import * as Effect from "effect/Effect";

import { tryAtlassianPromise } from "./t3team-atlassian-http.ts";
import { upsertMirrorIssues } from "./t3team-atlassian-backlog-mirrorSyncDb.ts";
import {
  burstPause,
  maxPagesPerBurst,
  maxPagesPerWalk,
  mirrorPageSize,
  type MirrorSyncIdentity,
  type T3TeamAtlassianMirrorSyncRequest,
} from "./t3team-atlassian-backlog-mirrorSyncShared.ts";

export type MirrorPageItem = Readonly<Record<string, unknown>> & { readonly id: string };

/** The slice of `AtlassianIntegrationProvider` a mirror walk reads from. */
export type MirrorPageSource = {
  readonly listProjectMirrorPage: (input: {
    account: IntegrationAccountRef;
    externalProjectId: string;
    updatedWithinMinutes?: number;
    cursor?: string;
    limit?: number;
  }) => Promise<{ items: ReadonlyArray<MirrorPageItem>; nextCursor: string | undefined }>;
};

/** `complete`: reached the last page. `page-cap`: stopped at `maxPagesPerWalk`. */
export type MirrorPageWalkEnd = "complete" | "page-cap" | "superseded";

const pauseBeforeBurst = (pageIndex: number) =>
  pageIndex > 0 && pageIndex % maxPagesPerBurst === 0 ? Effect.sleep(burstPause) : Effect.void;

export function walkMirrorPages<E, R>(options: {
  readonly request: T3TeamAtlassianMirrorSyncRequest;
  readonly source: MirrorPageSource;
  readonly identity: MirrorSyncIdentity;
  readonly isSuperseded: () => boolean;
  readonly updatedWithinMinutes: number | undefined;
  readonly failureMessage: string;
  readonly onPageStored: (items: ReadonlyArray<MirrorPageItem>) => Effect.Effect<void, E, R>;
}) {
  return Effect.gen(function* () {
    let cursor: string | undefined;
    for (let pageIndex = 0; pageIndex < maxPagesPerWalk; pageIndex++) {
      yield* pauseBeforeBurst(pageIndex);
      if (options.isSuperseded()) return "superseded" satisfies MirrorPageWalkEnd;

      const pageCursor = cursor;
      const page = yield* tryAtlassianPromise(
        () =>
          options.source.listProjectMirrorPage({
            account: options.request.account,
            externalProjectId: options.request.externalProjectId,
            ...(options.updatedWithinMinutes !== undefined
              ? { updatedWithinMinutes: options.updatedWithinMinutes }
              : {}),
            ...(pageCursor ? { cursor: pageCursor } : {}),
            limit: mirrorPageSize,
          }),
        options.failureMessage,
      );
      if (options.isSuperseded()) return "superseded" satisfies MirrorPageWalkEnd;

      yield* upsertMirrorIssues({ identity: options.identity, items: page.items });
      yield* options.onPageStored(page.items);

      if (!page.nextCursor) return "complete" satisfies MirrorPageWalkEnd;
      cursor = page.nextCursor;
    }
    return "page-cap" satisfies MirrorPageWalkEnd;
  });
}
