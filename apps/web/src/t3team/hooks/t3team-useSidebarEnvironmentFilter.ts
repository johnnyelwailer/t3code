import {
  narrowEnvironmentIds,
  narrowGroupsToEnvironment,
  narrowScopeKeysToEnvironment,
  projectScopeKeysInEnvironment,
  sidebarEnvironmentFilter,
  sidebarEnvironmentFilterCandidates,
} from "~/components/sidebar/t3team-sidebarEnvironmentFilter.logic";
import { useEnvironmentIdentities, usePrimaryEnvironmentId } from "~/state/environments";
import { useT3TeamSidebarEnvironmentFilterStore } from "../t3team-sidebarEnvironmentFilterStore";

type Candidates = Parameters<typeof sidebarEnvironmentFilterCandidates>[0];

/**
 * The sidebar's environment filter: the pills (null while there is nothing to choose) and the
 * narrowing the list applies for the selected environment. Reads the catalog itself, so the
 * sidebar passes only what it lists.
 */
export function useT3TeamSidebarEnvironmentFilter(input: {
  readonly threads: Candidates["threads"];
  readonly pickableGroups: Candidates["pickableGroups"];
}) {
  const identities = useEnvironmentIdentities();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const stored = useT3TeamSidebarEnvironmentFilterStore((state) => state.selectedEnvironmentId);
  const select = useT3TeamSidebarEnvironmentFilterStore((state) => state.select);
  const filter = sidebarEnvironmentFilter(
    sidebarEnvironmentFilterCandidates({
      identities,
      primaryEnvironmentId,
      threads: input.threads,
      pickableGroups: input.pickableGroups,
    }),
    stored,
  );
  const selectedId = filter.selectedId;
  return {
    pills: filter.pills,
    selectedEnvironmentId: selectedId,
    select,
    narrowScopeKeys: (
      keys: ReadonlySet<string> | null,
      projects: Parameters<typeof narrowScopeKeysToEnvironment>[2],
    ) => narrowScopeKeysToEnvironment(keys, selectedId, projects),
    narrowGroups: <TGroup extends Parameters<typeof narrowGroupsToEnvironment>[0][number]>(
      groups: ReadonlyArray<TGroup>,
    ) => narrowGroupsToEnvironment(groups, selectedId),
    narrowEnvironmentIds: <TId extends string>(ids: ReadonlyArray<TId>) =>
      narrowEnvironmentIds(ids, selectedId),
    /** The project scope that still makes sense once `environmentId` is picked. */
    projectScopeKeysFor: (
      groups: Parameters<typeof projectScopeKeysInEnvironment>[0],
      keys: readonly string[],
      environmentId: string | null,
    ) => projectScopeKeysInEnvironment(groups, keys, environmentId),
  };
}
