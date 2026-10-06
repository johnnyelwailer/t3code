/**
 * Which main repository delegated worktree isolation treats as the workspace repository itself.
 *
 * A main repository selected on the project record IS the workspace checkout, so it isolates like
 * an adopted one even before a bootstrap wrote it into the reference manifest. Otherwise the
 * manifest's `mainRepository` entry counts while the main-repository flag is on; adopted monorepos
 * predate the selection feature and keep their behavior with the flag off.
 *
 * @module t3team-delegateTaskMainRepository
 */
import type { ProjectMainRepository } from "@t3tools/contracts";

import type { MainRepositoryBootstrapResult } from "./t3team-project-repository-utils.ts";

export const selectDelegatedMainRepository = (input: {
  readonly projectMainRepository: ProjectMainRepository | null | undefined;
  readonly manifestMainRepository: MainRepositoryBootstrapResult | undefined;
  readonly mainRepositoryEnabled: boolean;
}): MainRepositoryBootstrapResult | undefined => {
  const selected = input.mainRepositoryEnabled ? input.projectMainRepository : undefined;
  if (selected) {
    return {
      localPath: selected.checkoutPath,
      status: selected.selection ?? "user",
      ...(selected.url ? { url: selected.url } : {}),
    };
  }
  return input.mainRepositoryEnabled || input.manifestMainRepository?.status === "adopted"
    ? input.manifestMainRepository
    : undefined;
};
