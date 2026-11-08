/**
 * A recipe sent from a draft needs the draft's thread to exist first. Upstream's draft bootstrap
 * always starts a turn (`startThreadTurn` sends `initialMessage`), so the thread is created with
 * the plain `thread.create` command instead and the draft follows its usual promotion once the
 * recipe's message lands.
 */
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { CreateThreadInput } from "@t3tools/client-runtime/operations";
import {
  type AtomCommand,
  runAtomCommand,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { type EnvironmentId, type ScopedThreadRef, ThreadId } from "@t3tools/contracts";

import {
  type DraftId,
  restoreFailedDraftThread,
  useComposerDraftStore,
} from "~/composerDraftStore";
import { newThreadId } from "~/lib/utils";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { threadEnvironment } from "~/state/threads";

type TurnStartFields = {
  readonly threadId: string;
  readonly titleSeed: string;
  readonly modelSelection: CreateThreadInput["modelSelection"];
  readonly runtimeMode: CreateThreadInput["runtimeMode"];
  readonly interactionMode: CreateThreadInput["interactionMode"];
};

export type T3TeamDraftRecipeThread = {
  readonly thread: ScopedThreadRef;
  readonly create: CreateThreadInput;
};

export type T3TeamDraftThreadCommands = {
  readonly create: (environmentId: EnvironmentId, input: CreateThreadInput) => Promise<void>;
  readonly deleteUnused: (thread: ScopedThreadRef) => Promise<void>;
};

/** The thread a draft's recipe send starts on, or why it cannot start from this draft. */
export function planDraftRecipeThread(
  draftId: DraftId,
  turnStart: TurnStartFields,
): T3TeamDraftRecipeThread | string {
  const session = useComposerDraftStore.getState().getDraftSession(draftId);
  if (session === null) return "This draft is no longer open.";
  if (session.envMode === "worktree" && session.worktreePath === null) {
    return "A recipe cannot prepare a new worktree yet. Choose Local, or send a first message and attach the recipe after.";
  }
  const threadId = ThreadId.make(turnStart.threadId);
  return {
    thread: scopeThreadRef(session.environmentId, threadId),
    create: {
      threadId,
      projectId: session.projectId,
      title: turnStart.titleSeed,
      modelSelection: turnStart.modelSelection,
      runtimeMode: turnStart.runtimeMode,
      interactionMode: turnStart.interactionMode,
      branch: session.branch,
      worktreePath: session.worktreePath,
    },
  };
}

/** Where the draft's composer lives now: the draft, or the thread it was promoted into. */
export function draftComposerHome(draftId: DraftId): DraftId | ScopedThreadRef {
  return useComposerDraftStore.getState().getPromotedDraftRedirect(draftId) ?? draftId;
}

/** A failed recipe start hands the draft back; a thread it already created is given up. */
export function restoreDraftAfterFailedRecipe(input: {
  readonly draftId: DraftId;
  readonly threadId: ThreadId;
  readonly created: ScopedThreadRef | null;
  readonly commands: T3TeamDraftThreadCommands;
}): void {
  const store = useComposerDraftStore.getState();
  if (store.getPromotedDraftRedirect(input.draftId) !== null) return;
  const session = store.getDraftSession(input.draftId);
  if (session === null) return;
  restoreFailedDraftThread(
    input.draftId,
    session,
    input.created === null ? input.threadId : newThreadId(),
  );
  if (input.created !== null)
    void input.commands.deleteUnused(input.created).catch(() => undefined);
}

async function runThreadCommand<W, A, E>(command: AtomCommand<W, A, E>, input: W): Promise<void> {
  const result = await runAtomCommand(appAtomRegistry, command, input, { reportFailure: false });
  if (result._tag === "Failure") {
    const error = squashAtomCommandFailure(result);
    throw error instanceof Error ? error : new Error("The thread could not be created.");
  }
}

export const draftThreadCommands: T3TeamDraftThreadCommands = {
  create: (environmentId, input) =>
    runThreadCommand(threadEnvironment.create, { environmentId, input }),
  deleteUnused: (thread) =>
    runThreadCommand(threadEnvironment.delete, {
      environmentId: thread.environmentId,
      input: { threadId: thread.threadId, onlyIfUnused: true },
    }),
};
