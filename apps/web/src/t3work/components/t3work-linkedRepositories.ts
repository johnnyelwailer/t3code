import { normalizeRepositoryUrls } from "~/t3work/hooks/t3work-createProjectBootstrap";

export function splitRepositoryInput(input: string): ReadonlyArray<string> {
  return normalizeRepositoryUrls(input.split(/\r?\n/).map((line) => line.trim()));
}

export function parseRepositoryLabel(url: string): string {
  const trimmed = url.trim();
  const sshMatch = /^git@([^:]+):(.+)$/i.exec(trimmed);
  if (sshMatch) return `${sshMatch[1]}/${(sshMatch[2] ?? "").replace(/\.git$/i, "")}`;
  try {
    const parsed = new URL(trimmed);
    const path = parsed.pathname.replace(/^\/+/, "").replace(/\.git$/i, "");
    return `${parsed.host}/${path}`;
  } catch {
    return trimmed.replace(/\.git$/i, "");
  }
}
