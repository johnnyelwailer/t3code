import type { ReactNode } from "react";

import { JiraProjectPicker } from "~/t3team/components/t3team-JiraProjectPicker";
import { DialogDescription, DialogHeader, DialogTitle } from "~/t3team/components/ui/t3team-dialog";
import type { CatalogRow } from "~/t3team/hooks/t3team-createProjectCatalogRows";
import type { JiraCatalogState } from "~/t3team/hooks/t3team-useJiraProjectCatalogState";

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
    <>
      <DialogHeader>
        <DialogTitle>Add a Jira project</DialogTitle>
        <DialogDescription>
          {props.notice ??
            (needsConnect
              ? "Connect Jira to choose a project."
              : "Pick one — you can link repositories next.")}
        </DialogDescription>
      </DialogHeader>
      {needsConnect ? (
        props.connectPanel
      ) : (
        <JiraProjectPicker
          catalog={catalogState.catalog}
          boundProjectIds={props.boundProjectIds}
          loading={catalogState.loading}
          error={catalogState.error}
          onRefresh={() => void catalogState.refresh()}
          onChoose={props.onChoose}
        />
      )}
    </>
  );
}
