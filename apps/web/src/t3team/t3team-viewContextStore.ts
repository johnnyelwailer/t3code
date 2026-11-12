import { create } from "zustand";

/**
 * What the visible view reports about itself, before it is tied to a thread. The view writes it as
 * its state changes; `usePublishThreadViewContext` reads it and publishes it for the open thread.
 * Filters and visible ids come from different components (the filter bar owner and the digest
 * lens), so each writes its own half.
 */
export type ReportedViewState = {
  readonly surface: "my-work";
  readonly projectId: string;
  readonly filters: Readonly<Record<string, string | number | boolean | ReadonlyArray<string>>>;
};

export type ReportedVisibleItems = {
  readonly projectId: string;
  readonly ids: ReadonlyArray<string>;
};

type ViewContextStore = {
  readonly view: ReportedViewState | null;
  readonly items: ReportedVisibleItems | null;
};

export const useViewContextStore = create<ViewContextStore>(() => ({ view: null, items: null }));

// A report equal to the stored one is dropped, so a view that re-renders with fresh-but-equal
// objects does not wake the publisher.
export const reportViewState = (view: ReportedViewState) =>
  useViewContextStore.setState((state) =>
    JSON.stringify(state.view) === JSON.stringify(view) ? state : { view },
  );

export const reportVisibleItems = (items: ReportedVisibleItems) =>
  useViewContextStore.setState((state) =>
    JSON.stringify(state.items) === JSON.stringify(items) ? state : { items },
  );

/** A view reports only while mounted; another project's leftovers are not cleared. */
export const clearReportedViewState = (projectId: string) =>
  useViewContextStore.setState((state) =>
    state.view?.projectId === projectId ? { view: null } : state,
  );

export const clearReportedVisibleItems = (projectId: string) =>
  useViewContextStore.setState((state) =>
    state.items?.projectId === projectId ? { items: null } : state,
  );
