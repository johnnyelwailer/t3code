import { describe, expect, it, vi } from "vite-plus/test";

import { readEnvironmentFromLoginShell, resolveKnownPosixCliDirs } from "./shell.ts";

describe("readEnvironmentFromLoginShell fast path", () => {
  type Probe = (
    file: string,
    args: ReadonlyArray<string>,
    options: { encoding: "utf8"; timeout: number },
  ) => string;
  const probe = (implementation: Probe) => vi.fn<Probe>(implementation);

  it("probes with a non-interactive login shell first", () => {
    const execFile = probe(() => "__T3CODE_ENV_PATH_START__\n/a:/b\n__T3CODE_ENV_PATH_END__\n");

    expect(readEnvironmentFromLoginShell("/opt/homebrew/bin/fish", ["PATH"], execFile).PATH).toBe(
      "/a:/b",
    );
    expect(execFile).toHaveBeenCalledTimes(1);
    expect(execFile.mock.calls[0]?.[1]?.[0]).toBe("-lc");
  });

  it("falls back to an interactive login shell when PATH only lives in rc files", () => {
    const execFile = probe((_file, args) =>
      args[0] === "-lc"
        ? "__T3CODE_ENV_PATH_START__\n__T3CODE_ENV_PATH_END__"
        : "__T3CODE_ENV_PATH_START__\n/rc-only/bin\n__T3CODE_ENV_PATH_END__",
    );

    expect(readEnvironmentFromLoginShell("/bin/zsh", ["PATH"], execFile)).toEqual({
      PATH: "/rc-only/bin",
    });
    expect(execFile).toHaveBeenCalledTimes(2);
    expect(execFile.mock.calls[0]?.[1]?.[0]).toBe("-lc");
    expect(execFile.mock.calls[1]?.[1]?.[0]).toBe("-ilc");
  });

  it("falls back to an interactive login shell when the fast form throws", () => {
    const execFile = probe((_file, args) => {
      if (args[0] === "-lc") throw new Error("spawnSync /bin/zsh ETIMEDOUT");
      return "__T3CODE_ENV_PATH_START__\n/slow/bin\n__T3CODE_ENV_PATH_END__";
    });

    expect(readEnvironmentFromLoginShell("/bin/zsh", ["PATH"], execFile)).toEqual({
      PATH: "/slow/bin",
    });
    expect(execFile.mock.calls[1]?.[1]?.[0]).toBe("-ilc");
  });
});

describe("resolveKnownPosixCliDirs", () => {
  it("returns standard per-user CLI install directories", () => {
    expect(resolveKnownPosixCliDirs({ HOME: "/Users/test" })).toEqual([
      "/Users/test/.local/bin",
      "/Users/test/bin",
      "/Users/test/.bun/bin",
      "/Users/test/.npm-global/bin",
      "/Users/test/.cargo/bin",
      "/Users/test/.asdf/shims",
      "/Users/test/.deno/bin",
      "/Users/test/.dotnet/tools",
    ]);
  });

  it("uses configured tool homes", () => {
    expect(
      resolveKnownPosixCliDirs({
        HOME: "/Users/test",
        BUN_INSTALL: "/opt/bun",
        NPM_CONFIG_PREFIX: "/opt/npm",
        CARGO_HOME: "/opt/cargo",
        PNPM_HOME: "/opt/pnpm",
        VOLTA_HOME: "/opt/volta",
        ASDF_DATA_DIR: "/opt/asdf",
        DENO_INSTALL: "/opt/deno",
      }),
    ).toContain("/opt/bun/bin");
    expect(resolveKnownPosixCliDirs({ HOME: "/Users/test", CARGO_HOME: "/opt/cargo" })).toContain(
      "/opt/cargo/bin",
    );
  });

  it("rejects relative homes and keeps absolute homes without HOME", () => {
    expect(resolveKnownPosixCliDirs({ HOME: ".", BUN_INSTALL: "tools" })).toEqual([]);
    expect(resolveKnownPosixCliDirs({ BUN_INSTALL: "/opt/bun" })).toContain("/opt/bun/bin");
  });

  it("normalizes root directory homes", () => {
    expect(resolveKnownPosixCliDirs({ HOME: "/" })[0]).toBe("/.local/bin");
    expect(resolveKnownPosixCliDirs({ BUN_INSTALL: "/" })).toContain("/bin");
  });

  it("returns no directories when HOME is unavailable", () => {
    expect(resolveKnownPosixCliDirs({})).toEqual([]);
  });
});
