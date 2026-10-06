import { type AccountDefinition, defineAccount } from "@t3team/pack-api";
import { activateWorkspacePack } from "@t3team/packs";

import { inertPackActivationContext } from "./t3team-pack-activationContext.ts";
import type { WorkspacePackHostDiagnostic } from "./t3team-pack-host.ts";

/**
 * Collects the accounts runtime packs define (`defineAccount`), each gated by its own
 * `account:<id>` capability: an account carries the user's credentials, so a pack must declare
 * which one it brings. The caller merges them with the compiled-in distribution's accounts before
 * the server layers build.
 */
export const loadPackAccounts = async (
  diagnostic: WorkspacePackHostDiagnostic,
): Promise<ReadonlyArray<AccountDefinition>> => {
  const accounts: AccountDefinition[] = [];
  for (const pack of diagnostic.resolution?.packs ?? []) {
    if (!pack.manifest.entrypoints?.activate) continue;
    await activateWorkspacePack(pack, {
      ...inertPackActivationContext,
      defineAccount: (definition) => {
        const capability = `account:${definition.id}`;
        if (!pack.manifest.capabilities.includes(capability)) {
          throw new Error(
            `Pack ${pack.manifest.id} defines account ${definition.id} without ${capability}`,
          );
        }
        accounts.push(defineAccount(definition));
      },
    });
  }
  return accounts;
};
