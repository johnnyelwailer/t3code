import { ORCHESTRATION_WS_METHODS, type ClientOrchestrationCommand } from "@t3tools/contracts";
import {
  createEnvironmentRpcCommand,
  runAtomCommand,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";

import { connectionAtomRuntime } from "~/connection/runtime";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { primaryEnvironmentIdAtom } from "~/state/primaryEnvironment";

export const dispatchOrchestrationCommand = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "t3team:orchestration:dispatch",
  tag: ORCHESTRATION_WS_METHODS.dispatchCommand,
});

export async function runT3TeamOrchestrationDispatch(
  command: ClientOrchestrationCommand,
): Promise<void> {
  const environmentId = appAtomRegistry.get(primaryEnvironmentIdAtom);
  if (environmentId === null) {
    throw new Error("Primary environment is not available. Finish server pairing and retry.");
  }

  const result = await runAtomCommand(
    appAtomRegistry,
    dispatchOrchestrationCommand,
    { environmentId, input: command },
    {
      label: "t3team-orchestration-dispatch",
      reportFailure: true,
    },
  );
  if (result._tag === "Failure") {
    throw squashAtomCommandFailure(result);
  }
}
