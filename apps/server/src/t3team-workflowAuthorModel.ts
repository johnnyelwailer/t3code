/**
 * Which provider instance may write an orchestration.
 *
 * The author thread always runs `approval-required` (`t3team-workflowAuthorTurn.ts`). A driver
 * is usable only when that mode actually keeps shell and file writes off the hidden thread:
 *
 * - `claudeAgent` — `ClaudeAdapter.ts` `canUseTool` opens a host approval unless the mode is
 *   `full-access` (around the `runtimeMode === "full-access"` allow).
 * - `codex` — `CodexSessionRuntime.ts` `runtimeModeToThreadConfig` maps `approval-required` to
 *   `approvalPolicy: "untrusted"` and `sandbox: "read-only"`; command approval is
 *   `item/commandExecution/requestApproval`.
 * - `cursor` — `CursorAdapter.ts` `handleRequestPermission` auto-approves only `full-access`;
 *   every other mode waits on the host.
 * - `opencode` — `buildOpenCodePermissionRules` (`opencodeRuntime.ts`) sets `bash` and `edit` to
 *   `ask` unless the mode is `full-access`; `OpenCodeAdapter.ts` emits that ask.
 * - `grok` — `GrokAdapter.ts` `handleRequestPermission` auto-approves only `full-access`.
 * - `antigravity` — `antigravityPermissionMode` maps `approval-required` to `"default"` (not
 *   `"yolo"`); `handlePermission` emits `request.opened` for every ask.
 * - `nexplore` — the pack does not ask the host (`respondToRequest` is a no-op). `pi-access.ts`
 *   `excludedToolsForRuntimeMode("approval-required")` removes `bash`, `write`, and `edit`, and
 *   `pi-session.ts` applies that list with `excludeTools`. Removing the tools is the restriction
 *   a driver that cannot ask the host is able to make.
 *
 * Any other driver is never chosen. With no restrictable instance in the catalog, authoring fails
 * once instead of inheriting the caller's toolset.
 */
import type { ModelSelection, ServerProvider } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { resolveStartChildModelSelection } from "./t3team-toolBrokerStartChildProvider.ts";

export const APPROVAL_RESTRICTED_DRIVERS: ReadonlySet<string> = new Set([
  "claudeAgent",
  "codex",
  "cursor",
  "opencode",
  "grok",
  "antigravity",
  "nexplore",
]);

const driverOf = (provider: ServerProvider): string => String(provider.driver);

const isRestricted = (provider: ServerProvider): boolean =>
  APPROVAL_RESTRICTED_DRIVERS.has(driverOf(provider));

export const resolveWorkflowAuthorModel = (
  callerModelSelection: ModelSelection,
  providers: ReadonlyArray<ServerProvider> | undefined,
): Effect.Effect<ModelSelection, string> => {
  if (providers === undefined) return Effect.succeed(callerModelSelection);
  const callerInstance = providers.find(
    (provider) =>
      provider.instanceId.toLowerCase() === String(callerModelSelection.instanceId).toLowerCase(),
  );
  if (callerInstance === undefined || isRestricted(callerInstance)) {
    const own = resolveStartChildModelSelection({
      parentModelSelection: callerModelSelection,
      providers,
    });
    return Effect.succeed(own.ok ? own.value : callerModelSelection);
  }
  for (const provider of providers) {
    if (provider.instanceId === callerInstance.instanceId || !isRestricted(provider)) continue;
    const relocated = resolveStartChildModelSelection({
      parentModelSelection: callerModelSelection,
      requestedProvider: String(provider.instanceId),
      providers,
    });
    if (relocated.ok) return Effect.succeed(relocated.value);
  }
  const name = callerInstance.displayName ?? String(callerInstance.instanceId);
  return Effect.fail(
    `Cannot author an orchestration on ${name} (driver ${driverOf(callerInstance)}): ` +
      `approval-required does not keep its shell and file tools behind an approval this server ` +
      `can decline, and no other configured provider declares a default model that does.`,
  );
};

/** Card step copy. Names the instance only when the author did not stay on the caller's. */
export const workflowAuthorStepDetail = (input: {
  readonly caller: ModelSelection;
  readonly author: ModelSelection;
}): string => {
  if (String(input.author.instanceId) === String(input.caller.instanceId)) {
    return "Authoring orchestration";
  }
  return (
    `Authoring orchestration on ${input.author.instanceId} because ` +
    `${input.caller.instanceId} cannot restrict shell and file tools.`
  );
};
