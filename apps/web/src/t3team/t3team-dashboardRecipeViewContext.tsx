import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import type { T3TeamDashboardRecipeCurrentViewSummary } from "~/t3team/t3team-dashboardRecipeSummary";

type DashboardRecipeViewContextValue = {
  readonly summary: T3TeamDashboardRecipeCurrentViewSummary | null;
  readonly setSummary: Dispatch<SetStateAction<T3TeamDashboardRecipeCurrentViewSummary | null>>;
};

export function areT3TeamDashboardRecipeViewSummariesEqual(
  left: T3TeamDashboardRecipeCurrentViewSummary | null,
  right: T3TeamDashboardRecipeCurrentViewSummary | null,
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.itemCount === right.itemCount &&
    left.bugCount === right.bugCount &&
    left.primaryItemLabel === right.primaryItemLabel &&
    left.primaryBugLabel === right.primaryBugLabel &&
    left.needsMyActionPreset === right.needsMyActionPreset &&
    left.needsMyActionCount === right.needsMyActionCount &&
    left.viewFiltersActive === right.viewFiltersActive
  );
}

export function mergeT3TeamDashboardRecipeViewSummary(
  current: T3TeamDashboardRecipeCurrentViewSummary | null,
  next: T3TeamDashboardRecipeCurrentViewSummary | null,
): T3TeamDashboardRecipeCurrentViewSummary | null {
  return areT3TeamDashboardRecipeViewSummariesEqual(current, next) ? current : next;
}

export function clearT3TeamDashboardRecipeViewSummary(
  current: T3TeamDashboardRecipeCurrentViewSummary | null,
  published: T3TeamDashboardRecipeCurrentViewSummary | null,
): T3TeamDashboardRecipeCurrentViewSummary | null {
  return areT3TeamDashboardRecipeViewSummariesEqual(current, published) ? null : current;
}

const DashboardRecipeViewContext = createContext<DashboardRecipeViewContextValue | null>(null);

export function T3TeamDashboardRecipeViewProvider({ children }: { children: ReactNode }) {
  const [summary, setSummary] = useState<T3TeamDashboardRecipeCurrentViewSummary | null>(null);
  const value = useMemo(() => ({ summary, setSummary }), [summary]);

  return (
    <DashboardRecipeViewContext.Provider value={value}>
      {children}
    </DashboardRecipeViewContext.Provider>
  );
}

export function useT3TeamDashboardRecipeViewSummary() {
  return useContext(DashboardRecipeViewContext)?.summary ?? null;
}

export function usePublishT3TeamDashboardRecipeViewSummary(
  summary: T3TeamDashboardRecipeCurrentViewSummary | null,
) {
  const context = useContext(DashboardRecipeViewContext);
  const setSummary = context?.setSummary;
  const latestSummaryRef = useRef(summary);
  latestSummaryRef.current = summary;

  useEffect(() => {
    if (!setSummary) {
      return;
    }

    setSummary((current) => mergeT3TeamDashboardRecipeViewSummary(current, summary));
  }, [setSummary, summary]);

  useEffect(() => {
    if (!setSummary) {
      return;
    }

    return () => {
      setSummary((current) =>
        clearT3TeamDashboardRecipeViewSummary(current, latestSummaryRef.current),
      );
    };
  }, [setSummary]);
}
