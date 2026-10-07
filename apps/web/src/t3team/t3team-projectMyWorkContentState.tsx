import { Skeleton } from "~/t3team/components/ui/t3team-skeleton";

export type ProjectMyWorkContentState =
  | { kind: "loading" }
  | { kind: "sessionExpired" }
  | { kind: "error"; message: string }
  | { kind: "empty"; message: string }
  | { kind: "ready" };

export type ProjectMyWorkLoadStatus = {
  readonly loadError?: string | null | undefined;
  readonly sessionExpired?: boolean | undefined;
  readonly isLinked?: boolean | undefined;
  /** Re-run the My Work fetch (retry button / after signing back in). */
  readonly onRetry?: (() => void) | undefined;
};

/**
 * Loading, failed and genuinely-empty must stay distinguishable: a failed
 * fetch is never rendered as "nothing is assigned to you". Already-loaded
 * work stays visible when a later refresh fails.
 */
export function resolveProjectMyWorkContentState(
  input: {
    loading: boolean;
    assignedWorkItemsCount: number;
    filteredWorkItemsCount: number;
  } & ProjectMyWorkLoadStatus,
): ProjectMyWorkContentState {
  if (input.assignedWorkItemsCount === 0 && input.sessionExpired) {
    return { kind: "sessionExpired" };
  }

  if (input.assignedWorkItemsCount === 0 && input.loadError) {
    return { kind: "error", message: input.loadError };
  }

  if (input.loading && input.assignedWorkItemsCount === 0) {
    return { kind: "loading" };
  }

  if (input.assignedWorkItemsCount === 0 && input.isLinked === false) {
    return {
      kind: "empty",
      message:
        "This project is not linked to a Jira project, so there is no assigned work to show.",
    };
  }

  if (input.assignedWorkItemsCount === 0) {
    return {
      kind: "empty",
      message: "No Jira issues are currently assigned to you in this project.",
    };
  }

  if (input.filteredWorkItemsCount === 0) {
    return {
      kind: "empty",
      message: "No assigned issues match your current search and filters.",
    };
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
