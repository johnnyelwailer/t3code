import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";

import { buildRouteSearch } from "~/t3team/t3team-buildRouteSearch";
import { parseT3TeamRouteSearch, T3TEAM_CREATE_PATH } from "~/t3team/t3team-routeState";
import {
  createProjectSearchFor,
  type CreateProjectEntryRef,
} from "~/t3team/t3team-createProjectRouteState";
import {
  readHistoryIndex,
  resolveBackToChooseDelta,
  resolveCloseDelta,
  resolveCreateOriginIndex,
} from "./t3team-createProjectNavigation.logic";

/**
 * Navigation for the create-project dialog. The dialog is a route, so every move is a history
 * move: choosing a project pushes, closing returns to where the user came from, and nothing the
 * user already dismissed can be reached with Back.
 */
export function useCreateProjectNavigation(selectedProjectKey: string | undefined) {
  const router = useRouter();
  const navigate = useNavigate();
  const readIndex = useCallback(
    () => readHistoryIndex(router.history.location.state?.__TSR_index),
    [router],
  );
  const [originIndex] = useState(() => resolveCreateOriginIndex(readIndex()));
  // Where the "choose" screen lives in history, so "Change project" can step back to it.
  const chooseIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (selectedProjectKey === undefined) chooseIndexRef.current = readIndex();
  }, [readIndex, selectedProjectKey]);

  const close = useCallback(() => {
    const delta = resolveCloseDelta({ originIndex, currentIndex: readIndex() });
    if (delta !== null) {
      router.history.go(delta);
      return;
    }
    void navigate({ to: "/t3team", search: {}, replace: true });
  }, [navigate, originIndex, readIndex, router]);

  const chooseProject = useCallback(
    (entry: CreateProjectEntryRef) => {
      void navigate({ to: T3TEAM_CREATE_PATH, search: createProjectSearchFor(entry) });
    },
    [navigate],
  );

  const backToChoose = useCallback(() => {
    const delta = resolveBackToChooseDelta({
      chooseIndex: chooseIndexRef.current,
      currentIndex: readIndex(),
    });
    if (delta !== null) {
      router.history.go(delta);
      return;
    }
    void navigate({ to: T3TEAM_CREATE_PATH, search: {}, replace: true });
  }, [navigate, readIndex, router]);

  const openProject = useCallback(
    (projectId: string) => {
      void navigate({
        to: "/t3team/projects/$projectId",
        params: { projectId },
        search: (previous) => buildRouteSearch(parseT3TeamRouteSearch(previous)),
        replace: true,
      });
    },
    [navigate],
  );

  /**
   * Steps back out of the dialog's own history entries, then runs `run` once the location has
   * settled. A finished create uses it so the entries the dialog pushed are not left behind to be
   * reached with Back: `run` then replaces the first of them (the project list) instead of the
   * last.
   */
  const leaveThen = useCallback(
    (run: () => void) => {
      const delta = resolveBackToChooseDelta({
        chooseIndex: chooseIndexRef.current,
        currentIndex: readIndex(),
      });
      if (delta === null) {
        run();
        return;
      }
      const unsubscribe = router.history.subscribe(() => {
        unsubscribe();
        run();
      });
      router.history.go(delta);
    },
    [readIndex, router],
  );

  return { close, chooseProject, backToChoose, openProject, leaveThen };
}
