/**
 * Test files that live outside the project whose vitest config runs them.
 *
 * `@t3team/sdk` is a path-aliased source package with no package.json of its own, so
 * apps/server/vite.config.ts includes its tests in the server run (`../../packages/t3team-sdk/...`).
 * The cached/sharded runner must therefore accept those files in the server shards and run them from
 * the server project directory.
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
