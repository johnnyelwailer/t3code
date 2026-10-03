import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { afterEach, expect, it, vi } from "vite-plus/test";

// A small in-memory filesystem keeps migration assertions independent of git and the host disk.
function memoryFs(initial: Record<string, string>) {
  const files = new Map(Object.entries(initial));
  const directories = new Set<string>();
  const mkdir = (target: string) => {
    for (let dir = target; dir !== "/"; dir = dir.slice(0, dir.lastIndexOf("/")) || "/")
      directories.add(dir);
  };
  for (const file of files.keys()) mkdir(file.slice(0, file.lastIndexOf("/")));
  const fileSystem = FileSystem.makeNoop({
    exists: (target) => Effect.succeed(files.has(target) || directories.has(target)),
    stat: (target) =>
      Effect.succeed({
        type: directories.has(target) ? "Directory" : "File",
      } as FileSystem.File.Info),
    readDirectory: (target) =>
      Effect.succeed([
        ...new Set(
          [...directories, ...files.keys()]
            .filter((entry) => entry.startsWith(`${target}/`))
            .map((entry) => entry.slice(target.length + 1).split("/")[0]!),
        ),
      ]),
    makeDirectory: (target) => Effect.sync(() => mkdir(target)),
    readFileString: (target) => Effect.succeed(files.get(target)!),
    writeFileString: (target, contents) =>
      Effect.sync(() => {
        files.set(target, contents);
      }),
    copyFile: (from, to) =>
      Effect.sync(() => {
        files.set(to, files.get(from)!);
      }),
  });
  return { files, fileSystem };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it("detects old state under flag-on and migrates once without copying clones or worktrees", async () => {
  vi.stubEnv("NEXI_FF_NEXI_STATE_DIR", "1");
  vi.resetModules();
  const { ensureNexiProjectStateDir, detectMainRepositoryCandidates } =
    await import("./t3team-projectMainRepositoryState.ts");
  const { files, fileSystem } = memoryFs({
    "/repo/.git/HEAD": "main",
    "/repo/.t3team/context/entrypoint.json": '{"paths":{"manifest":".t3team/context/m.json"}}',
    "/repo/.t3team/references/reference-repositories.json": "{}",
    "/repo/.t3team/references/clone/heavy": "clone",
    "/repo/.t3team/child-session-worktrees/child/heavy": "child",
  });
  const run = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
    Effect.runPromise(
      effect.pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.provide(Path.layer),
      ),
    );
  expect(
    await run(
      detectMainRepositoryCandidates([{ url: "local/repo", localPath: "/repo", status: "cloned" }]),
    ),
  ).toEqual([{ url: "local/repo", checkoutPath: "/repo" }]);
  expect(JSON.parse(files.get("/repo/.nexi/context/entrypoint.json")!)).toEqual({
    paths: { manifest: ".nexi/context/m.json" },
  });
  expect(files.get("/repo/.nexi/references/reference-repositories.json")).toBe("{}");
  expect(files.has("/repo/.nexi/references/clone/heavy")).toBe(false);
  expect(files.has("/repo/.nexi/child-session-worktrees/child/heavy")).toBe(false);
  expect(files.has("/repo/.t3team/context/entrypoint.json")).toBe(true);
  files.set("/repo/.t3team/context/new.json", "new");
  expect(await run(ensureNexiProjectStateDir("/repo"))).toEqual([]);
  expect(files.has("/repo/.nexi/context/new.json")).toBe(false);
});

it("keeps an existing .nexi target and skips normalization when flag-off", async () => {
  for (const flag of ["1", ""]) {
    vi.stubEnv("NEXI_FF_NEXI_STATE_DIR", flag);
    vi.resetModules();
    const { ensureNexiProjectStateDir } = await import("./t3team-projectMainRepositoryState.ts");
    const { files, fileSystem } = memoryFs({
      "/repo/.t3team/context/a.json": "old",
      ...(flag ? { "/repo/.nexi/context/a.json": "committed" } : {}),
    });
    await Effect.runPromise(
      ensureNexiProjectStateDir("/repo").pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.provide(Path.layer),
      ),
    );
    expect(files.get("/repo/.nexi/context/a.json")).toBe(flag ? "committed" : undefined);
  }
});
