/**
 * Path rules for `t3team.change_request.publish` that are stricter than
 * `WorkspacePaths.resolveRelativePathWithinRoot`, which still runs afterwards for absolute and
 * outside-the-root paths. The caller names the exact files to publish: a `..` segment is refused
 * even when it would resolve back inside the repository, and nothing under `.git` is stageable.
 *
 * @module t3team-changeRequestPaths
 */

/** Why the path list is refused, or `undefined` when every entry may go on to root resolution. */
export function changeRequestPathsProblem(paths: ReadonlyArray<string>): string | undefined {
  if (paths.length === 0) return "list at least one repository-relative path to publish.";
  for (const raw of paths) {
    if (raw.trim().length === 0) return "a path is empty.";
    const segments = raw.replaceAll("\\", "/").split("/");
    if (segments.includes("..")) {
      return `'${raw}' contains '..'; paths must stay inside the repository.`;
    }
    if (segments.find((segment) => segment.length > 0 && segment !== ".") === ".git") {
      return `'${raw}' is inside .git.`;
    }
  }
  return undefined;
}
