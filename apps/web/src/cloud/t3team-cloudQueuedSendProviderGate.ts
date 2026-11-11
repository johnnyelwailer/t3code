/**
 * After the cloud machine is up and the project is checked out, the queued first message still
 * waits on the composer-selected provider: install the CLI if missing, then sign in. Pure — the
 * flusher and setup card both read this so install/sign-in cannot race dispatch.
 */
import type { ServerProvider, ToolAuthState, ToolAuthToolId } from "@t3tools/contracts";
import { ProviderDriverKind } from "@t3tools/contracts";

import { toolAuthToolForDriverKind } from "~/components/settings/t3team-toolAuthTools";

export type CloudQueuedSendProviderGate =
  /** Providers for the machine are not loaded yet, or a ToolAuth phase is still running. */
  | { readonly kind: "wait" }
  | { readonly kind: "ready" }
  | { readonly kind: "needsInstall"; readonly tool: ToolAuthToolId }
  | { readonly kind: "needsAuth"; readonly tool: ToolAuthToolId }
  /** `tool` is set when the failure came from that tool's sign-in, so the surface can offer its
   * card (with the mapped reason and Retry) rather than a dead sentence. */
  | {
      readonly kind: "failed";
      readonly message: string;
      readonly tool?: ToolAuthToolId | undefined;
    };

type ProviderSnapshot = Pick<
  ServerProvider,
  "instanceId" | "driver" | "enabled" | "installed" | "status" | "auth"
>;

const ACTIVE_TOOL_AUTH_PHASES: ReadonlySet<ToolAuthState["phase"]> = new Set([
  "installing",
  "starting",
  "awaiting-open",
  "awaiting-code",
  "verifying",
]);

export function resolveCloudQueuedSendProviderGate(input: {
  readonly instanceId: string;
  /** Null until the remote environment has reported providers. */
  readonly providers: ReadonlyArray<ProviderSnapshot> | null;
  readonly toolAuthPhase?: ToolAuthState["phase"] | undefined;
  readonly toolAuthMessage?: string | undefined;
  /** The tool the phase above belongs to, so a failure can be shown on that tool's card. */
  readonly toolAuthTool?: ToolAuthToolId | undefined;
}): CloudQueuedSendProviderGate {
  const phase = input.toolAuthPhase;
  if (phase !== undefined && ACTIVE_TOOL_AUTH_PHASES.has(phase)) return { kind: "wait" };
  if (phase === "failed" || phase === "expired") {
    return {
      kind: "failed",
      message: input.toolAuthMessage?.trim() || "Sign-in failed. Retry from the setup card.",
      ...(input.toolAuthTool === undefined ? {} : { tool: input.toolAuthTool }),
    };
  }
  if (input.providers === null) return { kind: "wait" };
  const provider = input.providers.find((entry) => entry.instanceId === input.instanceId);
  if (provider === undefined) return { kind: "wait" };

  const tool = toolAuthToolForDriverKind(ProviderDriverKind.make(provider.driver));
  // Drivers without a ToolAuth flow (cursor, grok, …) do not block the send.
  if (tool === undefined) return { kind: "ready" };
  if (!provider.enabled) {
    return {
      kind: "failed",
      message: `${provider.driver} is disabled for this project. Enable it in Settings → Providers, then retry.`,
    };
  }
  if (phase === "connected") return { kind: "ready" };
  if (!provider.installed) return { kind: "needsInstall", tool };
  const auth = provider.auth.status;
  if (auth === "unauthenticated" || auth === "unknown") return { kind: "needsAuth", tool };
  if (provider.status === "ready" || auth === "authenticated") return { kind: "ready" };
  return { kind: "wait" };
}

export function cloudQueuedSendProviderReady(gate: CloudQueuedSendProviderGate): boolean {
  return gate.kind === "ready";
}
