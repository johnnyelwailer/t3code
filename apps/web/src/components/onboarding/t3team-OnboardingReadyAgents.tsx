import type { ServerProvider } from "@t3tools/contracts";
import { CheckIcon } from "lucide-react";

import { getOnboardingProviderState } from "~/onboarding/providerReadiness.logic";

/**
 * Agents a computer already has ready besides the CLIs the wizard knows how to install — a
 * distribution's own provider (Nexplore AI in Nexi Work), or a cloud session's preconfigured one.
 * Without this the Agents step lists only Claude Code and Codex, which reads as "nothing works"
 * on a machine whose agent is ready.
 */
export function OnboardingReadyAgents({
  providers,
  excludeDrivers,
}: {
  readonly providers: ReadonlyArray<ServerProvider> | null | undefined;
  readonly excludeDrivers: ReadonlyArray<string>;
}) {
  const ready = (providers ?? []).filter(
    (provider) =>
      !excludeDrivers.includes(provider.driver) &&
      provider.enabled !== false &&
      getOnboardingProviderState(provider) === "ready",
  );
  if (ready.length === 0) return null;
  return (
    <>
      {ready.map((provider) => (
        <div
          key={provider.instanceId}
          className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5"
        >
          <div className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">
              {provider.displayName ?? provider.driver}
            </span>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-success-foreground">
            <CheckIcon className="size-3.5" />
            Ready
          </span>
        </div>
      ))}
    </>
  );
}
