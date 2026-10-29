import { useAtomValue } from "@effect/atom-react";
import { useLocation } from "@tanstack/react-router";
import { useEffect } from "react";

import { APP_DISPLAY_NAME, APP_STAGE_LABEL } from "../branding";
import { resolveServerBackedAppDisplayName } from "../branding.logic";
import { GUEST_PAGE_PATH } from "../guestPage";
import { primaryServerConfigAtom } from "../state/server";
import { startRegionZoom } from "../t3team-regionZoom";
import { isAtlassianOAuthCallbackPath } from "./hooks/t3team-atlassianOAuthRedirect";
import { t3teamPackProductName } from "./t3team-appBrandName";
import { useT3TeamPackAppearance } from "./t3team-packAppearance";
import { T3TeamPackAppearanceDefaultsSync } from "./t3team-PackAppearanceDefaultsSync";
import { T3TeamPackAppearanceSync } from "./t3team-PackAppearanceSync";
import { isT3TeamShellPath } from "./t3team-upstreamRouteBridge";
import { useUpstreamRouteBridge } from "./t3team-useUpstreamRouteBridge";

/**
 * The document title carries the pack's product name once a pack is active. Upstream sets the
 * title from app start (`appInit.tsx`) without knowing packs; with no pack this component does
 * nothing, so upstream's title stands.
 */
function T3TeamPackDocumentTitle() {
  const packAppName = t3teamPackProductName(useT3TeamPackAppearance());
  const primaryServerVersion =
    useAtomValue(primaryServerConfigAtom)?.environment.serverVersion ?? null;
  const title =
    packAppName === undefined
      ? null
      : resolveServerBackedAppDisplayName({
          baseName: packAppName,
          fallbackDisplayName: packAppName,
          fallbackStageLabel: APP_STAGE_LABEL,
          primaryServerVersion,
        });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- writes the pack's product name into the document title, which upstream's app-start title sync does not know about
  useEffect(() => {
    if (title !== null) document.title = title;
    return () => {
      if (title !== null) document.title = APP_DISPLAY_NAME;
    };
  }, [title]);
  return null;
}

/**
 * Everything the Team shell needs from the root route, mounted once above upstream's root
 * branches so it runs for every one of them (pairing, first-run, detached and voice windows
 * included): the pack appearance syncs (a first-run user must see the pack's branding in the very
 * wizard they are completing), the pack document title, the hover-zoom for marked regions, and
 * the bridge that maps upstream's route shapes onto Team routes.
 */
export function T3TeamRootCoordinators() {
  const pathname = useLocation({ select: (location) => location.pathname });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Ctrl/Cmd+scroll hover-zoom for marked regions; document-level, app-wide, released on unmount
  useEffect(() => startRegionZoom(), []);
  // Upstream's sidebar navigates to upstream route shapes. The bridge maps those onto the
  // equivalent Team route (and falls back to the dashboard) so upstream's components need no
  // fork-side navigation patches. Guest links open on a tunnel host with no session: untouched.
  useUpstreamRouteBridge(
    pathname,
    pathname !== GUEST_PAGE_PATH &&
      !isT3TeamShellPath(pathname) &&
      !isAtlassianOAuthCallbackPath(pathname),
  );
  if (pathname === GUEST_PAGE_PATH) return null;
  return (
    <>
      <T3TeamPackAppearanceSync />
      <T3TeamPackAppearanceDefaultsSync />
      <T3TeamPackDocumentTitle />
    </>
  );
}
