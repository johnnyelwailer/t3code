import type { ProjectShellProject } from "@t3tools/project-context";

export function ProjectIcon({ project }: { project: ProjectShellProject }) {
  const color =
    (project.source.raw as { avatarColor?: string } | undefined)?.avatarColor ?? "#1868db";
  const key = project.source.externalProjectKey ?? project.title;
  const shortKey = key.slice(0, 2).toUpperCase();
  return (
    <div
      className="flex size-6 shrink-0 items-center justify-center rounded-md"
      style={{ background: color }}
    >
      <span className="text-[10px] font-semibold text-white">{shortKey}</span>
    </div>
  );
}
