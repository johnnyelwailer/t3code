import type { ModelSelection } from "@t3tools/contracts";

/**
 * The Nexplore AI provider the Nexi Work distribution registers on the server.
 *
 * Mirrors `defineAgentProvider` in the `nexplore-global` pack's `activate.ts` and the tiers in its
 * `pi-config.ts`. The pack activates on the server (it needs Node), so the app never talks to the
 * gateway: it finds this provider instance in the connected environment's provider list and
 * prefers it as the default for new work.
 */
export const NEXI_PROVIDER = {
  instanceId: "nexplore",
  driver: "nexplore",
  harness: "opencode",
  displayName: "Nexplore AI",
  defaultModel: "medium",
} as const;

export const NEXI_PROVIDER_MODEL_TIERS = [
  { slug: "no-thinking", name: "Instant" },
  { slug: "low", name: "Fast" },
  { slug: "medium", name: "Standard" },
  { slug: "high", name: "Deep" },
] as const;

export function isNexiProviderDriver(driver: string | null | undefined): boolean {
  return driver === NEXI_PROVIDER.driver;
}

type SelectableOption = {
  readonly selection: ModelSelection;
  readonly isUnavailable?: boolean;
};

/**
 * The distribution's default pick among offered options: the Standard tier when the environment
 * offers it, otherwise any available Nexplore model. `null` when the environment has no Nexplore
 * provider, so builds pointed at a plain t3code server keep the server's own default.
 */
export function findNexiProviderDefaultSelection(
  options: ReadonlyArray<SelectableOption>,
): ModelSelection | null {
  const available = options.filter(
    (option) => !option.isUnavailable && option.selection.instanceId === NEXI_PROVIDER.instanceId,
  );
  return (
    available.find((option) => option.selection.model === NEXI_PROVIDER.defaultModel)?.selection ??
    available[0]?.selection ??
    null
  );
}
