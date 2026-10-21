import type { ProjectIconOverride } from "@t3tools/contracts";
import { FolderCodeIcon } from "lucide-react";
import { createElement, lazy, Suspense } from "react";
import { projectIconColorClassName } from "../projectIconColors";
import { ProjectMonogram } from "./ProjectMonogram";
import { cn } from "~/lib/utils";

// All lucide icons load as one chunk, only once a project uses a lucide override.
const LucideProjectIcon = lazy(() =>
  import("../lib/lucideIconByName").then(({ lucideIconByName }) => ({
    default: function LucideProjectIcon(props: { name: string; className: string }) {
      return createElement(lucideIconByName(props.name) ?? FolderCodeIcon, {
        className: props.className,
      });
    },
  })),
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
        <LucideProjectIcon name={icon.name} className={cn("size-full", colorClassName)} />
      </Suspense>
    </span>
  );
}
