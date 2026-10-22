import type { EnvironmentProject } from "./models.ts";

/**
 * Cross-machine identity of a project bound to an external work source (a Jira project, a Linear
 * team, ...).
 *
 * A t3team project lives in its own folder per machine (`~/.t3code/t3team/projects/<name>`), which
 * usually has no git remote, so the repository key cannot match it across environments: a Mac and a
 * desktop connected through T3 Connect each listed their own copy. And when a project's workspace is
 * its main repository's checkout, the repository key merged it into whatever plain project shared
 * that repository, hiding the work project under the other project's name.
 *
 * The binding names the real project: the provider, the account (for Atlassian the site's cloud id)
 * and the external project id are the same on every machine. Two projects with the same binding are
 * one project; a bound project never merges with an unbound one through its repository.
 */
export function deriveWorkSourceProjectKey(
  project: Pick<EnvironmentProject, "source">,
): string | null {
  const source = project.source;
  if (!source || source.provider === "local") return null;
  const accountId = source.accountId.trim();
  const externalProjectId = source.externalProjectId.trim();
  if (!accountId || !externalProjectId) return null;
  return `t3team-work-source:${source.provider}:${accountId}:${externalProjectId}`;
}
