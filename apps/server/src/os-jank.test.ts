import * as NodeOS from "node:os";
import { assert, it } from "vite-plus/test";

import { hydratePosixHome, hydratePosixPath } from "./os-jank.ts";

it("hydrates HOME for minimal service environments from the user account", () => {
  const env: NodeJS.ProcessEnv = {};

  hydratePosixHome(env);

  assert.equal(env.HOME, NodeOS.userInfo().homedir);
});

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
