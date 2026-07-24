import { useNavigate } from "@tanstack/react-router";

import {
  listT3TeamProjectSetupProfiles,
  resolveT3TeamProjectSetupProfileId,
  type T3TeamProjectSetupProfileId,
} from "../../t3team/t3team-projectSetup";
import {
  useT3TeamProjectSetupProfile,
  writeT3TeamProjectSetupProfile,
} from "../../t3team/t3team-projectSetupProfile";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";

export function T3TeamProjectSetupSetting() {
  const navigate = useNavigate();
  const projectSetupProfile = useT3TeamProjectSetupProfile();
  const projectSetupProfiles = listT3TeamProjectSetupProfiles();

  const setProjectSetupProfile = (profileId: T3TeamProjectSetupProfileId) => {
    writeT3TeamProjectSetupProfile(profileId);
  };

  return (
    <div className="mb-8 space-y-4 rounded-xl border bg-card/50 p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">Project workspace</h3>
        <p className="text-sm text-muted-foreground">
          Defaults used when T3 Team creates a managed project workspace.
        </p>
      </div>
      <div className="space-y-2">
        <div className="space-y-1">
          <h4 className="text-sm font-medium">Default project setup</h4>
          <p className="text-xs text-muted-foreground">
            Choose the default profile used when T3 Team creates a managed project workspace.
          </p>
        </div>
        <Select
          value={projectSetupProfile}
          onValueChange={(value) => {
            setProjectSetupProfile(resolveT3TeamProjectSetupProfileId(value ?? undefined));
          }}
        >
          <SelectTrigger className="w-full sm:w-56" aria-label="Default project setup profile">
            <SelectValue>
              {projectSetupProfiles.find((profile) => profile.id === projectSetupProfile)
                ?.title ?? "Product Partner"}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup align="start" alignItemWithTrigger={false}>
            {projectSetupProfiles.map((profile) => (
              <SelectItem hideIndicator key={profile.id} value={profile.id}>
                <div className="space-y-0.5">
                  <div>{profile.title}</div>
                  <div className="text-xs text-muted-foreground">{profile.description}</div>
                </div>
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>

        <div className="space-y-1 border-t pt-4">
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
