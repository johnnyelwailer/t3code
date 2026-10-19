import { useNavigate } from "@tanstack/react-router";

import { Button } from "../ui/button";
import { SettingsRow, SettingsSection } from "./settingsLayout";

/**
 * "Linked repositories" in a project's settings: the same dialog the sidebar's project menu opens,
 * reached by deep link (`/t3team?manageRepositories=<project id>`) so it runs inside the Team shell
 * that owns the backend and the project store.
 */
export function T3TeamProjectLinkedRepositoriesSetting({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  return (
    <SettingsSection title="Linked repositories">
      <SettingsRow
        title="Repositories"
        description="The code, pull requests and branches this project reads from: choose them, pick the main repository, and watch their sync."
        control={
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void navigate({ to: "/t3team", search: { manageRepositories: projectId } })
            }
          >
            Manage linked repositories
          </Button>
        }
      />
    </SettingsSection>
  );
}
