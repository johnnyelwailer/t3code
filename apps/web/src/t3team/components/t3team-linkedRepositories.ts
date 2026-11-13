import { normalizeRepositoryUrls } from "~/t3team/hooks/t3team-createProjectBootstrap";

export function splitRepositoryInput(input: string): ReadonlyArray<string> {
  return normalizeRepositoryUrls(input.split(/\r?\n/).map((line) => line.trim()));
}

/**
 * Host and `owner/repo` path of a git remote URL. The path is the display label
 * (no host, no trailing `.git`).
 */
export function parseRepositoryParts(url: string): {
  readonly host: string;
  readonly name: string;
} {
  const trimmed = url.trim();
  const sshMatch = /^git@([^:]+):(.+)$/i.exec(trimmed);
  if (sshMatch) {
    return { host: sshMatch[1] ?? "", name: (sshMatch[2] ?? "").replace(/\.git$/i, "") };
  }
  try {
    const parsed = new URL(trimmed);
    return {
      host: parsed.host,
      name: parsed.pathname.replace(/^\/+/, "").replace(/\.git$/i, ""),
    };
  } catch {
    const bare = trimmed.replace(/\.git$/i, "");
    const slash = bare.indexOf("/");
    return slash < 0
      ? { host: "", name: bare }
      : { host: bare.slice(0, slash), name: bare.slice(slash + 1) };
  }
}

/** Display label for a repository: `owner/repo`, not `host/owner/repo`. */
export function parseRepositoryLabel(url: string): string {
  return parseRepositoryParts(url).name;
}
