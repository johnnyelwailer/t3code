import type { EmbeddedThreadParentView, ViewState } from "~/t3work/t3work-types";

type ViewMergeIdentity = {
  type: EmbeddedThreadParentView["type"];
  key: string;
};

/** Register new embedded-thread parent view types here with their merge identity. */
const embeddedThreadParentViewRegistry: {
  [Type in EmbeddedThreadParentView["type"]]: (
    view: Extract<EmbeddedThreadParentView, { type: Type }>,
  ) => string;
} = {
  dashboard: () => "dashboard",
  ticket: (view) => `ticket:${view.ticketId}`,
};

export function isEmbeddedThreadParentView(view: ViewState): view is EmbeddedThreadParentView {
  return view.type in embeddedThreadParentViewRegistry;
}

function viewMergeIdentity(view: EmbeddedThreadParentView): ViewMergeIdentity {
  const resolveKey = embeddedThreadParentViewRegistry[view.type] as (
    parentView: EmbeddedThreadParentView,
  ) => string;

  return { type: view.type, key: resolveKey(view) };
}

export function viewsMatchForEmbeddedThreadMerge(
  routeView: ViewState,
  storeView: ViewState,
): boolean {
  if (!isEmbeddedThreadParentView(routeView) || !isEmbeddedThreadParentView(storeView)) {
    return false;
  }

  if (routeView.type !== storeView.type) {
    return false;
  }

  const routeIdentity = viewMergeIdentity(routeView);
  const storeIdentity = viewMergeIdentity(storeView);
  return routeIdentity.key === storeIdentity.key;
}

/** Prefer route view, but keep store embeddedThreadId until URL navigation catches up. */
export function mergeEmbeddedThreadIdFromStore(
  routeView: ViewState,
  storeView: ViewState,
): ViewState {
  if (
    !viewsMatchForEmbeddedThreadMerge(routeView, storeView) ||
    !isEmbeddedThreadParentView(routeView) ||
    !isEmbeddedThreadParentView(storeView) ||
    routeView.embeddedThreadId ||
    !storeView.embeddedThreadId
  ) {
    return routeView;
  }

  return { ...routeView, embeddedThreadId: storeView.embeddedThreadId };
}

export function embeddedThreadIdFromParentView(
  activeView: ViewState | null,
  resolvedProjectId: string,
): string | undefined {
  if (activeView?.projectId === resolvedProjectId && isEmbeddedThreadParentView(activeView)) {
    return activeView.embeddedThreadId;
  }

  return undefined;
}
