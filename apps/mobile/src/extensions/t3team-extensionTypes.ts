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

/**
 * Decisions about URLs that leave the app's own HTTP stack. Every function is optional; absent
 * means stock behavior.
 */
export interface UrlPolicy {
  /** True when a URL only works inside this app and must not be handed to another app. */
  readonly isAppPrivate?: (url: string) => boolean;
  /** Opens an app-private asset for the user (typically a download, then the native viewer). */
  readonly openAppPrivate?: (input: {
    readonly url: string;
    readonly attachment: { readonly name: string; readonly mimeType: string };
    readonly report: (message: string) => void;
  }) => Promise<void>;
  /** Called with a URL right before the app's native HTTP client downloads it. */
  readonly beforeNativeFetch?: (url: string) => void;
  /** Base URL of the synthetic document that hosts a stream WebView; undefined keeps the default. */
  readonly documentBaseUrl?: (httpBase: string) => string | undefined;
}

export interface MobileExtensions {
  /** Policy for URLs handed to other apps, native downloads and stream documents. */
  readonly urlPolicy?: UrlPolicy;
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
  /**
   * Rendered at the top of the Chats list, and above the stock empty state when there is no thread
   * yet, so a distribution can offer its own sessions and sign-in where the user starts.
   */
  readonly homeTop?: ComponentType;
  /** Rendered above the stock options on the "add connection" screen. */
  readonly connectionsNewTop?: ComponentType;
}
