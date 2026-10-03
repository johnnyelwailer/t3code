// @effect-diagnostics preferSchemaOverJson:off - fixtures assert the raw JSON bytes the state migration writes.
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import { it } from "@effect/vitest";
import { afterEach, expect, vi } from "vite-plus/test";

// A small in-memory filesystem keeps migration assertions independent of git and the host disk.
function readOnly(method: string, path: string) {
  return PlatformError.systemError({
    _tag: "PermissionDenied",
    module: "FileSystem",
    method,
    pathOrDescriptor: path,
    description: "read-only",
  });
}

function memoryFs(
  initial: Record<string, string>,
  control?: { failCopies: boolean; failWrites: boolean; copies: number },
) {
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
      control?.failWrites
        ? Effect.fail(readOnly("writeFileString", target))
        : Effect.sync(() => {
            files.set(target, contents);
          }),
    copyFile: (from, to) => {
      if (control) control.copies += 1;
      return control?.failCopies
        ? Effect.fail(readOnly("copyFile", to))
        : Effect.sync(() => {
            files.set(to, files.get(from)!);
          });
    },
    remove: (target) =>
      Effect.sync(() => {
        for (const key of [...files.keys()]) {
          if (key === target || key.startsWith(`${target}/`)) files.delete(key);
        }
        for (const dir of [...directories]) {
          if (dir === target || dir.startsWith(`${target}/`)) directories.delete(dir);
        }
      }),
  });
  return { files, directories, fileSystem };
}

function nexiGate(files: Map<string, string>, directories: Set<string>) {
  const hit = (entry: string) => entry === "/repo/.nexi" || entry.startsWith("/repo/.nexi/");
  return [...files.keys()].some(hit) || [...directories].some(hit);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it.effect(
  "detects old state under flag-on and migrates once without copying clones or worktrees",
  () =>
    Effect.gen(function* () {
      vi.stubEnv("NEXI_FF_NEXI_STATE_DIR", "1");
      vi.resetModules();
      const { ensureNexiProjectStateDir, detectMainRepositoryCandidates } = yield* Effect.promise(
        () => import("./t3team-projectMainRepositoryState.ts"),
      );
      const { files, fileSystem } = memoryFs({
        "/repo/.git/HEAD": "main",
        "/repo/.t3team/context/entrypoint.json": '{"paths":{"manifest":".t3team/context/m.json"}}',
        "/repo/.t3team/references/reference-repositories.json": "{}",
        "/repo/.t3team/references/clone/heavy": "clone",
        "/repo/.t3team/child-session-worktrees/child/heavy": "child",
      });
      const run = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
        effect.pipe(
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provide(Path.layer),
        );
      expect(
        yield* run(
          detectMainRepositoryCandidates([
            { url: "local/repo", localPath: "/repo", status: "cloned" },
          ]),
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
      expect(yield* run(ensureNexiProjectStateDir("/repo"))).toEqual([]);
      expect(files.has("/repo/.nexi/context/new.json")).toBe(false);
    }),
);

it.effect("keeps an existing .nexi target and skips normalization when flag-off", () =>
  Effect.gen(function* () {
    for (const flag of ["1", ""]) {
      vi.stubEnv("NEXI_FF_NEXI_STATE_DIR", flag);
      vi.resetModules();
      const { ensureNexiProjectStateDir } = yield* Effect.promise(
        () => import("./t3team-projectMainRepositoryState.ts"),
      );
      const { files, fileSystem } = memoryFs({
        "/repo/.t3team/context/a.json": "old",
        ...(flag ? { "/repo/.nexi/context/a.json": "committed" } : {}),
      });
      yield* ensureNexiProjectStateDir("/repo").pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.provide(Path.layer),
      );
      expect(files.get("/repo/.nexi/context/a.json")).toBe(flag ? "committed" : undefined);
    }
  }),
);

it.effect("does not publish an empty .nexi gate when every copy fails, then retries", () =>
  Effect.gen(function* () {
    vi.stubEnv("NEXI_FF_NEXI_STATE_DIR", "1");
    vi.resetModules();
    const { ensureNexiProjectStateDir } = yield* Effect.promise(
      () => import("./t3team-projectMainRepositoryState.ts"),
    );
    const source = '{"paths":{"manifest":".t3team/context/m.json"}}';
    const control = { failCopies: true, failWrites: false, copies: 0 };
    const { files, directories, fileSystem } = memoryFs(
      {
        "/repo/.t3team/context/entrypoint.json": source,
        "/repo/.t3team/references/reference-repositories.json": "{}",
      },
      control,
    );
    const run = () =>
      ensureNexiProjectStateDir("/repo").pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.provide(Path.layer),
      );
    expect(yield* run()).toEqual([]);
    expect(nexiGate(files, directories)).toBe(false);
    const copiesAfterFirst = control.copies;
    expect(copiesAfterFirst).toBeGreaterThan(0);
    expect(yield* run()).toEqual([]);
    expect(control.copies).toBeGreaterThan(copiesAfterFirst);
    expect(nexiGate(files, directories)).toBe(false);
    expect(files.get("/repo/.t3team/context/entrypoint.json")).toBe(source);
    control.failCopies = false;
    expect(yield* run()).toEqual([
      "context/entrypoint.json",
      "references/reference-repositories.json",
    ]);
    expect(JSON.parse(files.get("/repo/.nexi/context/entrypoint.json")!)).toEqual({
      paths: { manifest: ".nexi/context/m.json" },
    });
    expect(files.get("/repo/.nexi/references/reference-repositories.json")).toBe("{}");
    const copiesAfterSuccess = control.copies;
    expect(yield* run()).toEqual([]);
    expect(control.copies).toBe(copiesAfterSuccess);
  }),
);

it.effect("drops a partial .nexi when a context rewrite fails so the next call can retry", () =>
  Effect.gen(function* () {
    vi.stubEnv("NEXI_FF_NEXI_STATE_DIR", "1");
    vi.resetModules();
    const { ensureNexiProjectStateDir } = yield* Effect.promise(
      () => import("./t3team-projectMainRepositoryState.ts"),
    );
    const source = '{"paths":{"manifest":".t3team/context/m.json"}}';
    const control = { failCopies: false, failWrites: true, copies: 0 };
    const { files, directories, fileSystem } = memoryFs(
      {
        "/repo/.t3team/context/entrypoint.json": source,
        "/repo/.t3team/references/reference-repositories.json": "{}",
      },
      control,
    );
    const run = () =>
      ensureNexiProjectStateDir("/repo").pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.provide(Path.layer),
      );
    expect(yield* run()).toEqual([]);
    expect(nexiGate(files, directories)).toBe(false);
    expect(files.get("/repo/.t3team/context/entrypoint.json")).toBe(source);
    control.failWrites = false;
    expect(yield* run()).toEqual([
      "context/entrypoint.json",
      "references/reference-repositories.json",
    ]);
    expect(JSON.parse(files.get("/repo/.nexi/context/entrypoint.json")!)).toEqual({
      paths: { manifest: ".nexi/context/m.json" },
    });
  }),
);
