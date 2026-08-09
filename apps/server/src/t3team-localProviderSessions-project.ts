import * as Effect from "effect/Effect";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";

import * as RepositoryIdentityResolver from "./project/RepositoryIdentityResolver.ts";
import { workspacePathsMatch } from "./t3team-localProviderSessions.ts";

interface LocalProviderProject {
  readonly workspaceRoot: string;
}

export const findLocalProviderProject = <T extends LocalProviderProject>(
  cwd: string,
  projects: ReadonlyArray<T>,
): Effect.Effect<T | undefined, never, RepositoryIdentityResolver.RepositoryIdentityResolver> =>
  Effect.gen(function* () {
    // Injected rather than read from process.platform: path comparison is case- and
    // separator-sensitive on Windows, and tests must be able to exercise both.
    const hostPlatform = yield* HostProcessPlatform;
    const exact = projects.find((project) =>
      workspacePathsMatch(project.workspaceRoot, cwd, hostPlatform),
    );
    if (exact) return exact;

    const resolver = yield* RepositoryIdentityResolver.RepositoryIdentityResolver;
    const sessionRepository = yield* resolver.resolve(cwd);
    if (!sessionRepository) return undefined;

    for (const project of projects) {
      const projectRepository = yield* resolver.resolve(project.workspaceRoot);
      if (projectRepository?.canonicalKey === sessionRepository.canonicalKey) return project;
    }
    return undefined;
  });
