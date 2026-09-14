/**
 * t3team: fork-owned provider snapshot helpers.
 *
 * Upstream `providerModels.ts` keeps its snapshot lookup private
 * ("keep app utilities private", upstream #10227) and the additive guard
 * forbids fork-only exports in that file. The distribution layer therefore
 * carries its own prefixed module; upstream's module stays byte-identical.
 * The lookup mirrors upstream's `getProviderSnapshot` (default instance id
 * for the driver kind) — keep the two in sync if upstream changes it.
 */
import {
  defaultInstanceIdForDriver,
  ProviderDriverKind,
  type ServerProvider,
} from "@t3tools/contracts";

export function getProviderInteractionModeToggle(
  providers: ReadonlyArray<ServerProvider>,
  provider: ProviderDriverKind,
): boolean {
  const defaultInstanceId = defaultInstanceIdForDriver(provider);
  const snapshot = providers.find((candidate) => candidate.instanceId === defaultInstanceId);
  return snapshot?.showInteractionModeToggle ?? true;
}
