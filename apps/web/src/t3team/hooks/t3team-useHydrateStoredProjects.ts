import { useEffect, useRef } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";
import { ensureStoredProjectsHydrated } from "./t3team-projectStorePersistence";

type StoredProjectSinks = {
  setStoredProjects: React.Dispatch<React.SetStateAction<ProjectShellProject[]>>;
  setSelectedProjectId: React.Dispatch<React.SetStateAction<string | null>>;
  setExpandedProjectIds: React.Dispatch<React.SetStateAction<Set<string>>>;
};

/**
 * Applies the page's one stored-project hydration to the project store, ONCE per mount.
 *
 * The effect deliberately has NO dependencies. `useProjectStore` builds a fresh `input` literal on
 * every render and re-renders on every live snapshot during startup, so depending on `input`
 * cancelled the in-flight hydration on each of those renders: the store could sit on the partial
 * localStorage list for the whole session, which is why My Work showed an empty digest until a
 * remount read the list hydration had meanwhile written back to localStorage.
 *
 * The sinks are `useState` setters and so stable by construction; the ref only keeps that true if
 * a caller ever passes something else.
 */
export function useHydrateStoredProjects(input: StoredProjectSinks) {
  const sinks = useRef(input);
  useEffect(() => {
    sinks.current = input;
  });

  useEffect(() => {
    let cancelled = false;

    void ensureStoredProjectsHydrated().then((projects) => {
      if (cancelled) return;
      const { setStoredProjects, setSelectedProjectId, setExpandedProjectIds } = sinks.current;
      setStoredProjects([...projects]);
      setSelectedProjectId((current) =>
        current && projects.some((project) => project.id === current)
          ? current
          : (projects[0]?.id ?? null),
      );
      setExpandedProjectIds(new Set(projects.map((project) => project.id)));
    });

    return () => {
      cancelled = true;
    };
  }, []);
}
