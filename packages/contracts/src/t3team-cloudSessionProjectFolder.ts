/**
 * The folder a plain cloud session starts in for a project with no remote: the session server
 * creates it under its projects root and registers it as its project. The server names it when it
 * dispatches the session; clients use the same rule to recognise that project as this one's.
 *
 * One path segment of `[A-Za-z0-9 ._-]`, starting with a letter or digit, at most 64 characters
 * (the session workflow refuses anything else). Keeps the title readable ("IES NG" stays "IES NG");
 * a title with nothing usable falls back to "project".
 */
const FOLDER_LIMIT = 64;

export function plainProjectFolderName(title: string): string {
  const cleaned = title
    .replace(/[^A-Za-z0-9 ._-]+/g, "-")
    .replace(/^[^A-Za-z0-9]+/, "")
    .slice(0, FOLDER_LIMIT)
    .trimEnd();
  return cleaned.length > 0 ? cleaned : "project";
}
