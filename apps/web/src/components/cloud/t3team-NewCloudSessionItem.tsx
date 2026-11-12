import type { EnvironmentId, ProjectId, ProjectMachineDiscovery } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";
import { CloudIcon } from "lucide-react";

import { cn } from "../../lib/utils";
import { cloudSessionEnvironment } from "../../state/t3team-cloudSessions";
import { CloudSessionMachineHint } from "./t3team-CloudSessionMachineHint";
import { cloudSessionMachineChoice } from "./t3team-cloudSessionMachineChoice";
import { NEW_CLOUD_SESSION_LABEL } from "./t3team-runOnSelection";

type CloudSessionProject = { readonly environmentId: EnvironmentId; readonly projectId: ProjectId };

/**
 * The composer's project lives only on other (cloud) machines. Starting a session here would give
 * it no project at all, so the row says so and offers the clone instead.
 */
export interface CloudProjectNotHere {
  readonly onClone: (() => void) | undefined;
}

export const CLOUD_PROJECT_NOT_HERE_HINT =
  "This project isn't on this computer yet, so a new cloud session would start without it.";

export interface NewCloudSessionItemProps {
  readonly project: CloudSessionProject | undefined;
  /** A create is in flight; `setupPending` says it is the setup kind. */
  readonly pending: boolean;
  readonly setupPending: boolean;
  readonly onCreate: () => void;
  /** Present only with the setup flag on: a project with no machine starts a setup session. */
  readonly onSetup?: (() => void) | undefined;
  readonly notHere?: CloudProjectNotHere | null | undefined;
}

/**
 * "New cloud session" in the Run-on menu. For a project it reads the machine discovery the hint
 * already loads and does one of three things (`cloudSessionMachineChoice`): start, refuse while a
 * committed definition needs fixing, or start a session that sets the machine up.
 */
export function NewCloudSessionItem(props: NewCloudSessionItemProps) {
  if (props.notHere) return <NotHereRow {...props} notHere={props.notHere} />;
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

/**
 * Quiet and never modal: the row states what a session would be missing and offers the clone as an
 * inline click. It starts nothing — a bare session is only ever something the user asks for.
 */
function NotHereRow({ notHere }: NewCloudSessionItemProps & { notHere: CloudProjectNotHere }) {
  return (
    <div className="flex w-full items-start gap-1.5 rounded-sm px-2 py-1.5 text-muted-foreground sm:text-sm">
      <CloudIcon className="mt-0.5 size-3 shrink-0 self-start" aria-hidden="true" />
      <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
        <span>{NEW_CLOUD_SESSION_LABEL}</span>
        <span className="max-w-full text-xs">{CLOUD_PROJECT_NOT_HERE_HINT}</span>
        {notHere.onClone === undefined ? null : (
          <button
            type="button"
            onClick={notHere.onClone}
            className="cursor-pointer text-xs underline underline-offset-2 hover:text-foreground"
          >
            Add it to this computer
          </button>
        )}
      </span>
    </div>
  );
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
    : NEW_CLOUD_SESSION_LABEL;
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
