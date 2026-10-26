import type { ComponentType } from "react";

/**
 * Extension seams for the mobile app. A distribution fills the slots it wants to change; every
 * slot is optional and absent means stock behavior, so a build without an overlay is unchanged.
 * A slot is added together with the screen that reads it and the distribution code that fills it.
 */
export interface MobileExtensions {
  /**
   * Runs once at app start, before the first render, for startup work such as registering
   * observers. A returned promise is not awaited; its rejection is logged. Slots are read lazily:
   * do not rely on module import order for startup side effects.
   */
  readonly install?: () => void | Promise<void>;
  /** Rendered above the stock options on the "add connection" screen. */
  readonly connectionsNewTop?: ComponentType;
}
