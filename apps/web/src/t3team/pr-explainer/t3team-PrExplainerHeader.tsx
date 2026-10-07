import type { T3TeamPrExplainer } from "@t3tools/contracts";
import { ClockIcon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";

/** Where the explainer is in its life: still being written, done, or failed. */
export type PrExplainerStatus =
  | { readonly kind: "ready" }
  | { readonly kind: "generating"; readonly expectedSteps: number }
  | { readonly kind: "error"; readonly message: string };

const RISK = {
  low: { label: "Low risk", variant: "success" },
  medium: { label: "Medium risk", variant: "warning" },
  high: { label: "High risk", variant: "error" },
} as const;

export function PrExplainerHeader({ explainer }: { explainer: T3TeamPrExplainer }) {
  const toCheck = explainer.steps.filter((step) => step.kind === "check").length;
  const risk = RISK[explainer.risk];
  return (
    <header className="space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 className="min-w-0 text-sm font-semibold text-foreground">
          <span className="text-muted-foreground tabular-nums">
            #{explainer.pullRequest.number}
          </span>{" "}
          {explainer.pullRequest.title}
        </h2>
        <div className="flex items-center gap-1">
          <Badge variant={risk.variant} size="sm">
            {risk.label}
          </Badge>
          <Badge variant="outline" size="sm">
            <ClockIcon aria-hidden />~{explainer.reviewMinutes} min
          </Badge>
          {toCheck > 0 ? (
            <Badge variant="warning" size="sm">
              <TriangleAlertIcon aria-hidden />
              {toCheck} to check
            </Badge>
          ) : null}
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground/80">TL;DR </span>
        {explainer.summary}
      </p>
    </header>
  );
}

/** One line under the header for anything that is not a finished, current explainer. */
export function PrExplainerStatusBanner({
  explainer,
  status,
  currentHeadSha,
  onRegenerate,
}: {
  explainer: T3TeamPrExplainer;
  status: PrExplainerStatus;
  currentHeadSha?: string | undefined;
  onRegenerate?: (() => void) | undefined;
}) {
  const regenerate = onRegenerate ? (
    <Button variant="outline" size="xs" onClick={onRegenerate}>
      <RefreshCwIcon />
      {status.kind === "error" ? "Try again" : "Regenerate"}
    </Button>
  ) : null;
  if (status.kind === "generating") {
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs"
      >
        <Spinner size="sm" tone="muted" />
        <span>
          Writing step {Math.min(explainer.steps.length + 1, status.expectedSteps)} of ~
          {status.expectedSteps}. You can start now.
        </span>
      </div>
    );
  }
  if (status.kind === "error") {
    return (
      <div
        role="alert"
        className="flex items-center gap-2 rounded-md bg-destructive/8 px-2.5 py-1.5 text-xs text-destructive-foreground"
      >
        <TriangleAlertIcon aria-hidden className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1">{status.message}</span>
        {regenerate}
      </div>
    );
  }
  if (currentHeadSha && currentHeadSha !== explainer.headSha) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-md bg-warning/10 px-2.5 py-1.5 text-xs text-warning-foreground"
      >
        <RefreshCwIcon aria-hidden className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1">
          New push since this explainer (
          <code className="font-mono">{explainer.headSha.slice(0, 7)}</code> →{" "}
          <code className="font-mono">{currentHeadSha.slice(0, 7)}</code>). Some steps may be out of
          date.
        </span>
        {regenerate}
      </div>
    );
  }
  return null;
}
