import type { ProviderInstanceId, ServerProvider } from "@t3tools/contracts";
import { ProviderDriverKind } from "@t3tools/contracts";

import { getOnboardingProviderState } from "~/onboarding/providerReadiness.logic";
import { hasProviderSetup } from "~/components/chat/ProviderStatusBanner";
import { toolAuthToolForDriverKind } from "~/components/settings/t3team-toolAuthTools";

export type WelcomeAgentTool = "claude" | "codex";

export type WelcomeAgentAction =
  | { readonly kind: "none" }
  | { readonly kind: "toolAuthInstall"; readonly tool: WelcomeAgentTool }
  | { readonly kind: "toolAuthSignIn"; readonly tool: WelcomeAgentTool }
  | { readonly kind: "openProviderSetup"; readonly instanceId: ProviderInstanceId }
  | { readonly kind: "disabled"; readonly reason: string };

export type WelcomeAgentRowModel = {
  readonly key: string;
  readonly driver: string;
  readonly title: string;
  readonly instanceId: ProviderInstanceId | undefined;
  readonly state: ReturnType<typeof getOnboardingProviderState> | "missing";
  readonly action: WelcomeAgentAction;
  readonly statusLabel: string | null;
  readonly description: string | null;
};

const PREFERRED_ORDER = ["nexplore", "claudeAgent", "codex", "cursor"] as const;

const NEXPLORE_UNREACHABLE_HINT = "Not reachable on this network";

function preferredIndex(driver: string): number {
  const index = PREFERRED_ORDER.indexOf(driver as (typeof PREFERRED_ORDER)[number]);
  return index === -1 ? PREFERRED_ORDER.length : index;
}

/** Reuses the provider health probe (`ServerProvider.status`) — no separate Entra/key/setup. */
export function isNexploreAiReachable(provider: ServerProvider | undefined): boolean {
  return provider !== undefined && provider.enabled !== false && provider.status === "ready";
}

function nexploreRow(provider: ServerProvider | undefined): WelcomeAgentRowModel {
  const reachable = isNexploreAiReachable(provider);
  const checking =
    provider !== undefined &&
    !provider.installed &&
    provider.status === "warning" &&
    provider.auth.status === "unknown";
  return {
    key: provider?.instanceId ?? "missing:nexplore",
    driver: "nexplore",
    title: provider?.displayName?.trim() || "Nexplore AI",
    instanceId: provider?.instanceId,
    state: reachable ? "ready" : checking ? "checking" : provider ? "attention" : "missing",
    action: { kind: "none" },
    statusLabel: reachable ? "Ready" : null,
    description: reachable || checking ? null : NEXPLORE_UNREACHABLE_HINT,
  };
}

function resolveAction(provider: ServerProvider | undefined): WelcomeAgentAction {
  if (provider === undefined) {
    return { kind: "disabled", reason: "Provider not registered on this machine." };
  }
  const state = getOnboardingProviderState(provider);
  const tool = toolAuthToolForDriverKind(ProviderDriverKind.make(provider.driver));
  if (state === "ready") return { kind: "none" };
  if (tool === "claude" || tool === "codex") {
    const agentTool: WelcomeAgentTool = tool;
    if (state === "install") return { kind: "toolAuthInstall", tool: agentTool };
    if (state === "signIn" || state === "attention") {
      return { kind: "toolAuthSignIn", tool: agentTool };
    }
  }
  if (hasProviderSetup(provider)) {
    return { kind: "openProviderSetup", instanceId: provider.instanceId };
  }
  if (state === "install") {
    return {
      kind: "disabled",
      reason: `No in-app install for ${provider.displayName ?? provider.driver}.`,
    };
  }
  if (state === "signIn" || state === "attention") {
    return {
      kind: "disabled",
      reason: `No in-app sign-in for ${provider.displayName ?? provider.driver}.`,
    };
  }
  return { kind: "none" };
}

function rowFromProvider(provider: ServerProvider): WelcomeAgentRowModel {
  if (provider.driver === "nexplore") return nexploreRow(provider);
  const state = getOnboardingProviderState(provider);
  const action = resolveAction(provider);
  return {
    key: provider.instanceId,
    driver: provider.driver,
    title: provider.displayName?.trim() || provider.driver,
    instanceId: provider.instanceId,
    state,
    action,
    statusLabel: state === "ready" ? "Ready" : null,
    description:
      state === "attention" || state === "checking"
        ? (provider.message ?? null)
        : action.kind === "disabled"
          ? action.reason
          : null,
  };
}

/** Preferred agents always listed; other ready/attention drivers appended. */
export function buildWelcomeAgentRows(
  providers: ReadonlyArray<ServerProvider> | null | undefined,
): readonly WelcomeAgentRowModel[] {
  const list = providers ?? [];
  const byDriver = new Map<string, ServerProvider>();
  for (const provider of list) {
    const existing = byDriver.get(provider.driver);
    if (
      existing === undefined ||
      (getOnboardingProviderState(provider) === "ready" &&
        getOnboardingProviderState(existing) !== "ready")
    ) {
      byDriver.set(provider.driver, provider);
    }
  }

  const rows: WelcomeAgentRowModel[] = [];
  for (const driver of PREFERRED_ORDER) {
    const provider = byDriver.get(driver);
    if (driver === "nexplore") {
      rows.push(nexploreRow(provider));
      byDriver.delete(driver);
      continue;
    }
    if (provider) {
      rows.push(rowFromProvider(provider));
      byDriver.delete(driver);
      continue;
    }
    rows.push({
      key: `missing:${driver}`,
      driver,
      title: driver === "claudeAgent" ? "Claude Code" : driver === "codex" ? "Codex" : "Cursor",
      instanceId: undefined,
      state: "missing",
      action:
        driver === "claudeAgent"
          ? { kind: "toolAuthInstall", tool: "claude" }
          : driver === "codex"
            ? { kind: "toolAuthInstall", tool: "codex" }
            : {
                kind: "disabled",
                reason: "Open Settings → Providers to install Cursor.",
              },
      statusLabel: null,
      description: null,
    });
  }

  const extras = [...byDriver.values()]
    .filter((provider) => provider.enabled !== false)
    .sort(
      (a, b) =>
        preferredIndex(a.driver) - preferredIndex(b.driver) ||
        (a.displayName ?? a.driver).localeCompare(b.displayName ?? b.driver),
    )
    .map(rowFromProvider);
  return [...rows, ...extras];
}

export function isWelcomeAgentReady(rows: readonly WelcomeAgentRowModel[]): boolean {
  return rows.some((row) => row.state === "ready");
}
