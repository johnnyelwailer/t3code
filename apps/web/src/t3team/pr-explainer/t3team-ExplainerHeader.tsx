import type { T3TeamExplainer } from "./model/t3team-explainer";
import {
  Badge,
  Button,
  ClockIcon,
  GitBranchIcon,
  RefreshCwIcon,
  Spinner,
  TriangleAlertIcon,
} from "./t3team-explainerHostKit";

/** Where the explainer is in its life: still being written, done, or failed. */
export type ExplainerStatus =
  | { readonly kind: "ready" }
  | { readonly kind: "generating"; readonly expectedSteps: number }
  | { readonly kind: "error"; readonly message: string };

const RISK = {
  low: { label: "Low risk", variant: "success" },
  medium: { label: "Medium risk", variant: "warning" },
  high: { label: "High risk", variant: "error" },
} as const;

/** The title line, by subject: a PR names its number; anything else its own title. */
function SubjectTitle({ subject }: { subject: T3TeamExplainer["subject"] }) {
  switch (subject.kind) {
    case "pr":
      return (
        <>
          <span className="text-muted-foreground tabular-nums">#{subject.number}</span>{" "}
          {subject.title}
        </>
      );
    case "branch":
      return (
        <>
          <GitBranchIcon aria-hidden className="mr-1 inline size-3.5 text-muted-foreground" />
          {subject.title ?? subject.name}
        </>
      );
    case "files":
    case "concept":
      return subject.title;
  }
}

export function ExplainerHeader({ explainer }: { explainer: T3TeamExplainer }) {
  const toCheck = explainer.steps.filter((step) => step.kind === "check").length;
  const risk = explainer.risk ? RISK[explainer.risk] : null;
  return (
    <header className="space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 className="min-w-0 text-sm font-semibold text-foreground">
          <SubjectTitle subject={explainer.subject} />
        </h2>
        <div className="flex items-center gap-1">
          {risk ? (
            <Badge variant={risk.variant} size="sm">
              {risk.label}
            </Badge>
          ) : null}
          {explainer.reviewMinutes ? (
            <Badge variant="outline" size="sm">
              <ClockIcon aria-hidden />~{explainer.reviewMinutes} min
            </Badge>
          ) : null}
          {toCheck > 0 ? (
            <Badge variant="warning" size="sm">
              <TriangleAlertIcon aria-hidden />
              {toCheck} to check
            </Badge>
          ) : null}
        </div>
      </div>
      <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground/80">TL;DR </span>
        {explainer.summary}
      </p>
    </header>
  );
}

/** One line under the header for anything that is not a finished, current explainer. */
export function ExplainerStatusBanner({
  explainer,
  status,
  currentHeadSha,
  onRegenerate,
}: {
  explainer: T3TeamExplainer;
  status: ExplainerStatus;
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
  if (explainer.headSha && currentHeadSha && currentHeadSha !== explainer.headSha) {
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
