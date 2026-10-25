import { CheckIcon, CircleAlertIcon } from "lucide-react";

import { SetupActions } from "./t3team-CloudSessionSetupActions";
import { useMediaQuery } from "~/hooks/useMediaQuery";
import {
  buildCloudSessionSetup,
  cloudSetupAnnouncement,
  cloudSetupLongWaitNote,
  cloudSetupMeanwhileNote,
  cloudSetupReadyNote,
  readCloudSetup,
  type CloudSetupFacts,
} from "./t3team-cloudSessionSetupProgress";
import { CloudProjectWaitNote } from "./t3team-CloudProjectWaitNote";
import { presentCloudProjectWaitAt } from "./t3team-cloudProjectWaitClock";
import { SetupLiveReadout, StepList } from "./t3team-CloudSessionSetupParts";
import type { CloudQueuedSendRecoveryAction } from "./t3team-cloudProjectNotResolvedActions";
import { useCloudProjectWaitNow } from "./t3team-useCloudProjectWaitNow";
import { useCloudSetupElapsedSeconds } from "./t3team-useCloudSetupElapsedSeconds";

export interface CloudSessionSetupCardProps {
  readonly facts: CloudSetupFacts;
  /** Cancel a waiting first message (the session itself is cancelled from the Run-on menu). */
  readonly onCancel?: (() => void) | undefined;
  /** Retry a first message that could not be delivered. */
  readonly onRetry?: (() => void) | null | undefined;
  /** More ways out of a message that gave up waiting for its project (Retry and Cancel stay). */
  readonly recoveryActions?: ReadonlyArray<CloudQueuedSendRecoveryAction> | undefined;
  /** Start a fresh session after this one failed. */
  readonly onTryAgain?: (() => void) | null | undefined;
  /** A first message is being handed over right now: it can no longer be cancelled. */
  readonly sending?: boolean | undefined;
  /**
   * Freezes the clock at this many seconds since dispatch: for stories and screenshots, which must
   * not drift. Omitted in the app, where the snapshot's own elapsed time runs on.
   */
  readonly frozenElapsedSeconds?: number | undefined;
  /** Pins the wall clock the "Project ready" wording is read at (stories); omitted in the app. */
  readonly frozenNowMs?: number | undefined;
  /** Force still or live motion (stories); the app follows `prefers-reduced-motion`. */
  readonly motion?: "still" | "live" | undefined;
}

export function CloudSessionSetupCard({
  facts,
  onCancel,
  onRetry,
  recoveryActions,
  onTryAgain,
  sending = false,
  frozenElapsedSeconds,
  frozenNowMs,
  motion,
}: CloudSessionSetupCardProps) {
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const motionMode = motion ?? (prefersReducedMotion ? "still" : "live");
  const { session } = facts;
  const model = buildCloudSessionSetup(facts);
  const elapsedSeconds = useCloudSetupElapsedSeconds(
    session?.elapsedSeconds ?? 0,
    model.stage === "working",
    frozenElapsedSeconds,
  );
  const projectWaitNow = useCloudProjectWaitNow(
    facts.queued,
    model.projectWait !== null,
    frozenNowMs,
  );
  const slow = model.stage === "working" && readCloudSetup(model, elapsedSeconds).slow;
  const longWait = cloudSetupLongWaitNote(model);
  const meanwhile = cloudSetupMeanwhileNote(model);
  const failed = model.stage === "failed";
  const projectWait = presentCloudProjectWaitAt(model.projectWait, facts.queued, projectWaitNow);
  return (
    <section
      aria-label="Cloud session setup"
      data-cloud-setup-card=""
      data-state={model.stage}
      data-slow={slow ? "true" : "false"}
      data-motion={motionMode}
      data-cloud-setup-step-current={model.currentStep.id}
      className="t3team-setup-card mt-1 mb-2 overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-4 text-card-foreground shadow-xs/5"
    >
      <p role="status" aria-live="polite" className="sr-only">
        {cloudSetupAnnouncement(model)}
      </p>
      <div className="flex items-start gap-3">
        <div className="t3team-setup-orb" aria-hidden>
          {model.stage === "ready" ? (
            <CheckIcon className="size-5 stroke-2" />
          ) : failed ? (
            <CircleAlertIcon className="size-5" />
          ) : (
            <>
              <span className="t3team-setup-orb-ring" data-ring="1" />
              <span className="t3team-setup-orb-ring" data-ring="2" />
              <span className="t3team-setup-orb-core" />
            </>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <h3 className="text-sm font-semibold leading-6 tracking-tight">{model.title}</h3>
          <p className="text-sm leading-5 text-muted-foreground">
            {failed
              ? (model.failureReason ?? "Something went wrong while the machine was starting.")
              : model.stage === "ready"
                ? cloudSetupReadyNote(model)
                : slow
                  ? `Still working: ${model.currentStep.label.toLowerCase()}. This is taking longer than the rough estimate.`
                  : model.activity}
          </p>
        </div>
      </div>

      {failed ? null : (
        <div className="mt-3.5">
          <SetupLiveReadout
            model={model}
            elapsedSeconds={elapsedSeconds}
            projectWait={projectWait}
          />
        </div>
      )}

      {failed ? null : (
        <div className="mt-3.5">
          <StepList steps={model.steps} />
        </div>
      )}

      {projectWait === null ? null : (
        <CloudProjectWaitNote notice={projectWait} className="mt-3.5" />
      )}
      {longWait === null ? null : (
        <p
          data-cloud-setup-note="long-wait"
          className="mt-3.5 rounded-lg bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground"
        >
          {longWait}
        </p>
      )}
      {meanwhile === null ? null : (
        <p
          data-cloud-setup-note="meanwhile"
          className="mt-3 text-xs leading-5 text-muted-foreground"
        >
          {meanwhile}
        </p>
      )}

      <SetupActions
        failed={failed}
        detailsUrl={model.detailsUrl}
        onCancel={onCancel}
        onRetry={onRetry}
        recoveryActions={recoveryActions}
        onTryAgain={onTryAgain}
        sending={sending}
      />
    </section>
  );
}
