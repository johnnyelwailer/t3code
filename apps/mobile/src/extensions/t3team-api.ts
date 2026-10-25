/**
 * The whole surface a distribution overlay may import from the mobile app, as
 * `@t3code/mobile-api`. The distribution Metro hook rejects every other import of an overlay file
 * that is not a direct dependency of this app, so this module is the contract: growing it is a
 * deliberate, reviewed change, and a refactor inside the app only has to keep these exports.
 */
export type {
  HomeEmptyStateProps,
  HomeEmptyStateSlot,
  MobileExtensions,
  UrlPolicy,
} from "./t3team-extensionTypes";

// What the Nexi broker sign-in and hosts list use. Add to this list only what a migrated screen needs.
export { AppText } from "../components/ui/AppText";
export { ListRow } from "../components/ui/ListRow";
export { environmentCatalog } from "../connection/catalog";
export { appAtomRegistry } from "../state/atom-registry";
export { useServerConfigs } from "../state/entities";
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
