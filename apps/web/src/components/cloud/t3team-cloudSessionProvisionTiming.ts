import type { CloudSession, CloudSessionTiming } from "@t3tools/contracts";

/** Phase durations measured on fleet run 248523362; shared by every provisioning surface. */
const PHASE_SECONDS = { requested: 4, queued: 10, preparing: 121, starting: 10 };
const TYPICAL_SECONDS = Object.values(PHASE_SECONDS).reduce((total, seconds) => total + seconds, 0);

export function cloudSessionProvisionTiming(session: CloudSession | null): CloudSessionTiming {
  return (
    session?.timing ?? {
      samples: 0,
      scope: "shape",
      readyLowSeconds: TYPICAL_SECONDS,
      readyTypicalSeconds: TYPICAL_SECONDS,
      readyHighSeconds: TYPICAL_SECONDS * 2,
      startsAtSeconds: {
        preparing: PHASE_SECONDS.requested + PHASE_SECONDS.queued,
        starting: TYPICAL_SECONDS - PHASE_SECONDS.starting,
      },
    }
  );
}

export function cloudSessionProvisionProgress(session: CloudSession): number {
  return Math.min(
    1,
    Math.max(
      0,
      session.elapsedSeconds /
        Math.max(1, cloudSessionProvisionTiming(session).readyTypicalSeconds),
    ),
  );
}
