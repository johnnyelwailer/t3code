/**
 * The cloud session a `remoteEnvironment` thread names, carried in its own model selection: `model`
 * is the model on the remote server, and two reserved options name the session and the provider
 * instance there. Every other option is the remote model's own and passes through unchanged.
 *
 * This is a HINT, never an authorization: anything that can write a thread's model selection can
 * write these options. Whether a thread may run, on which session and for which repository is
 * decided on this server (`t3team-remoteEnvironmentAuthorize.ts`).
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
const RESERVED = new Set([SESSION, INSTANCE]);

export interface RemoteEnvironmentTarget {
  readonly sessionId: string;
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
  if (sessionId === undefined || instance === undefined) return undefined;
  const own = options.filter((option) => !RESERVED.has(option.id));
  return {
    sessionId,
    modelSelection: {
      instanceId: ProviderInstanceId.make(instance),
      model: selection.model,
      ...(own.length === 0 ? {} : { options: own }),
    },
  };
}
