/**
 * The folder a plain cloud session starts in for a project with no remote: the session server
 * creates it under its projects root and registers it as its project. The server names it when it
 * dispatches the session; clients use the same rule to recognise that project as this one's.
 *
 * `<title>-<8 hex of the project id>`: readable ("IES NG-1a2b3c4d"), unique per project even when
 * two titles clean up to the same text, and stable across sessions so the workspace's snapshot
 * brings the same folder back. One path segment of `[A-Za-z0-9 ._-]`, starting with a letter or
 * digit, at most 64 characters (the session workflow refuses anything else).
 */
const FOLDER_LIMIT = 64;
const SUFFIX_LENGTH = 9; // "-" + 8 hex digits

/** FNV-1a, as 8 hex digits. */
const shortHash = (value: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

export function plainProjectFolderName(title: string, projectId: string): string {
  const cleaned = title
    .replace(/[^A-Za-z0-9 ._-]+/g, "-")
    // The workflow refuses ".." anywhere in the name.
    .replace(/\.{2,}/g, ".")
    .replace(/^[^A-Za-z0-9]+/, "")
    .slice(0, FOLDER_LIMIT - SUFFIX_LENGTH)
    .trimEnd();
  return `${cleaned.length > 0 ? cleaned : "project"}-${shortHash(projectId)}`;
}
