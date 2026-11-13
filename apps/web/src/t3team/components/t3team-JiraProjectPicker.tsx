import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";
import { Skeleton } from "~/t3team/components/ui/t3team-skeleton";
import { JiraProjectPickerRow } from "~/t3team/components/t3team-JiraProjectPickerRow";
import { JiraSiteChips } from "~/t3team/components/t3team-jiraSiteChips";
import { PickerSearchInput } from "~/t3team/components/t3team-PickerSearchInput";
import { PickerSection } from "~/t3team/components/t3team-PickerSection";
import {
  buildCatalogRows,
  spansMultipleSites,
  type CatalogRow,
} from "~/t3team/hooks/t3team-createProjectCatalogRows";
import type {
  JiraCatalogProject,
  JiraCatalogSiteFailure,
} from "~/t3team/hooks/t3team-jiraProjectCatalog.logic";
import {
  catalogForJiraSite,
  collectJiraSiteChips,
  shouldShowJiraSiteChips,
  toggleJiraSiteFilter,
} from "~/t3team/hooks/t3team-jiraSiteFilter";
import { CalmError } from "~/t3team/t3team-CalmError";

/**
 * One search box over every project on every connected Jira site. When two or
 * more sites are in play, chips under the search filter the list by source.
 */
export function JiraProjectPicker({
  catalog,
  siteFailures = [],
  boundProjectIds,
  loading,
  error,
  selectedEntryKey,
  onRefresh,
  onChoose,
  roomy = false,
}: {
  catalog: ReadonlyArray<JiraCatalogProject>;
  siteFailures?: ReadonlyArray<JiraCatalogSiteFailure>;
  boundProjectIds: ReadonlyMap<string, string>;
  loading: boolean;
  error: unknown;
  selectedEntryKey?: string | null;
  onRefresh: () => void;
  onChoose: (row: CatalogRow) => void;
  /** Taller rows with a larger avatar, for the full-page add-project screen. */
  roomy?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const chips = useMemo(() => collectJiraSiteChips(catalog, siteFailures), [catalog, siteFailures]);
  const visibleCatalog = useMemo(
    () => catalogForJiraSite(catalog, selectedSite),
    [catalog, selectedSite],
  );
  const rows = useMemo(
    () => buildCatalogRows(visibleCatalog, boundProjectIds, query),
    [boundProjectIds, visibleCatalog, query],
  );
  const showSite = spansMultipleSites(catalog) && selectedSite === null;
  const selectedChip = chips.find((chip) => chip.id === selectedSite) ?? null;
  const noResults = rows.available.length === 0 && rows.added.length === 0;
  const row = (entry: CatalogRow) => (
    <JiraProjectPickerRow
      key={entry.entry.entryKey}
      row={entry}
      showSite={showSite}
      selected={entry.entry.entryKey === selectedEntryKey}
      roomy={roomy}
      onChoose={onChoose}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2.5 px-4 pb-3">
        <PickerSearchInput
          value={query}
          onChange={setQuery}
          label="Search Jira projects"
          placeholder="Search projects"
        />
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <JiraSiteChips
            chips={shouldShowJiraSiteChips(chips) ? chips : []}
            selectedId={selectedSite}
            onToggle={(id) => setSelectedSite((current) => toggleJiraSiteFilter(current, id))}
            onRetry={onRefresh}
          />
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh projects"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border px-2 pb-2">
        {loading && catalog.length === 0 ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2, 3, 4].map((index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : null}

        {error && catalog.length === 0 ? (
          <CalmError
            error={error}
            action="loading Jira projects"
            headline="Couldn't reach Jira"
            retryLabel="Retry"
            onRetry={onRefresh}
          />
        ) : null}

        {rows.available.length > 0 ? (
          <PickerSection title="Projects" count={rows.available.length}>
            {rows.available.map(row)}
          </PickerSection>
        ) : null}
        {rows.added.length > 0 ? (
          <PickerSection title="Already added" count={rows.added.length}>
            {rows.added.map(row)}
          </PickerSection>
        ) : null}

        {noResults && (visibleCatalog.length > 0 || selectedChip) && query.trim() ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No project matches “{query.trim()}”{selectedChip ? ` on ${selectedChip.label}` : ""}.
          </p>
        ) : null}
        {noResults && !query.trim() && selectedChip ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No projects on {selectedChip.label}.
          </p>
        ) : null}
        {!loading && !error && catalog.length === 0 && !selectedChip ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No projects found on your connected Jira sites.
          </p>
        ) : null}
      </div>
    </div>
  );
}
