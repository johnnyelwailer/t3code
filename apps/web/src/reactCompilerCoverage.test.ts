// @effect-diagnostics nodeBuiltinImport:off - compiles real source files on disk.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { transform } from "oxc-transform-react";
import { describe, expect, it } from "vite-plus/test";

const repoRoot = NodePath.resolve(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "../../..",
);
// t3team: TEMPORARY exemption pending owner decision H; see apps/web/t3team-react-compiler-pending.txt.
const t3teamCompilerPendingFiles = NodeFS.readFileSync(
  NodePath.join(repoRoot, "apps/web/t3team-react-compiler-pending.txt"),
  "utf8",
)
  .split("\n")
  .filter((line) => line.length > 0 && !line.startsWith("#"));

const webSourceFiles = NodeFS.readdirSync(NodePath.join(repoRoot, "apps/web/src"), {
  recursive: true,
})
  .map(String)
  .filter((file) => /\.tsx?$/.test(file) && !/\.(test|browser)\.tsx?$/.test(file))
  .filter((file) => !file.endsWith(".gen.ts"))
  .map((file) => `apps/web/src/${file}`)
  .filter((file) => !t3teamCompilerPendingFiles.includes(file));

// ChatView is ~9k lines. Compiling it takes ~9s on a fast machine and can pass the
// 15s project limit on loaded CI runners, so slow files get a 60s limit below.
const slowFiles = new Set(["apps/web/src/components/ChatView.tsx"]);

const compile = async (file: string) => {
  const absolute = NodePath.join(repoRoot, file);
  const result = await transform(absolute, NodeFS.readFileSync(absolute, "utf8"), {
    jsx: { runtime: "automatic", development: false, refresh: false },
    reactCompiler: { reportDiagnostics: true },
  });
  const bailouts = result.errors.map((error) => error.codeframe ?? error.message);
  expect(bailouts).toEqual([]);
};

// Lint reports most compiler bailouts, but not every one (try/finally, throw
// inside try). A skipped file still builds, just unmemoized, so check the output.
describe("React Compiler coverage", () => {
  it.each(webSourceFiles.filter((file) => !slowFiles.has(file)))("compiles %s", compile);
  // oxlint-disable-next-line t3code/no-test-timeout-or-unreasoned-skip -- CPU-bound compile of a huge file, not a hidden wait.
  it.each([...slowFiles])("compiles %s", compile, 60_000);
});

const MUST_COMPILE = [
  "apps/web/src/t3team/hooks/t3team-useGitHubAuthProbe.ts",
  "apps/web/src/t3team/hooks/t3team-useGitHubRepositoryDiscovery.ts",
  "apps/web/src/t3team/hooks/t3team-useGitHubRepositoryDiscoveryFetchers.ts",
  "apps/web/src/t3team/hooks/t3team-useCreateProjectFlow.ts",
] as const;

// Frozen ceiling: this number only goes down. When a file is cleaned, remove it
// from the list and lower this constant. useLatest stays listed: the compiler
// rejects the documented latest-ref assignment during render.
const MAX_T3TEAM_COMPILER_PENDING = 335;

describe("t3team React Compiler pending list", () => {
  it("cannot grow past the frozen ceiling", () => {
    expect(t3teamCompilerPendingFiles.length).toBeLessThanOrEqual(MAX_T3TEAM_COMPILER_PENDING);
  });

  it("every listed file still exists (drop stale entries)", () => {
    const missing = t3teamCompilerPendingFiles.filter(
      (file) => !NodeFS.existsSync(NodePath.join(repoRoot, file)),
    );
    expect(missing).toEqual([]);
  });

  it("has no duplicate paths", () => {
    expect(new Set(t3teamCompilerPendingFiles).size).toBe(t3teamCompilerPendingFiles.length);
  });

  it("keeps the auth probe, discovery, fetchers and create-project flow compiling", () => {
    expect(MUST_COMPILE.filter((file) => t3teamCompilerPendingFiles.includes(file))).toEqual([]);
  });
});
