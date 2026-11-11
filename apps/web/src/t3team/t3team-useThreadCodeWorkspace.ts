/**
 * Keeps the multi-root editor workspace of the thread's Open in target current on its server
 * (`t3team.codeWorkspace.sync`): two or more confirmed active roots write the workspace, fewer
 * remove it, so a VS Code family Open in opens all of the thread's worktrees at once and a single
 * root opens the plain folder. No picker and no new control: the existing Open in does it.
 *
 * Fire-and-forget: a failed sync leaves Open in on the folder; it never blocks the panel.
 */
import { AuthOrchestrationOperateScope, type EnvironmentId, WS_METHODS } from "@t3tools/contracts";
import { createEnvironmentRpcCommand, runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import {
  codeWorkspaceFolders,
  type CodeWorkspaceFolder,
} from "@t3tools/shared/t3team-codeWorkspace";
import type { ThreadActiveRoot } from "@t3tools/shared/t3team-threadActiveRoots";
import { useEffect } from "react";

import { connectionAtomRuntime } from "~/connection/runtime";
import { appAtomRegistry } from "~/rpc/atomRegistry";

import { useEnvironmentScope } from "../state/session";

const syncCodeWorkspaceCommand = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "t3team:codeWorkspace:sync",
  tag: WS_METHODS.t3teamSyncCodeWorkspace,
});

export function useThreadCodeWorkspace(input: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string | null;
  readonly roots: ReadonlyArray<ThreadActiveRoot>;
  readonly confirmed: boolean;
}): void {
  const canOperate = useEnvironmentScope(input.environmentId, AuthOrchestrationOperateScope);
  // One string carries everything the sync sends, so the effect runs only when it changes.
  const request =
    canOperate && input.confirmed && input.cwd !== null
      ? JSON.stringify([input.environmentId, input.cwd, codeWorkspaceFolders(input.roots)])
      : null;
  useEffect(() => {
    if (request === null) return;
    const [environmentId, cwd, folders] = JSON.parse(request) as [
      EnvironmentId,
      string,
      CodeWorkspaceFolder[],
    ];
    void runAtomCommand(
      appAtomRegistry,
      syncCodeWorkspaceCommand,
      { environmentId, input: { cwd, folders } },
      { label: "t3team-code-workspace", reportFailure: false },
    ).catch(() => {
      // Intentionally empty: Open in falls back to the plain folder.
    });
  }, [request]);
}
