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
} from "./t3team-extensionTypes";
