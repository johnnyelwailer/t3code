import type { ProjectMainRepositoryCandidate } from "@t3tools/contracts";

import { parseRepositoryLabel } from "~/t3team/components/t3team-linkedRepositories";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/t3team/components/ui/t3team-select";

const PROJECT_WORKSPACE_VALUE = "__project-workspace__";

/**
 * Picks the project's main repository among its linked repositories: the chosen checkout becomes
 * the shared workspace and holds the project state. Clones that already carry project state are
 * marked, since auto-detection leaves the choice to the user when there is more than one.
 */
export function MainRepositoryPicker({
  repositoryUrls,
  candidates,
  value,
  onChange,
  disabled,
}: {
  readonly repositoryUrls: ReadonlyArray<string>;
  readonly candidates: ReadonlyArray<ProjectMainRepositoryCandidate>;
  /** `null` = the project's own workspace. */
  readonly value: string | null;
  readonly onChange: (url: string | null) => void;
  readonly disabled?: boolean;
}) {
  // Candidate URLs are the linked URLs as entered, round-tripped through the reference manifest.
  const hasState = (url: string) => candidates.some((candidate) => candidate.url === url);
  const label = (url: string | null) =>
    url === null
      ? "Project workspace"
      : `${parseRepositoryLabel(url)}${hasState(url) ? " · has project state" : ""}`;
  const needsChoice = value === null && candidates.length > 1;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Main repository</h3>
      <p className="text-xs text-muted-foreground">
        The main repository's checkout becomes the project workspace and holds the project state.
        Changing it copies the state over; the previous location is kept.
      </p>
      {needsChoice ? (
        <p className="text-xs text-warning-foreground">
          Several linked repositories already carry project state. Pick the main one.
        </p>
      ) : null}
      <Select
        value={value ?? PROJECT_WORKSPACE_VALUE}
        onValueChange={(next) => onChange(!next || next === PROJECT_WORKSPACE_VALUE ? null : next)}
      >
        <SelectTrigger size="sm" aria-label="Main repository" disabled={disabled}>
          <SelectValue>{label(value)}</SelectValue>
        </SelectTrigger>
        <SelectPopup>
          <SelectItem value={PROJECT_WORKSPACE_VALUE}>{label(null)}</SelectItem>
          {repositoryUrls.map((url) => (
            <SelectItem key={url} value={url}>
              {label(url)}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </div>
  );
}
