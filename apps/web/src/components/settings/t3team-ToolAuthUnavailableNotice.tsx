"use client";

import { cn } from "../../lib/utils";
import { toolAuthFailureCopy } from "../../state/t3team-toolAuthFailureMessage";
import type { ToolAuthToolMeta } from "./t3team-toolAuthTools";

/**
 * Shown in place of the card when the TARGET machine cannot run a sign-in at all. An Install
 * button that the machine is configured to refuse is worse than no button: it reads as broken.
 *
 * @module components/settings/ToolAuthUnavailableNotice
 */
export function ToolAuthUnavailableNotice({
  meta,
  machineLabel,
  className,
}: {
  readonly meta: ToolAuthToolMeta;
  readonly machineLabel: string;
  readonly className?: string | undefined;
}) {
  const copy = toolAuthFailureCopy("featureDisabled", { label: meta.label, machine: machineLabel });
  const Icon = meta.icon;
  return (
    <div
      data-testid="toolauth-unavailable"
      className={cn("flex flex-col gap-1.5 px-4 py-3.5 sm:px-5", className)}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="size-4 shrink-0" aria-hidden />
        <h3 className="truncate text-sm font-semibold text-foreground">{meta.label}</h3>
      </div>
      <p className="text-xs text-muted-foreground/80">{copy.message}</p>
      {copy.nextStep ? <p className="text-2xs text-muted-foreground">{copy.nextStep}</p> : null}
    </div>
  );
}
