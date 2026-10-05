/** Parent-scoped in-flight count for a notification's provider instance. */
import { ProjectId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { isLiveChildShell } from "./t3team-toolBrokerChildrenLiveChildren.ts";
import type { ChildThreadShell } from "./t3team-toolBrokerChildrenTypes.ts";

export const countLiveChildrenOnProvider = (
  shells: ReadonlyArray<ChildThreadShell | undefined>,
  providerInstanceId: string,
): number =>
  shells.filter(
    (shell) =>
      shell !== undefined &&
      shell.modelSelection?.instanceId === providerInstanceId &&
      isLiveChildShell(shell),
  ).length;

export const loadInFlightOnProvider = (
  query: ProjectionSnapshotQueryShape,
  input: { readonly parentThreadId: string; readonly projectId: string; readonly provider: string },
) =>
  Effect.gen(function* () {
    const childIds = yield* query.listChildThreadIdsByParent(
      ThreadId.make(input.parentThreadId),
      ProjectId.make(input.projectId),
    );
    const shells = yield* Effect.forEach(
      childIds,
      (id) => query.getThreadShellById(id).pipe(Effect.map(Option.getOrUndefined)),
      { concurrency: 8 },
    );
    return countLiveChildrenOnProvider(shells, input.provider);
  });
