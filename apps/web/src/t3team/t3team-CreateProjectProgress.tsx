import { LinkedRepositorySyncModal } from "~/t3team/components/t3team-LinkedRepositorySyncModal";
import {
  buildSyncSteps,
  type LinkedRepositorySavePhase,
} from "~/t3team/components/t3team-linkedRepositorySyncSteps";
import { useLinkedRepositorySyncStatus } from "~/t3team/hooks/t3team-useLinkedRepositorySyncStatus";

function resolvePhase(
  workspaceRoot: string | undefined,
  urls: ReadonlyArray<string>,
  byUrl: ReturnType<typeof useLinkedRepositorySyncStatus>["byUrl"],
): LinkedRepositorySavePhase {
  if (!workspaceRoot) return "saving";
  const entries = urls.map((url) => byUrl.get(url));
  if (entries.some((entry) => entry?.syncState === "cloning" || entry?.syncState === "updating")) {
    return "waiting-for-main";
  }
  if (entries.some((entry) => entry?.status === "failed")) return "scaffolding";
  if (entries.length > 0 && entries.every(Boolean)) return "saved";
  return "scaffolding";
}

/**
 * Shown in place of the repository picker once Add is pressed: the picker (and its
 * discovery hooks) unmount immediately so a render loop there cannot peg the app,
 * and each linked repository's clone/sync is listed with live progress.
 */
export function CreateProjectProgress({
  urls,
  workspaceRoot,
  onContinueInBackground,
  onDone,
  onRetry,
  onCancel,
}: {
  readonly urls: ReadonlyArray<string>;
  readonly workspaceRoot: string | undefined;
  readonly onContinueInBackground: () => void;
  readonly onDone: () => void;
  readonly onRetry: () => void;
  readonly onCancel: () => void;
}) {
  const { byUrl } = useLinkedRepositorySyncStatus({
    workspaceRoot,
    enabled: Boolean(workspaceRoot),
  });
  const phase = resolvePhase(workspaceRoot, urls, byUrl);
  const steps = buildSyncSteps({ phase, urls, byUrl });
  const anyFailed = steps.some((step) => step.state === "failed");

  return (
    <div data-testid="create-project-progress" className="flex min-h-0 flex-1 flex-col">
      <LinkedRepositorySyncModal
        steps={steps}
        onContinueInBackground={onContinueInBackground}
        onDone={anyFailed ? onRetry : onDone}
        onBack={onCancel}
        closeLabel={anyFailed ? "Try again" : "Close"}
        backLabel="Cancel"
        doneLabel="Done"
        continueLabel="Continue in background"
      />
    </div>
  );
}
