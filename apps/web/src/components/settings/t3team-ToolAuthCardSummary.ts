import type { ToolAuthState } from "@t3tools/contracts";

/** Dot color per phase, same token classes `providerStatus.ts` uses. */
export const PHASE_DOT_CLASS: Record<ToolAuthState["phase"], string> = {
  idle: "bg-muted-foreground/40",
  installing: "bg-warning",
  starting: "bg-warning",
  "awaiting-open": "bg-warning",
  "awaiting-code": "bg-warning",
  verifying: "bg-warning",
  connected: "bg-success",
  failed: "bg-destructive",
  expired: "bg-destructive",
};

export function expiryLabel(expiresAt: number | undefined): string | null {
  if (expiresAt === undefined) return null;
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return null;
  return `Expires ${date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`;
}

/** Account and organization are independent and usually both absent. Degrade to "Connected", not a dangling separator. Never present authMethod/apiProvider as an account. */
export function connectedSummary(state: ToolAuthState | undefined): string {
  const account = state?.account?.trim();
  const organization = state?.organization?.trim();
  if (account && organization) return `Signed in as ${account} · ${organization}`;
  if (account) return `Signed in as ${account}`;
  if (organization) return `Signed in · ${organization}`;
  return "Connected";
}

/** Missing configured binary and expired: Retry is Connect, not Install. */
export function toolAuthCardActionKind(
  phase: ToolAuthState["phase"] | undefined,
  reason: ToolAuthState["reason"],
): "connect" | "install-or-connect" {
  if (phase === "expired" || reason === "configuredBinaryMissing") return "connect";
  return "install-or-connect";
}
