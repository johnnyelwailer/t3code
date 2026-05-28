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

import type { T3workDashboardRecipeCurrentViewSummary } from "~/t3work/t3work-dashboardRecipeSummary";

type DashboardRecipeViewContextValue = {
  readonly summary: T3workDashboardRecipeCurrentViewSummary | null;
  readonly setSummary: Dispatch<SetStateAction<T3workDashboardRecipeCurrentViewSummary | null>>;
};

export function areT3workDashboardRecipeViewSummariesEqual(
  left: T3workDashboardRecipeCurrentViewSummary | null,
  right: T3workDashboardRecipeCurrentViewSummary | null,
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
    left.needsMyActionCount === right.needsMyActionCount
  );
}

export function mergeT3workDashboardRecipeViewSummary(
  current: T3workDashboardRecipeCurrentViewSummary | null,
  next: T3workDashboardRecipeCurrentViewSummary | null,
): T3workDashboardRecipeCurrentViewSummary | null {
  return areT3workDashboardRecipeViewSummariesEqual(current, next) ? current : next;
}

export function clearT3workDashboardRecipeViewSummary(
  current: T3workDashboardRecipeCurrentViewSummary | null,
  published: T3workDashboardRecipeCurrentViewSummary | null,
): T3workDashboardRecipeCurrentViewSummary | null {
  return areT3workDashboardRecipeViewSummariesEqual(current, published) ? null : current;
}

const DashboardRecipeViewContext = createContext<DashboardRecipeViewContextValue | null>(null);

export function T3workDashboardRecipeViewProvider({ children }: { children: ReactNode }) {
  const [summary, setSummary] = useState<T3workDashboardRecipeCurrentViewSummary | null>(null);
  const value = useMemo(() => ({ summary, setSummary }), [summary]);

  return (
    <DashboardRecipeViewContext.Provider value={value}>
      {children}
    </DashboardRecipeViewContext.Provider>
  );
}

export function useT3workDashboardRecipeViewSummary() {
  return useContext(DashboardRecipeViewContext)?.summary ?? null;
}

export function usePublishT3workDashboardRecipeViewSummary(
  summary: T3workDashboardRecipeCurrentViewSummary | null,
) {
  const context = useContext(DashboardRecipeViewContext);
  const setSummary = context?.setSummary;
  const latestSummaryRef = useRef(summary);
  latestSummaryRef.current = summary;

  useEffect(() => {
    if (!setSummary) {
      return;
    }

    setSummary((current) => mergeT3workDashboardRecipeViewSummary(current, summary));
  }, [setSummary, summary]);

  useEffect(() => {
    if (!setSummary) {
      return;
    }

    return () => {
      setSummary((current) =>
        clearT3workDashboardRecipeViewSummary(current, latestSummaryRef.current),
      );
    };
  }, [setSummary]);
}
