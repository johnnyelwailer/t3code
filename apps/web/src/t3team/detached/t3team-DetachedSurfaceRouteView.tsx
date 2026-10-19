/**
 * The page a detached surface lives on: the surface, edge to edge, and nothing else — no
 * sidebar, no tab strip, no command palette. The window (or tab) is the reader's to size and
 * full-screen; the page's job is to fill it.
 */
import { DETACHED_SURFACE_TITLE_PARAM } from "@t3tools/shared/t3team-detachedSurface";
import { DETACHED_VIEW_KIND } from "@t3tools/shared/t3team-detachedView";
import { useEffect } from "react";

import { StandalonePage, StandalonePageHeader } from "~/components/ui/standalone-page";
import { APP_DISPLAY_NAME } from "~/branding";
import { useT3TeamPackAppearance } from "~/t3team/t3team-packAppearance";

import { detachedSurfaceView, type DetachedSurfaceViewProps } from "./t3team-detachedSurfaceKinds";

export function DetachedSurfaceRouteView({
  kind,
  params,
  onParamsChange,
}: DetachedSurfaceViewProps & { readonly kind: string }) {
  const title = params[DETACHED_SURFACE_TITLE_PARAM];
  // The pack's name, as the main window's title uses it (Nexi Work, not the build's own name).
  const appName = useT3TeamPackAppearance()?.labels?.appName ?? APP_DISPLAY_NAME;
  useEffect(() => {
    document.title = title ? `${title} — ${appName}` : appName;
  }, [title, appName]);

  const View = detachedSurfaceView(kind);
  if (View === undefined) {
    return (
      <StandalonePage tone="error">
        <StandalonePageHeader
          eyebrow={appName}
          title="Nothing to show here"
          description="This window was opened for something this version of the app cannot display. Close it and open it again from the app."
        />
      </StandalonePage>
    );
  }
  // An undocked view hands the window to its route at once, which draws its own header.
  if (kind === DETACHED_VIEW_KIND) {
    return <View params={params} onParamsChange={onParamsChange} />;
  }
  return (
    <div className="flex h-dvh w-full min-w-0 flex-col overflow-hidden bg-background text-foreground">
      {/* Where the window draws its title bar over the page (Windows, Linux), the panel gets a
          band of its own to drag by and to keep the window buttons off its controls. */}
      <div className="drag-region hidden h-(--workspace-topbar-height) shrink-0 items-center truncate border-b border-border px-3 text-sm text-muted-foreground wco:flex wco:pr-(--workspace-native-controls-inset)">
        {title ?? appName}
      </div>
      <View params={params} onParamsChange={onParamsChange} />
    </div>
  );
}
