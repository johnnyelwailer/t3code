/**
 * The host side of a slot a pack can fill: renders every view registered for it, in registration
 * order (host first, then packs in activation order), each in its own `ViewInstance`.
 *
 * With nothing registered it renders nothing at all — no wrapper element, no spacing — so mounting
 * a slot in a panel costs no layout until a view exists. (The Summary slot's padding wrapper is
 * likewise only rendered once there is a view to pad.)
 */
import type { ChangeRequestSummaryProps, MyWorkChangeRequestProps } from "@t3team/pack-ui/contract";

import { appViewRegistry } from "./t3team-appViewRegistry";
import { ViewInstance } from "./t3team-ViewInstance";

type ViewSlotProps =
  | ({ readonly slot: "changeRequest.summary" } & ChangeRequestSummaryProps)
  | ({ readonly slot: "myWork.changeRequest" } & MyWorkChangeRequestProps);

/** Every fact a summary view reads, so a throw over one of them recovers when it changes. */
export function changeRequestSummaryResetKeys(
  changeRequest: ChangeRequestSummaryProps["changeRequest"],
) {
  const { host, repository, number, state, headSha, baseSha, viewerAuthored } = changeRequest;
  return [host, repository, number, state, headSha, baseSha, viewerAuthored];
}

export function ViewSlot(props: ViewSlotProps) {
  const registry = appViewRegistry();
  // The boundary retries when the change request changes, not on every render of the panel that
  // mounts the slot, so the reset keys are primitives.
  const { host, repository, number } = props.changeRequest;
  if (props.slot === "changeRequest.summary") {
    const { changeRequest } = props;
    const resetKeys = changeRequestSummaryResetKeys(changeRequest);
    const entries = registry.list(props.slot);
    if (entries.length === 0) return null;
    // The panel's own padding, applied only when there is something to pad.
    return (
      <div className="space-y-2 px-4 py-1.5">
        {entries.map((entry) => (
          <ViewInstance
            key={entry.id}
            owner={entry.owner}
            resetKeys={resetKeys}
            fallback={
              <p className="text-xs text-muted-foreground">{entry.id} could not be shown.</p>
            }
          >
            <entry.component changeRequest={changeRequest} />
          </ViewInstance>
        ))}
      </div>
    );
  }
  // A chip beside a PR is too small for a notice: a crashed view just goes away.
  const { changeRequest, density } = props;
  return registry.list(props.slot).map((entry) => (
    <ViewInstance
      key={entry.id}
      owner={entry.owner}
      resetKeys={[host, repository, number, density]}
      fallback={null}
    >
      <entry.component changeRequest={changeRequest} density={density} />
    </ViewInstance>
  ));
}
