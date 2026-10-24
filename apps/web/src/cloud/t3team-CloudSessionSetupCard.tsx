/**
 * "Setting up your cloud session": the calm, honest progress card a thread shows while its cloud
 * session becomes ready — the step in plain words, a time range, and what the user can do
 * meanwhile. Everything it says comes from `t3team-cloudSessionSetupProgress`; this file only
 * paints it.
 *
 * Performance: the bar is ONE CSS animation computed once per step (`SetupFill` is keyed by step),
 * so a frame costs React nothing. A one-second tick re-renders only `SetupLiveReadout` (the bar
 * and the estimate line), never the thread, and a poll that changes no step restarts no animation.
 * Under `prefers-reduced-motion` every loop stops and the bar simply moves forward each second.
 */
import { CheckIcon, CircleAlertIcon, RotateCcwIcon, XIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { useMediaQuery } from "~/hooks/useMediaQuery";
import {
  buildCloudSessionSetup,
  cloudSetupAnnouncement,
  cloudSetupLongWaitNote,
  cloudSetupMeanwhileNote,
  readCloudSetup,
  type CloudSetupFacts,
} from "./t3team-cloudSessionSetupProgress";
import { SetupLiveReadout, StepList } from "./t3team-CloudSessionSetupParts";
import { useCloudSetupElapsedSeconds } from "./t3team-useCloudSetupElapsedSeconds";

export interface CloudSessionSetupCardProps {
  readonly facts: CloudSetupFacts;
  /** Cancel a waiting first message (the session itself is cancelled from the Run-on menu). */
  readonly onCancel?: (() => void) | undefined;
  /** Retry a first message that could not be delivered. */
  readonly onRetry?: (() => void) | null | undefined;
  /** Start a fresh session after this one failed. */
  readonly onTryAgain?: (() => void) | null | undefined;
  /** A first message is being handed over right now: it can no longer be cancelled. */
  readonly sending?: boolean | undefined;
  /**
   * Freezes the clock at this many seconds since dispatch: for stories and screenshots, which must
   * not drift. Omitted in the app, where the snapshot's own elapsed time runs on.
   */
  readonly frozenElapsedSeconds?: number | undefined;
  /** Force still or live motion (stories); the app follows `prefers-reduced-motion`. */
  readonly motion?: "still" | "live" | undefined;
}

export function CloudSessionSetupCard({
  facts,
  onCancel,
  onRetry,
  onTryAgain,
  sending = false,
  frozenElapsedSeconds,
  motion,
}: CloudSessionSetupCardProps) {
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const motionMode = motion ?? (prefersReducedMotion ? "still" : "live");
  const { session, machineConnected, delivery, sendFailure } = facts;
  const model = buildCloudSessionSetup({
    session,
    machineConnected,
    delivery: delivery ?? "none",
    sendFailure: sendFailure ?? null,
  });
  const elapsedSeconds = useCloudSetupElapsedSeconds(
    session?.elapsedSeconds ?? 0,
    model.stage === "working",
    frozenElapsedSeconds,
  );
  const slow = model.stage === "working" && readCloudSetup(model, elapsedSeconds).slow;
  const longWait = cloudSetupLongWaitNote(model);
  const meanwhile = cloudSetupMeanwhileNote(model);
  const failed = model.stage === "failed";
  return (
    <section
      aria-label="Cloud session setup"
      aria-busy={model.stage === "working"}
      data-cloud-setup-card=""
      data-state={model.stage}
      data-slow={slow ? "true" : "false"}
      data-motion={motionMode}
      data-cloud-setup-step-current={model.currentStep.id}
      className="t3team-setup-card mt-1 mb-2 overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-4 text-card-foreground shadow-xs/5"
    >
      {/* Heard, not seen: one polite line per step change, never per tick. */}
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
                ? "Everything is in place. Send your first message to start."
                : slow
                  ? `Still working: ${model.currentStep.label.toLowerCase()}. This is taking longer than usual.`
                  : model.activity}
          </p>
        </div>
      </div>

      {failed ? null : (
        <div className="mt-3.5">
          <SetupLiveReadout model={model} elapsedSeconds={elapsedSeconds} />
        </div>
      )}

      {failed ? null : (
        <div className="mt-3.5">
          <StepList steps={model.steps} />
        </div>
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

      {failed || onCancel || onRetry ? (
        <div className="mt-3 flex flex-wrap items-center gap-1">
          {failed && onTryAgain ? (
            <Button type="button" size="xs" variant="outline" onClick={onTryAgain}>
              <RotateCcwIcon aria-hidden />
              Try again
            </Button>
          ) : null}
          {onRetry ? (
            <Button type="button" size="xs" variant="outline" onClick={onRetry}>
              <RotateCcwIcon aria-hidden />
              Retry sending
            </Button>
          ) : null}
          {onCancel ? (
            <Button
              type="button"
              size="xs"
              variant="ghost-muted"
              disabled={sending}
              onClick={onCancel}
            >
              <XIcon aria-hidden />
              {sending ? "Sending…" : "Cancel message"}
            </Button>
          ) : null}
          {failed && model.detailsUrl !== null ? (
            <a
              href={model.detailsUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              See what happened
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
