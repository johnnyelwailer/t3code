import type { CloudSessionProvisionPresentation } from "@t3tools/client-runtime/state/cloud-sessions";

export {
  CLOUD_SESSION_PROVISION_PHASES,
  type CloudSessionProvisionPhase,
  isCloudSessionProvisionPending,
  type CloudSessionProvisionPresentation,
  formatDuration,
  presentCloudSession,
} from "@t3tools/client-runtime/state/cloud-sessions";

export function cloudSessionToneDotClassName(
  tone: CloudSessionProvisionPresentation["tone"],
): string {
  switch (tone) {
    case "ready":
      return "bg-success";
    case "working":
      return "bg-warning";
    case "error":
      return "bg-destructive";
    case "idle":
      return "bg-muted-foreground/40";
  }
}

/** Ping halo while work is in flight; null renders no ping. */
export function cloudSessionTonePingClassName(
  tone: CloudSessionProvisionPresentation["tone"],
): string | null {
  return tone === "working" ? "bg-warning/60 duration-2000" : null;
}
