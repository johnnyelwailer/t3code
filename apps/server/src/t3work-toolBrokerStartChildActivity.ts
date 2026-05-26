import { CommandId, EventId, type ProjectId, type ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { ProjectionRepositoryError } from "./persistence/Errors.ts";
import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";

export type T3workStartChildProject = {
  readonly title: string;
  readonly workspaceRoot: string;
  readonly defaultModelSelection: import("@t3tools/contracts").ModelSelection | null;
};

export type T3workStartChildThread = {
  readonly id: ThreadId;
  readonly projectId: ProjectId;
  readonly title: string;
  readonly modelSelection: import("@t3tools/contracts").ModelSelection;
  readonly runtimeMode: import("@t3tools/contracts").RuntimeMode;
};

export type T3workStartChildLoadThreadProject = (
  threadId: ThreadId,
) => Effect.Effect<
  { readonly project: T3workStartChildProject; readonly thread: T3workStartChildThread },
  string | ProjectionRepositoryError
>;

export const appendThreadActivity = (
  orchestration: OrchestrationEngineShape,
  threadId: ThreadId,
  input: {
    readonly kind: string;
    readonly summary: string;
    readonly payload: unknown;
    readonly createdAt: string;
  },
) =>
  orchestration
    .dispatch({
      type: "thread.activity.append",
      commandId: CommandId.make(`server:t3work:activity:${crypto.randomUUID()}`),
      threadId,
      activity: {
        id: EventId.make(crypto.randomUUID()),
        tone: "info",
        kind: input.kind,
        summary: input.summary,
        payload: input.payload,
        turnId: null,
        createdAt: input.createdAt,
      },
      createdAt: input.createdAt,
    })
    .pipe(Effect.asVoid);
