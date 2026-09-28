import type { EnvironmentId } from "@t3tools/contracts";
import {
  runAtomCommand,
  squashAtomCommandFailure,
  type AtomCommand,
} from "@t3tools/client-runtime/state/runtime";

import { appAtomRegistry } from "~/rpc/atomRegistry";
import { primaryEnvironmentIdAtom } from "~/state/primaryEnvironment";

/**
 * The primary environment, for t3team features that exist only on this
 * machine (work-project setup reads and writes its workspace through
 * primary-server HTTP routes). Say it explicitly at the call site — never as a
 * silent default for a thread that may live elsewhere.
 */
export function primaryEnvironmentIdOrThrow(): EnvironmentId {
  const environmentId = appAtomRegistry.get(primaryEnvironmentIdAtom);
  if (environmentId === null) {
    throw new Error("Primary environment is not available. Finish server pairing and retry.");
  }
  return environmentId;
}

/**
 * Runs one of upstream's environment commands (`threadEnvironment.*`,
 * `projectEnvironment.*`) for the t3team surfaces, throwing on failure the way
 * their async call sites expect.
 *
 * There is deliberately no default environment: every caller names the one
 * that owns the thread or project. The t3team layer used to send everything to
 * the primary server, so a cloud session's thread was created on the wrong
 * machine ("Project … does not exist"). Upstream's own chat routes the same way.
 */
export async function runT3TeamEnvironmentCommand<Input, A, E>(
  command: AtomCommand<{ readonly environmentId: EnvironmentId; readonly input: Input }, A, E>,
  request: { readonly environmentId: EnvironmentId; readonly input: Input },
): Promise<A> {
  const result = await runAtomCommand(appAtomRegistry, command, request, {
    label: `t3team:${command.label}`,
    reportFailure: true,
  });
  if (result._tag === "Failure") {
    throw squashAtomCommandFailure(result);
  }
  return result.value;
}
