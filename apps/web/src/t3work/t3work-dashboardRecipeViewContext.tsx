import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { T3workDashboardRecipeCurrentViewSummary } from "~/t3work/t3work-dashboardRecipeSummary";

type DashboardRecipeViewContextValue = {
  readonly summary: T3workDashboardRecipeCurrentViewSummary | null;
  readonly setSummary: (summary: T3workDashboardRecipeCurrentViewSummary | null) => void;
};

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

  useEffect(() => {
    if (!context) {
      return;
    }

    context.setSummary(summary);
    return () => {
      context.setSummary(null);
    };
  }, [context, summary]);
}
