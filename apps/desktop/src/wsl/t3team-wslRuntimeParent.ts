/**
 * WSL runtime cache parent path. An isolated instance uses a private directory
 * under `$HOME`; every other install keeps the shared `~/.t3` cache.
 */

/** WSL cache directory expression used by a non-isolated install. */
export const DEFAULT_WSL_RUNTIME_PARENT = "$HOME/.t3/wsl-runtime";

export function wslRuntimeParentExpression(
  userDataDirName: string | undefined,
  isolated: boolean,
): string {
  if (isolated && userDataDirName?.trim()) {
    const slug = userDataDirName.trim().replace(/[^A-Za-z0-9._-]/g, "_");
    return `$HOME/.${slug}/wsl-runtime`;
  }
  return DEFAULT_WSL_RUNTIME_PARENT;
}
