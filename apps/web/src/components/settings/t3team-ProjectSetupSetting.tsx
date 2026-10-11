import { useNavigate } from "@tanstack/react-router";

import { useT3TeamPackAppearance } from "../../t3team/t3team-packAppearance";
import { useT3TeamWorkProfileChooserEnabled } from "../../t3team/t3team-workProfileChooser";
import { T3TeamProjectSetupProfileSelect } from "./t3team-ProjectSetupProfileSelect";
import { Button } from "../ui/button";

export function T3TeamProjectSetupSetting() {
  const navigate = useNavigate();
  const appearance = useT3TeamPackAppearance();
  const productName = appearance?.labels?.appName ?? "T3 Team";
  // Runtime feature flag (default off): without the chooser nobody picks a profile — everyone
  // works with the developer profile — so the picker would be a control with no decision behind
  // it. The rest of the section (reopening the setup wizard) stands on its own.
  const workProfileChooserEnabled = useT3TeamWorkProfileChooserEnabled();

  return (
    <div className="mb-8 space-y-4 rounded-xl border bg-card/50 p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">Project workspace</h3>
        <p className="text-sm text-muted-foreground">
          Defaults used when {productName} creates a managed project workspace.
        </p>
      </div>
      <div className="space-y-2">
        {workProfileChooserEnabled ? (
          <>
            <div className="space-y-1">
              <h4 className="text-sm font-medium">Default project setup</h4>
              <p className="text-xs text-muted-foreground">
                Choose the default profile used when {productName} creates a managed project
                workspace.
              </p>
            </div>
            <T3TeamProjectSetupProfileSelect />
          </>
        ) : null}

        <div className={`space-y-1 ${workProfileChooserEnabled ? "border-t pt-4" : ""}`}>
          <h4 className="text-sm font-medium">Initial setup wizard</h4>
          <p className="text-xs text-muted-foreground">
            Reopen the first-run welcome flow before stepping through guided Jira setup again.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="w-full justify-center sm:w-fit"
          onClick={() => {
            void navigate({
              to: "/t3team",
              search: { setup: "welcome" },
            });
          }}
        >
          Reopen initial setup
        </Button>
      </div>
    </div>
  );
}
