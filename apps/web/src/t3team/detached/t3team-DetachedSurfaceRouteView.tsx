/**
 * The page a detached surface lives on: the surface, edge to edge, and nothing else — no
 * sidebar, no tab strip, no command palette. The window (or tab) is the reader's to size and
 * full-screen; the page's job is to fill it.
 */
import { DETACHED_SURFACE_TITLE_PARAM } from "@t3tools/shared/t3team-detachedSurface";
import { useEffect } from "react";

import { StandalonePage, StandalonePageHeader } from "~/components/ui/standalone-page";
import { APP_DISPLAY_NAME } from "~/branding";

import { detachedSurfaceView, type DetachedSurfaceViewProps } from "./t3team-detachedSurfaceKinds";

export function DetachedSurfaceRouteView({
  kind,
  params,
  onParamsChange,
}: DetachedSurfaceViewProps & { readonly kind: string }) {
  const title = params[DETACHED_SURFACE_TITLE_PARAM];
  useEffect(() => {
    document.title = title ? `${title} — ${APP_DISPLAY_NAME}` : APP_DISPLAY_NAME;
  }, [title]);

  const View = detachedSurfaceView(kind);
  if (View === undefined) {
    return (
      <StandalonePage tone="error">
        <StandalonePageHeader
          eyebrow={APP_DISPLAY_NAME}
          title="Nothing to show here"
          description="This window was opened for something this version of the app cannot display. Close it and open it again from the app."
        />
      </StandalonePage>
    );
  }
  return (
    <div className="flex h-dvh w-full min-w-0 flex-col overflow-hidden bg-background text-foreground">
      <View params={params} onParamsChange={onParamsChange} />
    </div>
  );
}
