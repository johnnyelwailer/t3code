import { activateWorkspacePack } from "@t3team/packs";
import { inertPackActivationContext } from "./t3team-pack-activationContext.ts";
import type { WorkspacePackHostDiagnostic } from "./t3team-pack-host.ts";
import { registerHostService } from "./t3team-hostServiceRegistry.ts";

export async function loadPackHostServices(diagnostic: WorkspacePackHostDiagnostic) {
  for (const pack of diagnostic.resolution?.packs ?? []) {
    if (!pack.manifest.entrypoints?.activate) continue;
    await activateWorkspacePack(pack, {
      ...inertPackActivationContext,
      defineHostService: registerHostService,
    });
  }
}
