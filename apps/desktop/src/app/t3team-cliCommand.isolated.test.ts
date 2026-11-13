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
});
