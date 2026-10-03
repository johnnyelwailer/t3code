/**
 * The t3team backend's thread and project writes, typed on the V2 client operations
 * (`@t3tools/client-runtime/operations`).
 *
 * Every write runs through the same environment command atoms upstream's chat uses
 * (`threadEnvironment` / `projectEnvironment`), so per-thread serial scheduling and optimistic
 * state are shared with ChatView, and is addressed to the primary environment (the one the
 * t3team shell is paired with).
 */
import type {
  CreateProjectInput,
  CreateThreadInput,
  StartThreadTurnInput,
  UpdateThreadMetadataInput,
} from "@t3tools/client-runtime/operations";
import {
  runAtomCommand,
  squashAtomCommandFailure,
  type AtomCommand,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, ProjectId, ProjectSourceBinding } from "@t3tools/contracts";

import { appAtomRegistry } from "~/rpc/atomRegistry";
import { primaryEnvironmentIdAtom } from "~/state/primaryEnvironment";
import { projectEnvironment } from "~/state/projects";
import { threadEnvironment } from "~/state/threads";

/**
 * `source` is the project's work-source binding. It reaches the server only once project
 * mutations carry it (contracts C13); until then the stored local copy stays authoritative
 * (`reconcileStoredProjectSource`).
 */
export type T3TeamCreateProjectInput = CreateProjectInput & {
  readonly source?: ProjectSourceBinding;
};

export interface T3TeamUpdateProjectSourceInput {
  readonly projectId: ProjectId;
  readonly source: ProjectSourceBinding;
}

export interface T3TeamOrchestrationApi {
  readonly createProject: (input: T3TeamCreateProjectInput) => Promise<void>;
  readonly updateProjectSource: (input: T3TeamUpdateProjectSourceInput) => Promise<void>;
  readonly createThread: (input: CreateThreadInput) => Promise<void>;
  /**
   * Sends a user message. With `bootstrap.createThread` it launches the thread and its first run
   * in one call; otherwise `dispatchMode` decides how it meets an active run (default `auto`).
   */
  readonly startThreadTurn: (input: StartThreadTurnInput) => Promise<void>;
  readonly updateThreadMetadata: (input: UpdateThreadMetadataInput) => Promise<void>;
}

type EnvironmentCommand<I> = AtomCommand<
  { readonly environmentId: EnvironmentId; readonly input: I },
  unknown,
  unknown
>;

async function runOnPrimaryEnvironment<I>(
  command: EnvironmentCommand<I>,
  input: I,
  label: string,
): Promise<void> {
  const environmentId = appAtomRegistry.get(primaryEnvironmentIdAtom);
  if (environmentId === null) {
    throw new Error("Primary environment is not available. Finish server pairing and retry.");
  }
  const result = await runAtomCommand(
    appAtomRegistry,
    command,
    { environmentId, input },
    { label, reportFailure: true },
  );
  if (result._tag === "Failure") {
    throw squashAtomCommandFailure(result);
  }
}

export function createPrimaryEnvironmentOrchestrationApi(): T3TeamOrchestrationApi {
  return {
    createProject: (input) =>
      runOnPrimaryEnvironment(projectEnvironment.create, input, "t3team-project-create"),
    updateProjectSource: (input) =>
      runOnPrimaryEnvironment(projectEnvironment.update, input, "t3team-project-source"),
    createThread: (input) =>
      runOnPrimaryEnvironment(threadEnvironment.create, input, "t3team-thread-create"),
    startThreadTurn: (input) =>
      runOnPrimaryEnvironment(threadEnvironment.startTurn, input, "t3team-thread-turn-start"),
    updateThreadMetadata: (input) =>
      runOnPrimaryEnvironment(
        threadEnvironment.updateMetadata,
        input,
        "t3team-thread-metadata-update",
      ),
  };
}
