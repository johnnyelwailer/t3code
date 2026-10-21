import * as NodeServices from "@effect/platform-node/NodeServices";
import { it as effectIt } from "@effect/vitest";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { CommandAvailability, WindowsShellEnvironment } from "@t3tools/shared/shell";
import * as Effect from "effect/Effect";
// @effect-diagnostics-next-line nodeBuiltinImport:off -- Observe the existing synchronous shell probe without launching the user's login shell.
import * as NodeChildProcess from "node:child_process";
import * as NodeOS from "node:os";
import { assert, it, vi } from "vite-plus/test";

import { fixPath, hydratePosixHome, hydratePosixPath } from "./os-jank.ts";

vi.mock("node:child_process", { spy: true });

it("hydrates HOME independently of a blank process HOME", () => {
  const originalHome = process.env.HOME;
  const env: NodeJS.ProcessEnv = { HOME: " " };

  try {
    process.env.HOME = " ";
    hydratePosixHome(env);
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  }

  assert.equal(env.HOME, NodeOS.userInfo().homedir);
});

it("preserves an explicitly configured HOME", () => {
  const env: NodeJS.ProcessEnv = { HOME: "/custom/home" };

  hydratePosixHome(env, () => {
    throw new Error("HOME lookup should not run");
  });

  assert.equal(env.HOME, "/custom/home");
});

it("appends existing per-user CLI directories without changing inherited precedence", () => {
  const env: NodeJS.ProcessEnv = {
    HOME: "/Users/test",
    PATH: "/usr/bin:/bin",
    SHELL: "/bin/test-shell",
  };

  hydratePosixPath(env, "darwin", {
    readLoginShellPath: () => "/opt/homebrew/bin:/usr/bin",
    isDirectory: (path) => path === "/Users/test/.local/bin",
  });

  assert.equal(env.PATH, "/opt/homebrew/bin:/usr/bin:/bin:/Users/test/.local/bin");
});

it("uses configured tool homes and ignores missing directories", () => {
  const env: NodeJS.ProcessEnv = {
    HOME: "/Users/test",
    PATH: "/usr/bin",
    SHELL: "/bin/test-shell",
    BUN_INSTALL: "/opt/bun",
    PNPM_HOME: "/opt/pnpm",
  };

  hydratePosixPath(env, "linux", {
    readLoginShellPath: () => undefined,
    isDirectory: (path) => path === "/opt/bun/bin" || path === "/opt/pnpm",
  });

  assert.equal(env.PATH, "/usr/bin:/opt/bun/bin:/opt/pnpm");
});

it("keeps configured tool homes when HOME is unavailable", () => {
  const env: NodeJS.ProcessEnv = {
    PATH: "/usr/bin",
    BUN_INSTALL: "/opt/bun",
  };

  hydratePosixPath(env, "linux", {
    readLoginShellPath: () => undefined,
    isDirectory: (path) => path === "/opt/bun/bin",
  });

  assert.equal(env.PATH, "/usr/bin:/opt/bun/bin");
});

it("rejects relative environment roots", () => {
  const env: NodeJS.ProcessEnv = {
    HOME: ".",
    PATH: "/usr/bin",
    BUN_INSTALL: "tools",
  };

  hydratePosixPath(env, "linux", {
    readLoginShellPath: () => undefined,
    isDirectory: () => true,
  });

  assert.equal(env.PATH, "/usr/bin");
});

effectIt.effect("hydrates PATH when the desktop handoff is absent", () =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      vi
        .spyOn(NodeChildProcess, "execFileSync")
        .mockReturnValue("__T3CODE_ENV_PATH_START__\n/opt/tools/bin\n__T3CODE_ENV_PATH_END__\n"),
    ),
    (probe) =>
      Effect.gen(function* () {
        const env: NodeJS.ProcessEnv = { SHELL: "/bin/bash", PATH: "/usr/bin" };

        yield* fixPath().pipe(
          Effect.provideService(HostProcess.Platform, "linux"),
          Effect.provideService(HostProcess.Environment, env),
          Effect.provide(NodeServices.layer),
        );

        assert.equal(probe.mock.calls.length, 1);
        assert.equal(env.PATH, "/opt/tools/bin:/usr/bin");
      }),
    (probe) => Effect.sync(() => probe.mockRestore()),
  ),
);

effectIt.effect("keeps mise's PATH record with the login shell PATH", () =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      vi
        .spyOn(NodeChildProcess, "execFileSync")
        .mockReturnValue(
          [
            "__T3CODE_ENV_PATH_START__",
            "/home/me/.local/bin:/mise/installs/claude/latest:/mise/shims",
            "__T3CODE_ENV_PATH_END__",
            "__T3CODE_ENV___MISE_DIFF_START__",
            "mise-diff",
            "__T3CODE_ENV___MISE_DIFF_END__",
          ].join("\n"),
        ),
    ),
    () =>
      Effect.gen(function* () {
        const env: NodeJS.ProcessEnv = { SHELL: "/bin/bash", PATH: "/usr/bin" };

        yield* fixPath().pipe(
          Effect.provideService(HostProcess.Platform, "linux"),
          Effect.provideService(HostProcess.Environment, env),
          Effect.provide(NodeServices.layer),
        );

        assert.equal(env.__MISE_DIFF, "mise-diff");
      }),
    (probe) => Effect.sync(() => probe.mockRestore()),
  ),
);

effectIt.effect("replaces a Path-spelled Windows PATH instead of adding a second key", () =>
  Effect.gen(function* () {
    const env: NodeJS.ProcessEnv = { Path: "C:\\Windows" };

    yield* fixPath().pipe(
      Effect.provideService(HostProcess.Platform, "win32"),
      Effect.provideService(HostProcess.Environment, env),
      Effect.provideService(WindowsShellEnvironment, () => ({ PATH: "C:\\Tools" })),
      Effect.provideService(CommandAvailability, () => Effect.succeed(true)),
      Effect.provide(NodeServices.layer),
    );

    assert.deepEqual(env, { PATH: "C:\\Tools;C:\\Windows" });
  }),
);
