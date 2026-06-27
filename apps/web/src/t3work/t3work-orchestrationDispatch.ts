import * as Effect from "effect/Effect";
import { ORCHESTRATION_WS_METHODS, type ClientOrchestrationCommand } from "@t3tools/contracts";
import { request } from "@t3tools/client-runtime/rpc";
import {
  createRuntimeCommand,
  runAtomCommand,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";

import { connectionAtomRuntime } from "~/connection/runtime";
import { appAtomRegistry } from "~/rpc/atomRegistry";

export const dispatchOrchestrationCommand = createRuntimeCommand(connectionAtomRuntime, {
  label: "t3work:orchestration:dispatch",
  execute: (command: ClientOrchestrationCommand) =>
    request(ORCHESTRATION_WS_METHODS.dispatchCommand, command).pipe(Effect.asVoid),
} as never);

export async function runT3workOrchestrationDispatch(
  command: ClientOrchestrationCommand,
): Promise<void> {
  const result = await runAtomCommand(appAtomRegistry, dispatchOrchestrationCommand, command, {
    label: "t3work-orchestration-dispatch",
    reportFailure: true,
  });
  if (result._tag === "Failure") {
    throw squashAtomCommandFailure(result);
  }
}
