import type { EnvironmentId, ProjectId, ProjectMachineDiscovery } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";
import { CloudIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "../../lib/utils";
import { cloudSessionEnvironment } from "../../state/t3team-cloudSessions";
import { Button } from "../ui/button";
import { CloudSessionMachineHint } from "./t3team-CloudSessionMachineHint";
import { cloudSessionMachineChoice } from "./t3team-cloudSessionMachineChoice";

type CloudSessionProject = { readonly environmentId: EnvironmentId; readonly projectId: ProjectId };

export interface NewCloudSessionItemProps {
  readonly project: CloudSessionProject | undefined;
  /** A create is in flight; `setupPending` says it is the setup kind. */
  readonly pending: boolean;
  readonly setupPending: boolean;
  readonly onCreate: () => void;
  /** Present only with the setup flag on: "Yes" starts the setup session. */
  readonly onSetup?: (() => void) | undefined;
  /** "No" for this project: remembered, then a plain session starts. */
  readonly onDecline?: (() => void) | undefined;
  readonly declined: boolean;
}

/**
 * "New cloud session" in the Run-on menu. For a project it reads the machine discovery the hint
 * already loads and does one of three things (`cloudSessionMachineChoice`): start, refuse while a
 * committed definition needs fixing, or ask once whether to set up a machine.
 */
export function NewCloudSessionItem(props: NewCloudSessionItemProps) {
  if (props.project === undefined) return <CreateRow {...props} discovery={null} />;
  return <ProjectCreateRow {...props} project={props.project} />;
}

function ProjectCreateRow(props: NewCloudSessionItemProps & { project: CloudSessionProject }) {
  const result = useAtomValue(
    cloudSessionEnvironment.projectMachine({
      environmentId: props.project.environmentId,
      input: { projectId: props.project.projectId },
    }),
  );
  const discovery = AsyncResult.value(result);
  return <CreateRow {...props} discovery={Option.getOrNull(discovery)} />;
}

function CreateRow({
  project,
  pending,
  setupPending,
  onCreate,
  onSetup,
  onDecline,
  declined,
  discovery,
}: NewCloudSessionItemProps & { readonly discovery: ProjectMachineDiscovery | null }) {
  const [asking, setAsking] = useState(false);
  const choice = cloudSessionMachineChoice({
    discovery,
    setupEnabled: onSetup !== undefined,
    declined,
  });
  const blocked = pending || choice === "fix";
  // A project that was answered "No" would be asked again if it had not been.
  const reopenable =
    declined &&
    onSetup !== undefined &&
    cloudSessionMachineChoice({ discovery, setupEnabled: true, declined: false }) === "ask";
  const title = pending
    ? setupPending
      ? "Starting the setup session…"
      : "Requesting a machine…"
    : "New cloud session";
  return (
    <div className="flex flex-col">
      {/* Mouse-only on purpose: dispatching a VM is a real cost, so this row is outside the
          arrow-key focus order (finding: one Enter must not provision a machine). */}
      <button
        type="button"
        disabled={blocked}
        aria-busy={pending}
        aria-expanded={choice === "ask" ? asking : undefined}
        onClick={() => (choice === "ask" ? setAsking((open) => !open) : onCreate())}
        className={cn(
          "flex w-full items-start gap-1.5 rounded-sm px-2 py-1.5 text-foreground sm:text-sm",
          blocked ? "cursor-default text-muted-foreground" : "cursor-pointer hover:bg-muted",
        )}
      >
        <CloudIcon
          className={cn("mt-0.5 size-3 shrink-0 self-start", pending && "animate-pulse")}
          aria-hidden="true"
        />
        <span className="flex min-w-0 flex-col items-start text-left">
          <span>{title}</span>
          {pending ? (
            <span className="max-w-full truncate text-muted-foreground text-xs">
              Asking the fleet; this takes a few seconds
            </span>
          ) : project ? (
            <span className="max-w-full truncate text-muted-foreground text-xs">
              <CloudSessionMachineHint {...project} />
            </span>
          ) : null}
        </span>
      </button>
      {/* The way back from a remembered "No": setting up stays one click away, just quieter. */}
      {reopenable && !pending ? (
        <button
          type="button"
          onClick={onSetup}
          className="cursor-pointer px-2 pb-1.5 pl-6.5 text-left text-muted-foreground text-xs hover:text-foreground"
        >
          Set up a machine instead
        </button>
      ) : null}
      {asking && choice === "ask" && !pending ? (
        <div className="flex flex-col gap-1.5 px-2 pb-1.5 pl-6.5 text-xs">
          <span className="text-muted-foreground">
            This project has no machine yet. Set one up? An agent writes it and opens a change
            request.
          </span>
          <span className="flex gap-1.5">
            <Button size="xs" onClick={() => onSetup?.()}>
              Set one up
            </Button>
            <Button size="xs" variant="ghost" onClick={() => onDecline?.()}>
              No, start plain
            </Button>
          </span>
        </div>
      ) : null}
    </div>
  );
}
