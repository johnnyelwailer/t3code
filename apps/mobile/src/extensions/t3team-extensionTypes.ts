import type { ComponentType } from "react";
import type { PlatformOSType } from "react-native";

/**
 * Extension seams for the mobile app. A distribution fills the slots it wants to change; every
 * slot is optional and absent means stock behavior, so a build without an overlay is unchanged.
 * Slots are added one at a time, each next to the screen that reads it.
 */

export interface HomeEmptyStateProps {
  /** Opens the stock "add connection" flow, for an extension that offers other ways to connect. */
  readonly onAddConnection: () => void;
}

export interface HomeEmptyStateSlot {
  /** True when the extension should replace the stock empty home (no threads yet). */
  readonly shouldRender: (
    catalog: {
      readonly isLoadingConnections: boolean;
      readonly hasConnections: boolean;
    },
    platform: PlatformOSType,
  ) => boolean;
  readonly Component: ComponentType<HomeEmptyStateProps>;
}

export interface MobileExtensions {
  /**
   * Runs once at app start, before the first render, for startup work such as registering
   * observers. Slots are read lazily; do not rely on module import order for startup side effects.
   */
  readonly install?: () => void;
  /** Replaces the empty home screen shown before any thread exists. */
  readonly homeEmptyState?: HomeEmptyStateSlot;
  /** Rendered above the stock options on the "add connection" screen. */
  readonly connectionsNewTop?: ComponentType;
}
