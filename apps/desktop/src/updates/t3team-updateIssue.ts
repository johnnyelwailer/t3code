import type { DesktopUpdateIssue, DesktopUpdateState } from "@t3tools/contracts";

/**
 * The named reason belongs to an error: once the state has no error context (a check started, an
 * update was found, a download began) it is dropped, so a stale "signed out" can never outlive the
 * error it described.
 */
export function withUpdateIssue(
  state: DesktopUpdateState,
  issue: DesktopUpdateIssue | null,
): DesktopUpdateState {
  const { issue: _previous, ...rest } = state;
  return issue === null || state.errorContext === null ? rest : { ...rest, issue };
}
