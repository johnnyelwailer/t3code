/**
 * Where a `remoteEnvironment` thread runs, carried in its own model selection so it persists with
 * the thread and reaches the adapter on every turn (and after a restart): `model` is the model on
 * the remote server, and three reserved options name the cloud session, the provider instance
 * there and the repository the child works on. Every other option is the remote model's own and
 * passes through unchanged.
 */
import {
  type ModelSelection,
  type ProviderOptionSelection,
  ProviderInstanceId,
} from "@t3tools/contracts";

import { REMOTE_ENVIRONMENT_DRIVER } from "./t3team-remoteEnvironmentTurn.ts";

export const REMOTE_ENVIRONMENT_INSTANCE_ID = ProviderInstanceId.make(REMOTE_ENVIRONMENT_DRIVER);

const SESSION = "remoteSession";
const INSTANCE = "remoteInstance";
const REPOSITORY = "remoteRepository";
const RESERVED = new Set([SESSION, INSTANCE, REPOSITORY]);

export interface RemoteEnvironmentTarget {
  readonly sessionId: string;
  /** `repositoryGroupingKeyOf` of the repository the child works on. */
  readonly repositoryKey: string;
  /** The selection the remote server runs the child's turns with. */
  readonly modelSelection: ModelSelection;
}

export function remoteEnvironmentModelSelection(target: RemoteEnvironmentTarget): ModelSelection {
  return {
    instanceId: REMOTE_ENVIRONMENT_INSTANCE_ID,
    model: target.modelSelection.model,
    options: [
      { id: SESSION, value: target.sessionId },
      { id: INSTANCE, value: target.modelSelection.instanceId },
      { id: REPOSITORY, value: target.repositoryKey },
      ...(target.modelSelection.options ?? []),
    ],
  };
}

const textOption = (options: ReadonlyArray<ProviderOptionSelection>, id: string) => {
  const value = options.find((option) => option.id === id)?.value;
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
};

/** The target a `remoteEnvironment` selection names, or undefined when it names none. */
export function remoteEnvironmentTargetOf(
  selection: ModelSelection,
): RemoteEnvironmentTarget | undefined {
  const options = selection.options ?? [];
  const sessionId = textOption(options, SESSION);
  const instance = textOption(options, INSTANCE);
  const repositoryKey = textOption(options, REPOSITORY);
  if (sessionId === undefined || instance === undefined || repositoryKey === undefined) {
    return undefined;
  }
  const own = options.filter((option) => !RESERVED.has(option.id));
  return {
    sessionId,
    repositoryKey,
    modelSelection: {
      instanceId: ProviderInstanceId.make(instance),
      model: selection.model,
      ...(own.length === 0 ? {} : { options: own }),
    },
  };
}
