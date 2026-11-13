import { assert, describe, it } from "@effect/vitest";

import { unixCandidates } from "./DesktopCliCommand.ts";
import {
  NEXI_CLI_PATH_SNIPPET_BEGIN,
  NEXI_CLI_PATH_SNIPPET_END,
  ensureUnixPathSnippet,
  removeUnixPathSnippet,
  renderUnixPathSnippet,
  unixDirOnPath,
  userShellProfilePaths,
} from "./t3team-cliUserPath.ts";

describe("unixDirOnPath", () => {
  it("matches a PATH entry exactly, and treats a missing PATH as empty", () => {
    assert.isTrue(unixDirOnPath("/Users/p/.local/bin", "/usr/bin:/Users/p/.local/bin:/bin"));
    assert.isFalse(unixDirOnPath("/Users/p/.local/bin", "/usr/bin:/bin"));
    assert.isFalse(unixDirOnPath("/Users/p/.local/bin", undefined));
    assert.isFalse(unixDirOnPath("/Users/p/.local/bin", ""));
  });
});

describe("userShellProfilePaths", () => {
  it("covers zsh, bash, and POSIX login profiles", () => {
    assert.deepEqual(userShellProfilePaths("/Users/p"), [
      "/Users/p/.zprofile",
      "/Users/p/.bash_profile",
      "/Users/p/.profile",
    ]);
  });
});

describe("ensureUnixPathSnippet / removeUnixPathSnippet", () => {
  it("is idempotent, replaces a previous snippet, and leaves other lines (including t3) alone", () => {
    const dir = "/Users/p/.local/bin";
    const existing = "export EDITOR=vim\n# a t3 comment\nexport PATH=\"$HOME/bin:$PATH\"\n";
    const first = ensureUnixPathSnippet(existing, dir);
    assert.isTrue(first.changed);
    assert.include(first.text, "export EDITOR=vim");
    assert.include(first.text, "# a t3 comment");
    assert.include(first.text, NEXI_CLI_PATH_SNIPPET_BEGIN);
    assert.include(first.text, NEXI_CLI_PATH_SNIPPET_END);
    assert.include(first.text, dir);
    assert.include(first.text, "nexi");
    const second = ensureUnixPathSnippet(first.text, dir);
    assert.isFalse(second.changed);
    assert.equal(second.text, first.text);

    const moved = ensureUnixPathSnippet(first.text, "/Users/p/bin");
    assert.isTrue(moved.changed);
    assert.include(moved.text, "/Users/p/bin");
    assert.notInclude(moved.text, `'${dir}'`);
    assert.include(moved.text, "# a t3 comment");

    const removed = removeUnixPathSnippet(moved.text);
    assert.isTrue(removed.changed);
    assert.notInclude(removed.text, NEXI_CLI_PATH_SNIPPET_BEGIN);
    assert.include(removed.text, "export EDITOR=vim");
    assert.include(removed.text, "# a t3 comment");
    assert.isFalse(removeUnixPathSnippet(removed.text).changed);
  });

  it("renders a case-based PATH prepend that does not mention t3", () => {
    const snippet = renderUnixPathSnippet("/opt/homebrew/bin");
    assert.include(snippet, "export PATH=");
    assert.notInclude(snippet, "t3");
    assert.include(snippet, "nexi");
  });
});

describe("unixCandidates on macOS", () => {
  it("prefers Homebrew and /usr/local, then falls back to ~/.local/bin, and never mentions t3", () => {
    assert.deepEqual(unixCandidates("/Users/p", "darwin"), [
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/Users/p/.local/bin",
      "/Users/p/bin",
    ]);
  });
});
