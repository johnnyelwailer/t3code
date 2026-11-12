// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
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

// HostProcess.Platform and SpawnExecutableResolution wrap start(), not
// makeService(): those layers only apply while the service is built.
// The resolver is stubbed because path.win32.join of a Linux path is not
// a real .exe. PATHEXT lookup is already covered in shell.test.ts.
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

function writeExecutable(filePath: string): void {
  NodeFS.mkdirSync(NodePath.dirname(filePath), { recursive: true });
  NodeFS.writeFileSync(filePath, "#!/bin/sh\nexit 0\n");
  NodeFS.chmodSync(filePath, 0o755);
}

effectIt.layer(NodeServices.layer)("ToolAuth login uses the account's configured binary", (it) => {
  it.effect("start() uses a configured path and CLAUDE_CONFIG_DIR for that account", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      const monBin = NodePath.join(homeDir, "bin", "claude-mon");
      const monHome = NodePath.join(homeDir, "mon-home");
      writeExecutable(monBin);
      try {
        const { service, ptyAdapter } = yield* makeService(
          homeDir,
          { tools: ["claude"] },
          stubProbeRunner('{"loggedIn":true}'),
        );
        const state = yield* service.start("claude", {
          instanceId: "mon",
          account: { instanceId: "mon", binaryPath: monBin, homePath: monHome },
        });
        expect(state.phase).toBe("starting");
        expect(state.instanceId).toBe("mon");
        expect(ptyAdapter.spawnInputs).toHaveLength(1);
        expect(ptyAdapter.spawnInputs[0]?.shell).toBe(monBin);
        expect(ptyAdapter.spawnInputs[0]?.args).toEqual(CLAUDE.command.slice(1));
        expect(ptyAdapter.spawnInputs[0]?.env?.CLAUDE_CONFIG_DIR).toBe(monHome);
      } finally {
        removeTempHome(homeDir);
      }
    }),
  );

  it.effect("two accounts with different binaries each spawn their own path and config dir", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      const monBin = NodePath.join(homeDir, "bin", "claude-mon");
      const wedBin = NodePath.join(homeDir, "bin", "claude-wed");
      const monHome = NodePath.join(homeDir, "mon-home");
      const wedHome = NodePath.join(homeDir, "wed-home");
      writeExecutable(monBin);
      writeExecutable(wedBin);
      try {
        const { service, ptyAdapter } = yield* makeService(
          homeDir,
          { tools: ["claude"] },
          stubProbeRunner('{"loggedIn":false,"authMethod":"none"}'),
        );
        yield* service.start("claude", {
          instanceId: "mon",
          account: { instanceId: "mon", binaryPath: monBin, homePath: monHome },
        });
        yield* service.start("claude", {
          instanceId: "wed",
          account: { instanceId: "wed", binaryPath: wedBin, homePath: wedHome },
        });
        expect(ptyAdapter.spawnInputs).toHaveLength(2);
        expect(ptyAdapter.spawnInputs[0]?.shell).toBe(monBin);
        expect(ptyAdapter.spawnInputs[0]?.env?.CLAUDE_CONFIG_DIR).toBe(monHome);
        expect(ptyAdapter.spawnInputs[1]?.shell).toBe(wedBin);
        expect(ptyAdapter.spawnInputs[1]?.env?.CLAUDE_CONFIG_DIR).toBe(wedHome);
      } finally {
        removeTempHome(homeDir);
      }
    }),
  );

  it.effect(
    "a missing or invalid configured binary is a plain failed state with Retry, and does not spawn",
    () =>
      Effect.gen(function* () {
        const homeDir = makeTempHome();
        const missing = NodePath.join(homeDir, "no-such", "claude-mon");
        const notAFile = NodePath.join(homeDir, "not-a-binary");
        NodeFS.mkdirSync(notAFile);
        try {
          const { service, ptyAdapter } = yield* makeService(
            homeDir,
            { tools: ["claude"] },
            stubProbeRunner('{"loggedIn":false}'),
          );
          const missingState = yield* service.start("claude", {
            instanceId: "mon",
            account: {
              instanceId: "mon",
              binaryPath: missing,
              homePath: NodePath.join(homeDir, "mon"),
            },
          });
          expect(missingState.phase).toBe("failed");
          expect(missingState.reason).toBe("configuredBinaryMissing");
          expect(missingState.message).toContain(missing);
          expect(missingState.message).toContain("try again");
          expect(ptyAdapter.spawnInputs).toHaveLength(0);

          const invalidState = yield* service.start("claude", {
            instanceId: "wed",
            account: {
              instanceId: "wed",
              binaryPath: notAFile,
              homePath: NodePath.join(homeDir, "wed"),
            },
          });
          expect(invalidState.phase).toBe("failed");
          expect(invalidState.reason).toBe("configuredBinaryMissing");
          expect(ptyAdapter.spawnInputs).toHaveLength(0);
        } finally {
          removeTempHome(homeDir);
        }
      }),
  );
});
