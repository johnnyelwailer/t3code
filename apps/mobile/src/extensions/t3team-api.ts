/**
 * The whole surface a distribution overlay may import from the mobile app, as
 * `@t3code/mobile-api`. The distribution Metro hook rejects every other import of an overlay file
 * that is not on its short package list (`OVERLAY_PACKAGES`), so this module is the contract:
 * growing it is a deliberate, reviewed change, and a refactor inside the app only has to keep these
 * exports.
 */
export type {
  BrandTitleProps,
  HomeCatalogState,
  HomeEmptyStateProps,
  HomeEmptyStateSlot,
  EnvironmentPickerTopProps,
  HomeFiltersProps,
  MobileExtensions,
  UrlPolicy,
  WorkspaceExtraTab,
} from "./t3team-extensionTypes";
export type {
  PendingDraft,
  PendingDraftProject,
  PendingDraftSlot,
  PendingDraftTone,
} from "./t3team-pendingDraftTypes";
export { retargetPendingDraft } from "./t3team-retargetPendingDraft";
export { useOpenPendingDraft } from "./t3team-useOpenPendingDraft";
export type { MobileThemeAppearance, MobileThemeVariables } from "../lib/mobileTheme";

// What the Nexi broker sign-in and hosts list use. Add to this list only what a migrated screen needs.
export { AppActivityIndicator } from "../components/ui/AppActivityIndicator";
export { SymbolView } from "../components/ui/AppSymbol";
export { AppText } from "../components/ui/AppText";
export { Button } from "../components/ui/Button";
export { Notice } from "../components/ui/Notice";
export { ConnectionStatusDot } from "../features/connection/ConnectionStatusDot";
export { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
export { createMobileThemeVariables } from "../lib/mobileTheme";
export { ListRow } from "../components/ui/ListRow";
export { environmentCatalog } from "../connection/catalog";
export { appAtomRegistry } from "../state/atom-registry";
export { useProjects, useServerConfigs } from "../state/entities";
export { useWorkspaceEnvironments } from "../state/workspace";
export { useAtomCommand } from "../state/use-atom-command";

/**
 * The environments' server configs. Loaded on demand because the connection runtime imports the
 * registry: a static import here would put the runtime inside the overlay's import cycle.
 */
export const loadEnvironmentServerConfigsAtom = () =>
  import("../state/server").then((module) => module.environmentServerConfigsAtom);

/**
 * The native attachment viewer (download, then open the local copy). Loaded on demand: the attachment
 * code consults the url policy, which is the overlay, so a static import would be a cycle.
 */
export const loadAttachmentViewer = () => import("../lib/attachmentDownload");
