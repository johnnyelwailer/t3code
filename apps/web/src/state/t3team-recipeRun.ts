/**
 * Live view of a recipe's workflow run in one project, for the `RunToggle` card and the digest
 * header count. Derived from the same shells and facts as the watched-PR selector.
 */
import { useAtomValue } from "@effect/atom-react";
import { EMPTY_T3TEAM_THREAD_FACTS } from "@t3tools/client-runtime/state/thread-facts";
import type { EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";
import { createContext, useContext } from "react";

import { t3teamThreadFactsAtoms } from "./t3team-threadSideStreams";
import {
  collectRecipeRun,
  EMPTY_RECIPE_RUN,
  type RecipeRunSnapshot,
} from "./t3team-recipeRun.logic";
import { environmentThreadShells } from "./threads";

const ALL_THREADS_INPUT = {};

const recipeRunAtom = Atom.family((key: string) =>
  Atom.make((get): RecipeRunSnapshot => {
    const [environmentId, projectId, recipeId] = key.split("\u0000") as [
      EnvironmentId,
      string,
      string,
    ];
    const shells = get(environmentThreadShells.threadShellsAtom);
    const facts = Option.getOrElse(
      AsyncResult.value(
        get(t3teamThreadFactsAtoms.facts({ environmentId, input: ALL_THREADS_INPUT })),
      ),
      () => EMPTY_T3TEAM_THREAD_FACTS,
    );
    return collectRecipeRun(shells, facts, { environmentId, projectId, recipeId });
  }).pipe(Atom.withLabel(`t3team-recipe-run:${key}`)),
);

const EMPTY_RUN_ATOM = Atom.make(EMPTY_RECIPE_RUN).pipe(Atom.withLabel("t3team-recipe-run:none"));

/** Story and test seam: the snapshot the atom would produce. */
export const T3TeamRecipeRunFixture = createContext<RecipeRunSnapshot | null>(null);

export function useRecipeRun(scope: {
  readonly environmentId: EnvironmentId | null;
  readonly projectId: string | null | undefined;
  readonly recipeId: string;
}): RecipeRunSnapshot {
  const fixture = useContext(T3TeamRecipeRunFixture);
  const live = useAtomValue(
    fixture !== null || scope.environmentId === null || !scope.projectId
      ? EMPTY_RUN_ATOM
      : recipeRunAtom([scope.environmentId, scope.projectId, scope.recipeId].join("\u0000")),
  );
  return fixture ?? live;
}
