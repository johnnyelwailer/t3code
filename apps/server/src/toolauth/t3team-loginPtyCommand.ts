/** Map resolveSpawnCommand onto node-pty (file, args). Windows uses the absolute .exe (node-pty skips PATHEXT) and wraps .cmd/.bat in cmd.exe. @module toolauth/loginPtyCommand */
import type { ResolvedSpawnCommand } from "@t3tools/shared/shell";

export function ptyCommandForResolved(
  resolved: ResolvedSpawnCommand,
  platform: NodeJS.Platform,
): { readonly shell: string; readonly args: ReadonlyArray<string> } {
  if (!resolved.shell) {
    return { shell: resolved.command, args: resolved.args };
  }
  if (platform === "win32") {
    return { shell: "cmd.exe", args: ["/d", "/s", "/c", resolved.command] };
  }
  return { shell: "/bin/sh", args: ["-c", resolved.command] };
}
