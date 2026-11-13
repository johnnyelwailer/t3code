import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import * as DesktopCliCommand from "./DesktopCliCommand.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";

const environmentFor = (
  path: Path.Path,
  input: {
    home: string;
    baseDir: string;
    platform?: NodeJS.Platform;
    isPackaged?: boolean;
    isolatedInstance?: boolean;
  },
) =>
  DesktopEnvironment.DesktopEnvironment.of({
    path,
    platform: input.platform ?? "linux",
    isPackaged: input.isPackaged ?? true,
    homeDirectory: input.home,
    baseDir: input.baseDir,
    stateDir: path.join(input.baseDir, "userdata"),
    serverRoot: "/opt/T3 Code/resources/app.asar",
    appImagePath: Option.none(),
    isolatedInstance: input.isolatedInstance ?? false,
  } as unknown as DesktopEnvironment.DesktopEnvironment["Service"]);

const commandIn = (input: {
  home: string;
  baseDir?: string;
  platform?: NodeJS.Platform;
  isPackaged?: boolean;
  isolatedInstance?: boolean;
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    const baseDir = input.baseDir ?? path.join(input.home, ".t3");
    yield* fs.makeDirectory(path.join(baseDir, "userdata"), { recursive: true });
    return yield* DesktopCliCommand.make.pipe(
      Effect.provideService(
        DesktopEnvironment.DesktopEnvironment,
        environmentFor(path, { ...input, baseDir }),
      ),
    );
  });

it.layer(NodeServices.layer)("isolated Nexi CLI command", (it) => {
  it.effect("installs a nexi PATH link and leaves t3 alone for an isolated instance", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fs.makeTempDirectoryScoped();
      const baseDir = path.join(home, "Library", "Application Support", "nexi-work");
      const upstream = path.join(home, ".local", "bin", "t3");
      yield* fs.makeDirectory(path.dirname(upstream), { recursive: true });
      yield* fs.writeFileString(upstream, "#!/bin/sh\n", { mode: 0o755 });
      const command = yield* commandIn({ home, baseDir, isolatedInstance: true });
      const link = path.join(home, ".local", "bin", "nexi");
      const launcher = path.join(baseDir, "bin", "nexi");

      const installed = yield* command.install;
      expect(installed.installedPath).toBe(link);
      expect(installed.launcherPath).toBe(launcher);
      expect(yield* fs.readLink(link)).toBe(launcher);
      expect(yield* fs.readFileString(upstream)).toBe("#!/bin/sh\n");

      expect((yield* command.uninstall).installedPath).toBeNull();
      expect(yield* fs.exists(link)).toBe(false);
      expect(yield* fs.exists(launcher)).toBe(true);
      expect(yield* fs.exists(upstream)).toBe(true);
    }).pipe(Effect.scoped),
  );

  it.effect(
    "on macOS, links nexi in ~/.local/bin without editing any shell profile, and uninstall strips an old snippet",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const home = yield* fs.makeTempDirectoryScoped();
        const baseDir = path.join(home, "Library", "Application Support", "nexi-work");
        const localBin = path.join(home, ".local", "bin");
        const upstream = path.join(localBin, "t3");
        yield* fs.makeDirectory(localBin, { recursive: true });
        yield* fs.writeFileString(upstream, "#!/bin/sh\n# upstream t3\n", { mode: 0o755 });
        const previousPath = process.env.PATH;
        // ~/.local/bin is typically not on a Mac GUI app's PATH.
        process.env.PATH = "/usr/bin:/bin";
        try {
          const command = yield* commandIn({
            home,
            baseDir,
            isolatedInstance: true,
          });
          const link = path.join(localBin, "nexi");
          const installed = yield* command.install;
          expect(installed.installedPath).toBe(link);
          expect(yield* fs.readLink(link)).toBe(path.join(baseDir, "bin", "nexi"));
          expect(yield* fs.readFileString(upstream)).toBe("#!/bin/sh\n# upstream t3\n");
          expect(yield* fs.exists(path.join(localBin, "t3"))).toBe(true);
          for (const profile of [".zprofile", ".bash_profile", ".profile"]) {
            expect(yield* fs.exists(path.join(home, profile))).toBe(false);
          }
          // Idempotent, and still no profile edits.
          const again = yield* command.install;
          expect(again.installedPath).toBe(link);
          expect(yield* fs.exists(path.join(home, ".zprofile"))).toBe(false);
          // An earlier test build may have left a marked snippet: uninstall removes only that.
          yield* fs.writeFileString(
            path.join(home, ".zprofile"),
            "export FOO=1\n\n# nexi-work-cli-path:begin\nexport PATH=x\n# nexi-work-cli-path:end\n",
          );
          expect((yield* command.uninstall).installedPath).toBeNull();
          expect(yield* fs.exists(link)).toBe(false);
          expect(yield* fs.exists(upstream)).toBe(true);
          const after = yield* fs.readFileString(path.join(home, ".zprofile"));
          expect(after).not.toContain("nexi-work-cli-path:begin");
          expect(after).toContain("export FOO=1");
        } finally {
          process.env.PATH = previousPath;
        }
      }).pipe(Effect.scoped),
  );

  it.effect("on macOS, does not write a profile snippet when the bin dir is already on PATH", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fs.makeTempDirectoryScoped();
      const baseDir = path.join(home, "Library", "Application Support", "nexi-work");
      const localBin = path.join(home, ".local", "bin");
      yield* fs.makeDirectory(localBin, { recursive: true });
      const previousPath = process.env.PATH;
      process.env.PATH = `${localBin}:/usr/bin:/bin`;
      try {
        const command = yield* commandIn({
          home,
          baseDir,
          isolatedInstance: true,
        });
        yield* command.install;
        expect(yield* fs.exists(path.join(home, ".zprofile"))).toBe(false);
        expect(yield* fs.exists(path.join(localBin, "nexi"))).toBe(true);
      } finally {
        process.env.PATH = previousPath;
      }
    }).pipe(Effect.scoped),
  );
});
