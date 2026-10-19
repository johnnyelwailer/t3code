/**
 * Per-step progress for the thread bootstrap.
 *
 * The bootstrap runs the same serial preparation chain as before (create the server thread,
 * prepare the context attachments, start the run). The difference now is that the view can see
 * each step as it happens: the thread renders immediately with the kickoff message and these
 * steps, so a slow preparation step shows as an in-thread progress row instead of a blocking
 * "Creating thread..." panel.
 */
export type ThreadBootstrapStepId = "create" | "context" | "launch";

export type ThreadBootstrapStepStatus = "pending" | "busy" | "done" | "error";

export type ThreadBootstrapStep = {
  readonly id: ThreadBootstrapStepId;
  readonly status: ThreadBootstrapStepStatus;
  readonly error?: string;
};

export type ThreadBootstrapProgress = {
  readonly steps: ReadonlyArray<ThreadBootstrapStep>;
};

export const THREAD_BOOTSTRAP_STEP_LABELS: Readonly<Record<ThreadBootstrapStepId, string>> = {
  create: "Creating the conversation",
  context: "Preparing context",
  launch: "Starting the run",
};

export type ThreadLaunchStepPresentation = {
  readonly label: string;
  readonly status: ThreadBootstrapStepStatus;
  readonly error?: string;
};

/**
 * The step rows a pre-shell view should render. Before the bootstrap's first report the create
 * step is busy: the dispatch has been claimed, so something is in flight.
 */
export function selectThreadLaunchSteps(
  progress: ThreadBootstrapProgress | null,
): ReadonlyArray<ThreadLaunchStepPresentation> {
  const steps = progress?.steps ?? [
    { id: "create" as ThreadBootstrapStepId, status: "busy" as ThreadBootstrapStepStatus },
  ];
  return steps.map((step) => ({
    label: THREAD_BOOTSTRAP_STEP_LABELS[step.id],
    status: step.status,
    ...(step.error ? { error: step.error } : {}),
  }));
}

export function createThreadBootstrapProgress(input: {
  includeContext: boolean;
}): ThreadBootstrapProgress {
  return {
    steps: [
      { id: "create", status: "pending" },
      ...(input.includeContext ? [{ id: "context" as const, status: "pending" as const }] : []),
      { id: "launch", status: "pending" },
    ],
  };
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function updateStep(
  progress: ThreadBootstrapProgress,
  id: ThreadBootstrapStepId,
  status: ThreadBootstrapStepStatus,
  error?: string,
): ThreadBootstrapProgress {
  return {
    steps: progress.steps.map((step) =>
      step.id === id ? { id, status, ...(error ? { error } : {}) } : step,
    ),
  };
}

/**
 * Holds the current step statuses for one bootstrap run and reports each change to the view.
 * Steps are independent: a later step failing does not rewrite earlier "done" statuses.
 */
export class ThreadBootstrapProgressTracker {
  private progress: ThreadBootstrapProgress;
  private readonly report: ((progress: ThreadBootstrapProgress) => void) | undefined;

  constructor(input: {
    progress: ThreadBootstrapProgress;
    report?: ((progress: ThreadBootstrapProgress) => void) | undefined;
  }) {
    this.progress = input.progress;
    this.report = input.report;
  }

  get current(): ThreadBootstrapProgress {
    return this.progress;
  }

  begin(id: ThreadBootstrapStepId): void {
    this.progress = updateStep(this.progress, id, "busy");
    this.report?.(this.progress);
  }

  complete(id: ThreadBootstrapStepId): void {
    this.progress = updateStep(this.progress, id, "done");
    this.report?.(this.progress);
  }

  fail(id: ThreadBootstrapStepId, error: unknown): void {
    this.progress = updateStep(this.progress, id, "error", errorText(error));
    this.report?.(this.progress);
  }
}
