import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ThreadId as ThreadIdType } from "@t3tools/contracts";

import type { T3TeamTurnToolContext } from "./t3team-toolBroker.ts";

export type T3TeamViewWorkspaceThread = {
  readonly branch: string | null;
  readonly worktreePath: string | null;
};

export type T3TeamViewWorkspaceProject = {
  readonly workspaceRoot: string;
};

type LoadThreadViewThread = T3TeamViewWorkspaceThread & {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly runtimeMode: unknown;
  readonly interactionMode: unknown;
  readonly messages: ReadonlyArray<unknown>;
  readonly latestTurn?: { readonly turnId: unknown } | null | undefined;
};

type LoadThreadViewProject = T3TeamViewWorkspaceProject & {
  readonly id: string;
  readonly title: string;
};

/** The `t3team.thread.view` read model over a thread + project lookup. Extracted from
 * `t3team-toolBrokerLive.ts` (additive LOC budget) — behavior unchanged. Generic so the
 * caller's concrete thread/project field types flow through untouched. */
export const makeLoadThreadView =
  <E, TThread extends LoadThreadViewThread, TProject extends LoadThreadViewProject>(
    loadThreadProject: (
      threadId: ThreadIdType,
    ) => Effect.Effect<{ project: TProject; thread: TThread }, E>,
  ) =>
  (threadId: ThreadIdType, toolContext: T3TeamTurnToolContext) =>
    Effect.gen(function* () {
      const resolved = yield* loadThreadProject(threadId).pipe(Effect.option);
      const thread = Option.isSome(resolved) ? resolved.value.thread : undefined;
      const project = Option.isSome(resolved) ? resolved.value.project : undefined;
      return {
        surface: toolContext.surface,
        state: toolContext.state,
        project: project
          ? {
              id: project.id,
              title: project.title,
              workspaceRoot: project.workspaceRoot,
            }
          : null,
        thread: thread
          ? {
              id: thread.id,
              projectId: thread.projectId,
              title: thread.title,
              runtimeMode: thread.runtimeMode,
              interactionMode: thread.interactionMode,
              messageCount: thread.messages.length,
              latestTurnId: thread.latestTurn?.turnId ?? null,
              ...buildThreadWorkspaceView({ thread, project }),
            }
          : null,
      };
    });

export function buildThreadWorkspaceView(input: {
  readonly thread: T3TeamViewWorkspaceThread;
  readonly project: T3TeamViewWorkspaceProject | undefined;
}) {
  const worktreePath = input.thread.worktreePath ?? null;
  const executionScope = worktreePath ? "repository" : "metarepo";
  const projectWorkspaceRoot = input.project?.workspaceRoot ?? null;

  return {
    executionScope,
    workspace: {
      executionScope,
      projectWorkspaceRoot,
      currentWorkspaceRoot: worktreePath ?? projectWorkspaceRoot,
      worktreePath,
      branch: input.thread.branch ?? null,
    },
  };
}
