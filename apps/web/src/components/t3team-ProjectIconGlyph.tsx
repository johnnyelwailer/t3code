import type { ProjectIconOverride } from "@t3tools/contracts";
import { FolderCodeIcon } from "lucide-react";
import type { IconName } from "lucide-react/dynamic";
import { lazy, Suspense } from "react";
import { projectIconColorClassName } from "../projectIconColors";
import { ProjectMonogram } from "./ProjectMonogram";
import { cn } from "~/lib/utils";

const DynamicIcon = lazy(() =>
  import("lucide-react/dynamic").then((module) => ({ default: module.DynamicIcon })),
);

function DynamicProjectIconFallback() {
  return <FolderCodeIcon className="size-full text-inherit" />;
}

export function ProjectIconGlyph(input: {
  icon: ProjectIconOverride;
  className?: string | undefined;
}) {
  const { icon, className } = input;
  if (icon.kind === "monogram") {
    return <ProjectMonogram text={icon.text} color={icon.color} className={className} />;
  }
  if (icon.kind === "emoji") {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex size-3.5 shrink-0 items-center justify-center leading-none [container-type:size]",
          className,
        )}
      >
        <span className="text-[length:80cqh] leading-none">{icon.emoji}</span>
      </span>
    );
  }
  const colorClassName = projectIconColorClassName(icon.color);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-3.5 shrink-0 items-center justify-center",
        colorClassName,
        className,
      )}
    >
      <Suspense fallback={<DynamicProjectIconFallback />}>
        <DynamicIcon
          name={icon.name as IconName}
          className={cn("size-full", colorClassName)}
          fallback={DynamicProjectIconFallback}
        />
      </Suspense>
    </span>
  );
}
