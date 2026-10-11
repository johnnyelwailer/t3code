/**
 * `pack-ui:1` navigation and the host types views speak in. Navigation goes through the host's
 * own routes, so a pack never builds a URL or knows which project holds a repository.
 */
import type { ComposerContextRecord } from "@t3tools/contracts";

export type { ScopedThreadRef } from "@t3tools/contracts";

/** Context a thread message carries (a file, a review comment, a pack-defined record). */
export type MessageContextRecord = ComposerContextRecord;

/**
 * One change request (a pull request, a merge request), in the provider's own repository
 * selector (`owner/name` on GitHub). Never a URL. `host` (`github.com`, an Enterprise host)
 * tells two repositories with one selector apart; without it the first project whose repository
 * matches is used.
 */
export interface ChangeRequestRef {
  readonly repository: string;
  readonly number: number;
  readonly host?: string;
}

export type ChangeRequestTab = "summary" | "timeline" | "code";

export interface PackNavigation {
  /**
   * Opens the change request on the host's change requests page, on `tab` (Summary by default).
   * `false` when no project here holds its repository: the view then offers its own fallback.
   */
  readonly openChangeRequest: (
    ref: ChangeRequestRef,
    options?: { readonly tab?: ChangeRequestTab },
  ) => boolean;
  /**
   * Opens the change request's Code tab focused on `path`. A path the change does not touch
   * opens its first file. `false` as for `openChangeRequest`.
   */
  readonly openInCode: (target: {
    readonly changeRequest: ChangeRequestRef;
    readonly path: string;
  }) => boolean;
}
