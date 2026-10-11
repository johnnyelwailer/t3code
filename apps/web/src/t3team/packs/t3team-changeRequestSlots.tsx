/**
 * Mount points for the change-request slots. The panels that host them hand over what they
 * already hold; the mapping to the contract's `ChangeRequestRef` lives here, once, so no panel
 * knows the shape a pack sees.
 */
import type { PullRequestDetailView, PullRequestRef } from "@t3tools/contracts";
import type { ChangeRequestRef } from "@t3team/pack-ui/contract";

import { ViewSlot } from "./t3team-ViewSlot";

/** The change request's `host` is left out where the host did not name one (github.com). */
function changeRequestRef(ref: {
  readonly repository: string;
  readonly number: number;
  readonly host?: string | undefined;
}): ChangeRequestRef {
  return {
    repository: ref.repository,
    number: ref.number,
    ...(ref.host !== undefined ? { host: ref.host } : {}),
  };
}

/** `changeRequest.summary`: between the Summary tab's meta rows and its Description. */
export function ChangeRequestSummarySlot({
  reference,
  detail,
}: {
  readonly reference: PullRequestRef;
  readonly detail: PullRequestDetailView;
}) {
  const author = detail.author?.login.toLowerCase();
  return (
    <ViewSlot
      slot="changeRequest.summary"
      changeRequest={{
        ...changeRequestRef(reference),
        ...(detail.headSha !== undefined ? { headSha: detail.headSha } : {}),
        ...(detail.baseSha !== undefined ? { baseSha: detail.baseSha } : {}),
        state: detail.state,
        viewerAuthored: author !== undefined && author === detail.viewer?.toLowerCase(),
      }}
    />
  );
}

/** `myWork.changeRequest`: beside a digest chip (`chip`) or a review row's actions (`row`). */
export function MyWorkChangeRequestSlot({
  changeRequest,
  density,
}: {
  readonly changeRequest: {
    readonly repo: string;
    readonly number: number;
    readonly host?: string;
  };
  readonly density: "row" | "chip";
}) {
  return (
    <ViewSlot
      slot="myWork.changeRequest"
      changeRequest={changeRequestRef({
        repository: changeRequest.repo,
        number: changeRequest.number,
        host: changeRequest.host,
      })}
      density={density}
    />
  );
}
