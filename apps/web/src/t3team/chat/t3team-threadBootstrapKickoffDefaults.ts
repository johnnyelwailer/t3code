import {
  DEFAULT_RUNTIME_MODE,
  type ModelSelection,
  type ProviderInteractionMode,
  type RuntimeMode,
} from "@t3tools/contracts";

import { getConfiguredDefaultModelSelection } from "~/t3team-configuredDefaultModelSelection";

/** Fills in the kickoff model/runtime/interaction mode with the same defaults every bootstrap path uses. */
export function resolveThreadBootstrapKickoffDefaults(input: {
  initialModelSelection: ModelSelection | undefined;
  initialRuntimeMode: RuntimeMode | undefined;
  initialInteractionMode: ProviderInteractionMode | undefined;
}): {
  kickoffModelSelection: ModelSelection;
  kickoffRuntimeMode: RuntimeMode;
  kickoffInteractionMode: ProviderInteractionMode;
} {
  return {
    kickoffModelSelection: input.initialModelSelection ?? getConfiguredDefaultModelSelection(),
    kickoffRuntimeMode: input.initialRuntimeMode ?? DEFAULT_RUNTIME_MODE,
    kickoffInteractionMode: input.initialInteractionMode ?? ("default" as ProviderInteractionMode),
  };
}
