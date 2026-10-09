/**
 * The viewer's open pull requests, narrowed to one project: the ones whose title names an issue in
 * one of the project's Jira keys. The host-wide search itself lives in
 * `t3team-myworkViewerPrLoader.ts`; the digest reads it through its PR cache
 * (`t3team-myworkDigestPrCache.ts`): one read serves every project.
 */

import type { T3TeamDigestProjectSource } from "./t3team-myworkDigestTypes.ts";

type DigestPrEntry = T3TeamDigestProjectSource["prEntries"][number];

const KEY_IN_TITLE = /(?:^|[^A-Za-z0-9])([A-Z][A-Z0-9]+)-\d+/g;

/**
 * This project's share of the viewer's PRs: the ones whose title names an issue in one of the
 * project's Jira keys (`IES-…`), whoever's ticket it is — a colleague's ticket up for review
 * belongs here as much as the viewer's own. PRs the project's repository listing already carries
 * stay as that listing has them (it knows the head branch and checks).
 */
export function viewerPrsForProject(input: {
  readonly viewerEntries: ReadonlyArray<DigestPrEntry>;
  readonly projectEntries: ReadonlyArray<DigestPrEntry>;
  readonly ticketDisplayIds: ReadonlyArray<string | undefined>;
}): DigestPrEntry[] {
  const prefixes = new Set(
    input.ticketDisplayIds.flatMap((id) => {
      const prefix = id?.match(/^([A-Z][A-Z0-9]+)-\d+$/i)?.[1];
      return prefix ? [prefix.toUpperCase()] : [];
    }),
  );
  const listed = new Set(input.projectEntries.map((e) => `${e.host}:${e.repository}#${e.number}`));
  const own = input.projectEntries.map((entry) => {
    const viewer = input.viewerEntries.find(
      (v) =>
        v.host === entry.host && v.repository === entry.repository && v.number === entry.number,
    );
    return viewer?.viewerAuthored ? { ...entry, viewerAuthored: true } : entry;
  });
  const extra = input.viewerEntries.filter(
    (entry) =>
      !listed.has(`${entry.host}:${entry.repository}#${entry.number}`) &&
      [...entry.title.toUpperCase().matchAll(KEY_IN_TITLE)].some((m) => prefixes.has(m[1]!)),
  );
  return [...own, ...extra];
}
