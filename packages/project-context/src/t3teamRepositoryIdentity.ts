/**
 * Repository identity across clone-URL spellings: https vs ssh, with or without `.git`, and the
 * `owner/repo` shorthand. Pure; shared by the server (manifest lookups, sync joins) and the web
 * client (matching a linked repository's recorded entry).
 */
function normalizeRepositoryLookupKey(value: string): string {
  const trimmed = value.trim().replace(/\.git$/i, "");
  const sshMatch = /^git@([^:]+):(.+)$/i.exec(trimmed);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2] ?? ""}`.replace(/^\/+/, "").toLowerCase();
  }

  try {
    const parsed = new URL(trimmed);
    return `${parsed.host}${parsed.pathname}`
      .replace(/\.git$/i, "")
      .replace(/^\/+/, "")
      .replace(/\/+/g, "/")
      .toLowerCase();
  } catch {
    return trimmed.replace(/^\/+/, "").replace(/\/+/g, "/").toLowerCase();
  }
}

export function repositoryLookupCandidates(value: string): ReadonlyArray<string> {
  const normalized = normalizeRepositoryLookupKey(value);
  const candidates = new Set<string>([normalized]);
  const firstSlashIndex = normalized.indexOf("/");
  if (firstSlashIndex > 0 && firstSlashIndex < normalized.length - 1) {
    candidates.add(normalized.slice(firstSlashIndex + 1));
  }
  return [...candidates];
}

const HAS_HOST = /^(?:[a-z][a-z0-9+.-]*:\/\/|git@)/i;

/** Two spellings of one repository (https vs ssh, with or without `.git`). When both name a
 * host, hosts must match too: `github.com/a/b` and `gitlab.com/a/b` are different repositories. */
export function isSameRepository(left: string, right: string): boolean {
  if (HAS_HOST.test(left.trim()) && HAS_HOST.test(right.trim())) {
    return repositoryLookupCandidates(left)[0] === repositoryLookupCandidates(right)[0];
  }
  const candidates = new Set(repositoryLookupCandidates(left));
  return repositoryLookupCandidates(right).some((candidate) => candidates.has(candidate));
}
