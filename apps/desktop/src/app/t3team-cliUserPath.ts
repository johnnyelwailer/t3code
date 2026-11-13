/**
 * macOS (and Linux) user-PATH helpers for the `nexi` CLI shim. When the
 * symlink lands in `~/.local/bin` — which is often not on a Mac's default
 * PATH — we append a marked, removable snippet to the user's login shells.
 * Uninstall strips only that snippet. We never write or remove a `t3` line.
 */

export const NEXI_CLI_PATH_SNIPPET_BEGIN = "# nexi-work-cli-path:begin";
export const NEXI_CLI_PATH_SNIPPET_END = "# nexi-work-cli-path:end";

export function unixDirOnPath(
  directory: string,
  pathEnv: string | undefined,
  separator = ":",
): boolean {
  return (pathEnv ?? "")
    .split(separator)
    .filter((entry) => entry.length > 0)
    .includes(directory);
}

/** Login-shell profiles, in the order we update them. Terminal.app is a login shell. */
export function userShellProfilePaths(home: string): readonly string[] {
  return [`${home}/.zprofile`, `${home}/.bash_profile`, `${home}/.profile`];
}

export function renderUnixPathSnippet(directory: string): string {
  const escaped = directory.replaceAll("'", "'\\''");
  return [
    NEXI_CLI_PATH_SNIPPET_BEGIN,
    "# Written by Nexi Work so `nexi` is on PATH in new terminals. Remove with the app.",
    `nexi_cli_bin='${escaped}'`,
    'case ":$PATH:" in',
    '  *:"$nexi_cli_bin":*) ;;',
    '  *) export PATH="$nexi_cli_bin:$PATH" ;;',
    "esac",
    "unset nexi_cli_bin",
    NEXI_CLI_PATH_SNIPPET_END,
  ].join("\n");
}

const SNIPPET_BLOCK =
  /(^|\n)[ \t]*# nexi-work-cli-path:begin\n[\s\S]*?\n[ \t]*# nexi-work-cli-path:end\n?/;

export function removeUnixPathSnippet(profileText: string): {
  readonly text: string;
  readonly changed: boolean;
} {
  const text = profileText.replace(SNIPPET_BLOCK, (match, prefix: string) =>
    prefix === "\n" ? "\n" : "",
  );
  const trimmed = text.replace(/\n{3,}$/u, "\n\n");
  return { text: trimmed, changed: trimmed !== profileText };
}

export function ensureUnixPathSnippet(
  profileText: string,
  directory: string,
): { readonly text: string; readonly changed: boolean } {
  const snippet = renderUnixPathSnippet(directory);
  if (profileText.includes(snippet)) {
    return { text: profileText, changed: false };
  }
  const without = removeUnixPathSnippet(profileText);
  const body = without.text.replace(/\s+$/u, "");
  const text = `${body}${body.length > 0 ? "\n\n" : ""}${snippet}\n`;
  return { text, changed: text !== profileText };
}
