import type { T3TeamRouteSearch } from "~/t3team/t3team-routeState";

/**
 * The search params that travel with an in-app navigation: everything the current location has,
 * minus what belongs only to the location being left (an embedded thread, the setup welcome flag,
 * the add-project dialog's chosen project).
 */
export function buildRouteSearch(
  search: T3TeamRouteSearch,
  input: {
    projectView?: T3TeamRouteSearch["projectView"];
    chatThreadId?: string | null;
  } = {},
): T3TeamRouteSearch {
  const {
    chatThreadId: _ignoredChatThreadId,
    setup: _ignoredSetup,
    project: _ignoredCreateProject,
    ...rest
  } = search;
  const projectView = input.projectView ?? search.projectView;

  return {
    ...rest,
    ...(projectView ? { projectView } : {}),
    ...(input.chatThreadId ? { chatThreadId: input.chatThreadId } : {}),
  };
}
