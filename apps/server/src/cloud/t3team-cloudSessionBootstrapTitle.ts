import { plainProjectTitleFromFolder } from "@t3tools/contracts";

interface PathOps {
  readonly basename: (path: string) => string;
  readonly dirname: (path: string) => string;
  readonly resolve: (...segments: string[]) => string;
}

/**
 * The title a server gives the project it bootstraps from its working directory
 * (`--auto-bootstrap-project-from-cwd`): the repository's name; else, for a plain cloud session's
 * folder under the projects root (`plainProjectFolderName`: `<title>-<8 hex>`), the title it was
 * made from, without the id suffix; else the folder's own name.
 */
export function bootstrapProjectTitle(input: {
  readonly repositoryName: string | undefined;
  readonly cwd: string;
  readonly baseDir: string;
  readonly path: PathOps;
}): string {
  const { path } = input;
  const folder = path.basename(input.cwd);
  const inProjectsRoot =
    path.resolve(path.dirname(input.cwd)) === path.resolve(input.baseDir, "projects");
  const plainTitle = inProjectsRoot ? plainProjectTitleFromFolder(folder) : null;
  return input.repositoryName || plainTitle || folder || "project";
}
