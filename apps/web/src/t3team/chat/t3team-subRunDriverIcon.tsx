import type { ProviderDriverKind, ProviderInstanceId, ServerProvider } from "@t3tools/contracts";
import { BotIcon } from "lucide-react";

import { ProviderInstanceIcon } from "~/components/chat/ProviderInstanceIcon";
import { cn } from "~/lib/utils";
import { getProviderInstanceEntry } from "~/providerInstances";

/** Driver face a sub-run row or active-agent chip can draw. */
export interface SubRunDriver {
  readonly driverKind: ProviderDriverKind;
  readonly displayName: string;
  readonly iconDataUrl?: string | undefined;
  readonly acpRegistryAgentId?: string | undefined;
  readonly acpRegistryIconUrl?: string | undefined;
}

const BUILTIN_DRIVER_GLYPHS = new Set<string>([
  "codex",
  "claudeAgent",
  "cursor",
  "grok",
  "opencode",
  "antigravity",
  "pi",
]);

/**
 * Built-in glyphs for Codex, Claude, Cursor, Grok, OpenCode, Antigravity, and Pi.
 * Nexplore and every other driver draw only when a pack `iconDataUrl` or an ACP
 * registry icon is present; otherwise the row uses BotIcon.
 */
/** Catalog entry wins; a known driver kind still draws when the catalog has no row. */
export function subRunDriverFromCatalog(input: {
  readonly providers: ReadonlyArray<ServerProvider> | undefined;
  readonly instanceId: ProviderInstanceId | undefined;
  readonly driverKind?: ProviderDriverKind | undefined;
  readonly displayName?: string | undefined;
}): SubRunDriver | undefined {
  const entry =
    input.providers && input.instanceId
      ? getProviderInstanceEntry(input.providers, input.instanceId)
      : undefined;
  if (entry) {
    return {
      driverKind: entry.driverKind,
      displayName: entry.displayName,
      iconDataUrl: entry.iconDataUrl,
      acpRegistryAgentId: entry.acpRegistryAgentId,
      acpRegistryIconUrl: entry.acpRegistryIconUrl,
    };
  }
  if (!input.driverKind) return undefined;
  return { driverKind: input.driverKind, displayName: input.displayName ?? input.driverKind };
}

export function subRunDriverShowsGlyph(driver: SubRunDriver | null | undefined): boolean {
  if (!driver) return false;
  if (BUILTIN_DRIVER_GLYPHS.has(driver.driverKind)) return true;
  return Boolean(driver.iconDataUrl || driver.acpRegistryIconUrl);
}

export function SubRunDriverIcon({
  driver,
  className = "size-3.5",
}: {
  readonly driver: SubRunDriver | null | undefined;
  readonly className?: string;
}) {
  if (!subRunDriverShowsGlyph(driver) || !driver) {
    return (
      <span
        data-sub-run-driver=""
        className={cn("inline-flex shrink-0 items-center justify-center", className)}
      >
        <BotIcon aria-hidden className={className} />
      </span>
    );
  }
  return (
    <span data-sub-run-driver="" className="inline-flex shrink-0">
      <ProviderInstanceIcon
        driverKind={driver.driverKind}
        displayName={driver.displayName}
        iconDataUrl={driver.iconDataUrl}
        acpRegistryAgentId={driver.acpRegistryAgentId}
        acpRegistryIconUrl={driver.acpRegistryIconUrl}
        iconClassName={className}
        className={className}
      />
    </span>
  );
}
