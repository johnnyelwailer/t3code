import { Skeleton } from "~/t3work/components/ui/t3work-skeleton";

export type ProjectMyWorkContentState =
  | { kind: "loading" }
  | { kind: "empty"; reason: "no-assigned" | "filtered" }
  | { kind: "ready" };

export function resolveProjectMyWorkContentState(input: {
  loading: boolean;
  assignedWorkItemsCount: number;
  filteredWorkItemsCount: number;
}): ProjectMyWorkContentState {
  if (input.loading && input.assignedWorkItemsCount === 0) {
    return { kind: "loading" };
  }

  if (input.assignedWorkItemsCount === 0) {
    return { kind: "empty", reason: "no-assigned" };
  }

  if (input.filteredWorkItemsCount === 0) {
    return { kind: "empty", reason: "filtered" };
  }

  return { kind: "ready" };
}

export function ProjectMyWorkLoadingState() {
  return (
    <div className="rounded-lg border border-border/70 bg-background/70 p-4 sm:p-5">
      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-[92%]" />
        <Skeleton className="h-10 w-[84%]" />
      </div>
    </div>
  );
}
