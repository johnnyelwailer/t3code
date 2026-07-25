import * as Effect from "effect/Effect";

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
    const exact = projects.find((project) => workspacePathsMatch(project.workspaceRoot, cwd));
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
