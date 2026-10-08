import type { ReactNode } from "react";

import { JiraProjectPicker } from "~/t3team/components/t3team-JiraProjectPicker";
import type { CatalogRow } from "~/t3team/hooks/t3team-createProjectCatalogRows";
import type { JiraCatalogState } from "~/t3team/hooks/t3team-useJiraProjectCatalogState";
import { CalmNotice } from "~/t3team/t3team-CalmNotice";

export type CreateProjectChooseStepProps = {
  catalogState: Pick<JiraCatalogState, "catalog" | "loading" | "connected" | "error" | "refresh">;
  boundProjectIds: ReadonlyMap<string, string>;
  /** Shown instead of the usual hint, e.g. when a deep link named a project that is gone. */
  notice?: string | undefined;
  /** The "connect Jira" panel, rendered in place of the list while no site is connected. */
  connectPanel: ReactNode;
  onChoose: (row: CatalogRow) => void;
};

/** Screen one: pick the Jira project. The site is never asked — it comes with the project. */
export function CreateProjectChooseStep(props: CreateProjectChooseStepProps) {
  const { catalogState } = props;
  const needsConnect = catalogState.connected === false && catalogState.catalog.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 pt-4">
      {props.notice ? <CalmNotice compact headline={props.notice} className="px-1" /> : null}
      {needsConnect ? (
        props.connectPanel
      ) : (
        <JiraProjectPicker
          roomy
          catalog={catalogState.catalog}
          boundProjectIds={props.boundProjectIds}
          loading={catalogState.loading}
          error={catalogState.error}
          onRefresh={() => void catalogState.refresh()}
          onChoose={props.onChoose}
        />
      )}
    </div>
  );
}
