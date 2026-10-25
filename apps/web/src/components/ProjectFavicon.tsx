import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import {
  getProjectFaviconResourceKey,
  isProjectFaviconFallbackUrl,
} from "@t3tools/shared/projectFavicon";
import { FolderCodeIcon } from "lucide-react";
import type { ComponentType } from "react";
import { useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import { projectFaviconUrlAtom } from "../state/assets";
import { deriveProjectIdentity } from "../projectIdentity";
import { ProjectIconGlyph } from "./t3team-ProjectIconGlyph";
import { ProjectMonogram } from "./ProjectMonogram";
import { cn } from "~/lib/utils";

// Every surface must pass the project record itself (or a snapshot spread from it) so the saved
// title, favicon and icon override travel together; a display label as title changes the automatic icon.
export type ProjectFaviconProject = Pick<
  EnvironmentProject,
  "environmentId" | "workspaceRoot" | "title" | "faviconPath" | "projectIcon"
>;
export function ProjectFavicon(input: {
  project: ProjectFaviconProject;
  className?: string | undefined;
  fallbackIcon?: ComponentType<{ className?: string }>;
}) {
  const { project } = input;
  const src = useAtomValue(
    projectFaviconUrlAtom({
      environmentId: project.environmentId,
      cwd: project.workspaceRoot,
      faviconPath: project.faviconPath,
    }),
  );
  if (project.projectIcon) {
    return <ProjectIconGlyph icon={project.projectIcon} className={input.className} />;
  }
  const FallbackIcon = input.fallbackIcon ?? FolderCodeIcon;

  if (!src || isProjectFaviconFallbackUrl(src)) {
    return (
      <ProjectFaviconFallback
        className={input.className}
        icon={FallbackIcon}
        projectName={project.title}
      />
    );
  }

  const cacheKey = getProjectFaviconResourceKey(
    project.environmentId,
    project.workspaceRoot,
    project.faviconPath,
  );

  return (
    <ProjectFaviconImage
      key={cacheKey}
      src={src}
      className={input.className}
      fallbackIcon={FallbackIcon}
      fallbackProjectName={project.title}
    />
  );
}

function ProjectFaviconFallback({
  className,
  icon: Icon,
  projectName,
}: {
  readonly className?: string | undefined;
  readonly icon: ComponentType<{ className?: string }>;
  readonly projectName?: string | undefined;
}) {
  if (projectName && projectName.trim().length > 0) {
    const identity = deriveProjectIdentity(projectName);
    return (
      <ProjectMonogram text={identity.monogram} color={identity.color} className={className} />
    );
  }

  return <Icon className={cn("size-3.5 shrink-0 text-icon-muted", className)} />;
}

function ProjectFaviconImage({
  src,
  className,
  fallbackIcon: FallbackIcon,
  fallbackProjectName,
}: {
  readonly src: string;
  readonly className?: string | undefined;
  readonly fallbackIcon: ComponentType<{ className?: string }>;
  readonly fallbackProjectName?: string | undefined;
}) {
  const [displayedSrc, setDisplayedSrc] = useState<string | null>(() =>
    src.startsWith("data:image/") ? src : null,
  );
  const isLoading = displayedSrc !== src;
  const handleLoadError = (failedSrc: string) => {
    setDisplayedSrc((currentSrc) => (currentSrc === failedSrc ? null : currentSrc));
  };

  return (
    <>
      {displayedSrc === null ? (
        <ProjectFaviconFallback
          className={className}
          icon={FallbackIcon}
          projectName={fallbackProjectName}
        />
      ) : null}
      {displayedSrc ? (
        <img
          src={displayedSrc}
          alt=""
          className={cn("size-3.5 shrink-0 rounded-[25%] object-contain", className)}
          onError={() => handleLoadError(displayedSrc)}
        />
      ) : null}
      {isLoading ? (
        <img
          src={src}
          alt=""
          className="hidden"
          onLoad={() => {
            setDisplayedSrc(src);
          }}
          onError={() => handleLoadError(src)}
        />
      ) : null}
    </>
  );
}
