import { Platform } from "react-native";

import type { HomeProjectScope } from "../features/home/homeThreadList";
import { ExtensionBoundary } from "./t3team-ExtensionBoundary";
import { mobileExtensions } from "./t3team-extensions";
import { buildHomeFiltersProps, type HomeFiltersSource } from "./t3team-homeFilters";

/**
 * The distribution's `homeFilters` slot on the Android Chats list, isolated from the stock list;
 * nothing without one, and nothing on iOS, which has its own filter chips.
 */
export function HomeFiltersSlot(props: {
  readonly home: HomeFiltersSource;
  readonly scopes: ReadonlyArray<HomeProjectScope>;
}) {
  const HomeFilters = mobileExtensions.homeFilters;
  if (!HomeFilters || Platform.OS !== "android") return null;
  return (
    <ExtensionBoundary>
      <HomeFilters {...buildHomeFiltersProps(props.home, props.scopes)} />
    </ExtensionBoundary>
  );
}
