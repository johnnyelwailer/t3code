// @effect-diagnostics nodeBuiltinImport:off
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it, it as effectIt } from "@effect/vitest";
import * as Effect from "effect/Effect";

import * as HostProcess from "@t3tools/shared/HostProcess";
import { CommandResolutionCache, SpawnExecutableResolution } from "@t3tools/shared/shell";
import { CLAUDE } from "./t3team-adapters.ts";
import { ptyCommandForResolved } from "./t3team-loginService.ts";
import {
  makeService,
  makeTempHome,
  removeTempHome,
  stubProbeRunner,
} from "./t3team-toolauthTestHarness.ts";

describe("ptyCommandForResolved", () => {
  it("passes an absolute .exe through so node-pty does not have to search PATH", () => {
    const resolved = {
      command: "C:\\Users\\me\\.local\\bin\\claude.exe",
      args: ["auth", "login"],
      shell: false as const,
    };
    expect(ptyCommandForResolved(resolved, "win32")).toEqual({
      shell: resolved.command,
      args: resolved.args,
    });
  });

  it("wraps a .cmd command line in cmd.exe /d /s /c on Windows", () => {
    const commandLine = '"C:\\npm\\claude.cmd" auth login';
    const resolved = {
      command: commandLine,
      args: [] as const,
      shell: true as const,
    };
    expect(ptyCommandForResolved(resolved, "win32")).toEqual({
      shell: "cmd.exe",
      args: ["/d", "/s", "/c", commandLine],
    });
  });

  it("wraps a shell command line in /bin/sh -c on other platforms", () => {
    const resolved = {
      command: "claude auth login",
      args: [] as const,
      shell: true as const,
    };
    expect(ptyCommandForResolved(resolved, "linux")).toEqual({
      shell: "/bin/sh",
      args: ["-c", "claude auth login"],
    });
  });
});

// HostProcess.Platform has to wrap start() itself: makeService only provides
// layers while the service is built, and start() is a later Effect.
// SpawnExecutableResolution is stubbed because Node's path.win32.join turns a
// Linux temp path into "\\tmp\\..." which does not exist on this host;
// PATHEXT lookup itself is already covered in packages/shared/src/shell.test.ts.
effectIt.layer(NodeServices.layer)("ToolAuth login spawn on Windows", (it) => {
  it.effect(
    "start() passes the PATHEXT-resolved claude.exe path to the pty, not the bare name",
    () =>
      Effect.gen(function* () {
        const homeDir = makeTempHome();
        const claudeExe = "C:\\Users\\me\\.local\\bin\\claude.exe";
        try {
          const { service, ptyAdapter } = yield* makeService(
            homeDir,
            { tools: ["claude"] },
            stubProbeRunner('{"loggedIn":false,"authMethod":"none"}'),
          );
          const state = yield* service.start("claude");
          expect(state.phase).toBe("starting");
          expect(ptyAdapter.spawnInputs).toHaveLength(1);
          expect(ptyAdapter.spawnInputs[0]?.shell).toBe(claudeExe);
          expect(ptyAdapter.spawnInputs[0]?.args).toEqual(CLAUDE.command.slice(1));
          expect(ptyAdapter.spawnInputs[0]?.shell).not.toBe("claude");
        } finally {
          removeTempHome(homeDir);
        }
      }).pipe(
        Effect.provideService(HostProcess.Platform, "win32"),
        Effect.provideService(CommandResolutionCache, new Map()),
        Effect.provideService(SpawnExecutableResolution, (command, platform) =>
          command === "claude" && platform === "win32"
            ? "C:\\Users\\me\\.local\\bin\\claude.exe"
            : undefined,
        ),
      ),
  );
});
