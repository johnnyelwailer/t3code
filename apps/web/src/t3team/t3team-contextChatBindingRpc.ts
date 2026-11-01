/** The client end of `t3team.contextBinding.record`, with its failures sorted by what a retry can do. */
import {
  createEnvironmentRpcCommand,
  isAtomCommandInterrupted,
  runAtomCommand,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";

import { connectionAtomRuntime } from "~/connection/runtime";
import { appAtomRegistry } from "~/rpc/atomRegistry";

import {
  type BindingWriteOutcome,
  classifyBindingFailure,
} from "./t3team-contextChatBindingOutcome";
import type { PendingContextBinding } from "./t3team-contextChatPendingStore";

const recordCommand = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:t3team:context-binding:record",
  tag: WS_METHODS.t3teamContextBindingRecord,
});

export async function recordContextBindingRemote(
  entry: PendingContextBinding,
): Promise<BindingWriteOutcome> {
  const result = await runAtomCommand(
    appAtomRegistry,
    recordCommand,
    {
      environmentId: entry.environmentId,
      input: { threadId: entry.threadId, binding: entry.binding },
    },
    { label: recordCommand.label, reportFailure: false, reportDefect: false },
  );
  if (result._tag === "Success") return { kind: "bound" };
  if (isAtomCommandInterrupted(result)) return { kind: "unavailable", message: "Interrupted." };
  return classifyBindingFailure(squashAtomCommandFailure(result));
}
