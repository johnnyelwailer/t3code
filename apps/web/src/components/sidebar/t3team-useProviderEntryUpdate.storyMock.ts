import { STORY_PROVIDER_MACHINES } from "~/t3team/stories/t3team-updateRowActions.storyFixtures";

/**
 * Storybook-only stand-in for `t3team-useProviderEntryUpdate`: stories have no live environments,
 * so the provider updates on offer per machine come from fixtures. Wired up in
 * t3team-storybook-main.ts (alias on the exact module specifier).
 */
// oxlint-disable-next-line t3code/no-hookless-use-function -- stands in for the real hook under its exact name
export function useProviderEntryUpdate() {
  return { machines: STORY_PROVIDER_MACHINES, update: async () => undefined };
}
