import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";
import { Skeleton } from "~/t3team/components/ui/t3team-skeleton";
import { T3TeamErrorState } from "~/t3team/components/error/t3team-ErrorState";
import { JiraProjectPickerRow } from "~/t3team/components/t3team-JiraProjectPickerRow";
import { PickerSearchInput } from "~/t3team/components/t3team-PickerSearchInput";
import { PickerSection } from "~/t3team/components/t3team-PickerSection";
import {
  buildCatalogRows,
  spansMultipleSites,
  type CatalogRow,
} from "~/t3team/hooks/t3team-createProjectCatalogRows";
import type { JiraCatalogProject } from "~/t3team/hooks/t3team-jiraProjectCatalog.logic";

/**
 * One search box over every project on every connected Jira site — there is no site step, the
 * site is a property of the row. Projects that can be added come first; the ones the app already
 * has sit under their own heading and open instead of re-adding.
 */
export function JiraProjectPicker({
  catalog,
  boundProjectIds,
  loading,
  error,
  selectedEntryKey,
  onRefresh,
  onChoose,
}: {
  catalog: ReadonlyArray<JiraCatalogProject>;
  boundProjectIds: ReadonlyMap<string, string>;
  loading: boolean;
  error: unknown;
  selectedEntryKey?: string | null;
  onRefresh: () => void;
  onChoose: (row: CatalogRow) => void;
}) {
  const [query, setQuery] = useState("");
  const rows = useMemo(
    () => buildCatalogRows(catalog, boundProjectIds, query),
    [boundProjectIds, catalog, query],
  );
  const showSite = spansMultipleSites(catalog);
  const sites = [...new Set(catalog.map((entry) => entry.siteHost ?? "Jira"))];
  const siteCount = sites.length;
  const noResults = rows.available.length === 0 && rows.added.length === 0;
  const row = (entry: CatalogRow) => (
    <JiraProjectPickerRow
      key={entry.entry.entryKey}
      row={entry}
      showSite={showSite}
      selected={entry.entry.entryKey === selectedEntryKey}
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
          placeholder={
            siteCount > 1 ? `Search projects on ${siteCount} Jira sites` : "Search Jira projects"
          }
        />
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            {sites.map((site) => (
              <span key={site} className="inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-success" />
                {site}
              </span>
            ))}
          </div>
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
          <div className="p-3">
            <T3TeamErrorState error={error} action="loading Jira projects" onRetry={onRefresh} />
          </div>
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

        {noResults && catalog.length > 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No project matches “{query.trim()}”.
          </p>
        ) : null}
        {!loading && !error && catalog.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No projects found on your connected Jira sites.
          </p>
        ) : null}
      </div>
    </div>
  );
}
