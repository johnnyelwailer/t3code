import type { EnvironmentId, ProjectId, ProjectMachineDiscovery } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";
import { CloudIcon } from "lucide-react";

import { cn } from "../../lib/utils";
import { cloudSessionEnvironment } from "../../state/t3team-cloudSessions";
import { CloudSessionMachineHint } from "./t3team-CloudSessionMachineHint";
import { cloudSessionMachineChoice } from "./t3team-cloudSessionMachineChoice";

type CloudSessionProject = { readonly environmentId: EnvironmentId; readonly projectId: ProjectId };

export interface NewCloudSessionItemProps {
  readonly project: CloudSessionProject | undefined;
  /** A create is in flight; `setupPending` says it is the setup kind. */
  readonly pending: boolean;
  readonly setupPending: boolean;
  readonly onCreate: () => void;
  /** Present only with the setup flag on: a project with no machine starts a setup session. */
  readonly onSetup?: (() => void) | undefined;
}

/**
 * "New cloud session" in the Run-on menu. For a project it reads the machine discovery the hint
 * already loads and does one of three things (`cloudSessionMachineChoice`): start, refuse while a
 * committed definition needs fixing, or start a session that sets the machine up.
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
  discovery,
}: NewCloudSessionItemProps & { readonly discovery: ProjectMachineDiscovery | null }) {
  const choice = cloudSessionMachineChoice({ discovery, setupEnabled: onSetup !== undefined });
  const blocked = pending || choice === "fix";
  const title = pending
    ? setupPending
      ? "Starting the session…"
      : "Requesting a machine…"
    : "New cloud session";
  const detail = pending ? (
    "Asking the fleet; this takes a few seconds"
  ) : choice === "setup" ? (
    "No machine yet; set up when your task needs one"
  ) : project ? (
    <CloudSessionMachineHint {...project} />
  ) : null;
  return (
    // Mouse-only on purpose: dispatching a VM is a real cost, so this row is outside the
    // arrow-key focus order (finding: one Enter must not provision a machine).
    <button
      type="button"
      disabled={blocked}
      aria-busy={pending}
      onClick={() => (choice === "setup" ? onSetup?.() : onCreate())}
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
        {detail === null ? null : (
          <span className="max-w-full truncate text-muted-foreground text-xs">{detail}</span>
        )}
      </span>
    </button>
  );
}
