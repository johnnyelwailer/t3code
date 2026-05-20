import { useEffect } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";
import { hydrateStoredProjects } from "./t3work-projectStorePersistence";

export function useHydrateStoredProjects(input: {
  setStoredProjects: React.Dispatch<React.SetStateAction<ProjectShellProject[]>>;
  setSelectedProjectId: React.Dispatch<React.SetStateAction<string | null>>;
  setExpandedProjectIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  useEffect(() => {
    let cancelled = false;

    void hydrateStoredProjects().then((projects) => {
      if (cancelled) return;
      input.setStoredProjects(projects);
      input.setSelectedProjectId((current) =>
        current && projects.some((project) => project.id === current)
          ? current
          : (projects[0]?.id ?? null),
      );
      input.setExpandedProjectIds(new Set(projects.map((project) => project.id)));
    });

    return () => {
      cancelled = true;
    };
  }, [input]);
}
