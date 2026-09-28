import type { EnvironmentId } from "@t3tools/contracts";

import { appAtomRegistry } from "~/rpc/atomRegistry";
import { environmentThreadShells } from "~/state/threads";

/**
 * The environment a known thread lives on, looked up in upstream's thread
 * shells (every connected environment's threads), for callers that only hold a
 * thread id. `null` when no connected environment has the thread.
 *
 * Kept out of `t3team-threadChatEnvironment` on purpose: it pulls in the whole
 * environment state graph, which the composer store must not import.
 */
export function environmentIdOfThread(threadId: string): EnvironmentId | null {
  const shells = appAtomRegistry.get(environmentThreadShells.threadShellsAtom);
  return shells.find((shell) => shell.id === threadId)?.environmentId ?? null;
}
