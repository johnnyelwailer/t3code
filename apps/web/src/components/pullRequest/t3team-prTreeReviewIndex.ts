import type { DiffExplorerFile } from "./t3team-prDiffExplorer.logic";

/** Index each file and its ancestor folders once, rather than rescanning every file per row. */
export function prTreeReviewIndex(files: readonly DiffExplorerFile[]) {
  const byPath = new Map<string, DiffExplorerFile>();
  const directories = new Map<string, readonly DiffExplorerFile[]>();
  const building = new Map<string, DiffExplorerFile[]>();
  for (const file of files) {
    byPath.set(file.path, file);
    let directory = "";
    for (const segment of file.path.split("/").slice(0, -1)) {
      directory += `${segment}/`;
      const children = building.get(directory);
      if (children) children.push(file);
      else building.set(directory, [file]);
    }
  }
  for (const [path, children] of building) directories.set(path, children);
  return { byPath, directories };
}
