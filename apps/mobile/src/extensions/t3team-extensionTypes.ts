import type { BrokerEnvironmentGateway } from "@t3tools/client-runtime/connection";
import type * as Stream from "effect/Stream";
import type { ComponentType } from "react";

/**
 * Extension seams for the mobile app. A distribution fills the slots it wants to change; every
 * slot is optional and absent means stock behavior, so a build without an overlay is unchanged.
 * A slot is added together with the screen that reads it and the distribution code that fills it.
 */
/** What the stock app does not provide: attaching and pairing broker cloud sessions on this device. */
export type BrokerGatewayImplementation = Parameters<typeof BrokerEnvironmentGateway.of>[0];

export interface MobileExtensions {
  /** Replaces the stock "broker sessions connect from the desktop app" capability. */
  readonly brokerGateway?: BrokerGatewayImplementation;
  /** Extra wakeup sources for the connection supervisor, merged with the stock ones. */
  readonly wakeups?: ReadonlyArray<
    Stream.Stream<"credentials-changed" | "broker-availability-changed">
  >;
  /**
   * Runs once at app start, before the first render, for startup work such as registering
   * observers. A returned promise is not awaited; its rejection is logged. Slots are read lazily:
   * do not rely on module import order for startup side effects.
   */
  readonly install?: () => void | Promise<void>;
  /** Rendered above the stock options on the "add connection" screen. */
  readonly connectionsNewTop?: ComponentType;
}
