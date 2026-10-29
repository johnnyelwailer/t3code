import type { BrokerEnvironmentGateway } from "@t3tools/client-runtime/connection";
import type * as Stream from "effect/Stream";
import type { ComponentType } from "react";
import type { PlatformOSType } from "react-native";

import type { MobileThemeAppearance, MobileThemeVariables } from "../lib/mobileTheme";

/** What the home screen knows about the connections catalog. */
export interface HomeCatalogState {
  readonly isLoadingConnections: boolean;
  readonly hasConnections: boolean;
}

export interface HomeEmptyStateProps {
  /** Opens the stock "add connection" flow, for an extension that offers other ways to connect. */
  readonly onAddConnection: () => void;
}

export interface HomeEmptyStateSlot {
  /** True when the extension should replace the stock empty home (no threads yet). */
  readonly shouldRender: (catalog: HomeCatalogState, platform: PlatformOSType) => boolean;
  readonly Component: ComponentType<HomeEmptyStateProps>;
}

export interface BrandTitleProps {
  readonly scale: number;
  readonly accessibilityLabel?: string | undefined;
  readonly allowFontScaling?: boolean | undefined;
}

/** One extra top-level tab of the Android workspace navigation. */
export interface WorkspaceExtraTab {
  /** Stable identity of the tab, for example "nexi". */
  readonly id: string;
  /** The tab's label in the bottom navigation. */
  readonly title: string;
  /** "start" puts it before Chats, "center" between Chats and Pull requests. */
  readonly placement: "start" | "center";
  /** Selects this tab when the workspace first appears, instead of Chats. */
  readonly selectOnLaunch?: boolean;
  /** The tab's content, rendered inside an `ExtensionBoundary` and kept mounted once visited. */
  readonly Component: ComponentType;
}

/**
 * What the Android Chats list offers a distribution's quick filter row: the same project and
 * environment selection the header menu edits, so both stay in sync (persisted by the stock list).
 */
export interface HomeFiltersProps {
  /** The projects of the selected environment, most recently active first. */
  readonly projects: ReadonlyArray<{ readonly key: string; readonly label: string }>;
  /** The selected project's key, or null for all projects. */
  readonly selectedProjectKey: string | null;
  readonly onSelectProject: (key: string | null) => void;
  readonly environments: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  /** The selected environment's id, or null for all environments. */
  readonly selectedEnvironmentId: string | null;
  readonly onSelectEnvironment: (id: string | null) => void;
}

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
  readonly homeTop?: ComponentType<{ readonly catalog: HomeCatalogState }>;
  /**
   * Rendered directly under `homeTop` in the Android Chats list: quick project pills and an
   * environment row over the list's own filter state. Nothing without one; iOS keeps its chips.
   */
  readonly homeFilters?: ComponentType<HomeFiltersProps>;
  /**
   * One extra tab in the Android bottom navigation. `useTab` is a React hook called from the
   * workspace, so it may subscribe to the distribution's own store and switch the tab on or off
   * (null: no tab) or move it at runtime. It must not throw. Android only; iOS has no extra tab.
   */
  readonly workspaceTab?: { readonly useTab: () => WorkspaceExtraTab | null };
  /** Replaces the empty home screen shown before any thread exists. */
  readonly homeEmptyState?: HomeEmptyStateSlot;
  /** Replaces the wordmark title of the home header. */
  readonly brandTitle?: ComponentType<BrandTitleProps>;
  /** False hides the app's brand mark on the loading screen (default: shown). */
  readonly showsLoadingBrandMark?: boolean;
  /** Repaints the default theme's variables (a distribution's palette). */
  readonly themeVariables?: (
    defaults: MobileThemeVariables,
    appearance: MobileThemeAppearance,
  ) => MobileThemeVariables;
  /** Rendered as the last row of the Connections group in Settings (a distribution's account entry). */
  readonly settingsConnections?: ComponentType;
  /** Rendered above the stock options on the "add connection" screen. */
  readonly connectionsNewTop?: ComponentType;
}
