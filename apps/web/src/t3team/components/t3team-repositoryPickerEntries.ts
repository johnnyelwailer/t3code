import type { GitHubRepositoryCandidate } from "~/t3team/backend/t3team-githubBackendTypes";
import { parseRepositoryLabel } from "~/t3team/components/t3team-linkedRepositories";
import type { RepositoryPickerEntry } from "~/t3team/components/t3team-RepositoryPickerRow";

/** A repository only known by its URL (linked or suggested but not in the catalog). */
export function entryFromUrl(url: string): RepositoryPickerEntry {
  const label = parseRepositoryLabel(url);
  const slash = label.indexOf("/");
  return { url, host: slash < 0 ? label : label.slice(0, slash), name: label.slice(slash + 1) };
}

/**
 * Every repository the picker can show, by URL: the catalog (newest first), then anything linked
 * or suggested that the catalog does not have.
 */
export function buildRepositoryPickerEntries(
  catalog: ReadonlyArray<GitHubRepositoryCandidate>,
  linkedUrls: ReadonlyArray<string>,
  suggestedUrls: ReadonlyArray<string>,
): Map<string, RepositoryPickerEntry> {
  const byUrl = new Map<string, RepositoryPickerEntry>();
  const newestFirst = [...catalog].sort((a, b) =>
    (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
  );
  for (const repo of newestFirst) {
    byUrl.set(repo.url, {
      url: repo.url,
      name: repo.nameWithOwner,
      host: repo.host,
      ...(repo.description ? { description: repo.description } : {}),
      ...(repo.isPrivate !== undefined ? { isPrivate: repo.isPrivate } : {}),
    });
  }
  for (const url of [...linkedUrls, ...suggestedUrls]) {
    if (!byUrl.has(url)) byUrl.set(url, entryFromUrl(url));
  }
  return byUrl;
}
