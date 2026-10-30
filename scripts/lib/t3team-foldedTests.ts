/**
 * apps/server/vite.config.ts also runs the package-less @t3team/sdk tests, so the sharded runner
 * must accept them in the server shards and run them from apps/server.
 */
const FOLDED_TEST_PROJECTS: ReadonlyArray<readonly [string, string]> = [
  ["packages/t3team-sdk", "apps/server"],
];

/** The project directory (repo-relative) that runs `file`, when it is not the nearest package.json. */
export function foldedTestProject(file: string): string | undefined {
  return FOLDED_TEST_PROJECTS.find(([root]) => file.startsWith(`${root}/`))?.[1];
}

/** Test roots a shard of `projectDirectory` also owns. */
export function foldedTestRoots(projectDirectory: string): ReadonlyArray<string> {
  return FOLDED_TEST_PROJECTS.filter(([, project]) => project === projectDirectory).map(
    ([root]) => root,
  );
}
