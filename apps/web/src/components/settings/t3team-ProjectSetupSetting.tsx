import { useNavigate } from "@tanstack/react-router";

import { useT3TeamPackAppearance } from "../../t3team/t3team-packAppearance";
import { useT3TeamPackSetupProfiles } from "../../t3team/t3team-packSetupProfiles";
import {
  resolveT3TeamProjectSetupProfileId,
  type T3TeamProjectSetupProfileId,
} from "../../t3team/t3team-projectSetup";
import { listT3TeamProjectSetupCardOptions } from "../../t3team/t3team-projectSetupProfileCatalog";
import {
  useT3TeamProjectSetupProfile,
  writeT3TeamProjectSetupProfile,
} from "../../t3team/t3team-projectSetupProfile";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";

export function T3TeamProjectSetupSetting() {
  const navigate = useNavigate();
  const projectSetupProfile = useT3TeamProjectSetupProfile();
  // Same catalog the setup wizard renders: pack-contributed profiles replace the
  // bundled ones. Reading the bundled list here made Settings offer profiles the
  // distribution does not ship (and label the selection "Product Partner").
  const projectSetupProfiles = listT3TeamProjectSetupCardOptions(useT3TeamPackSetupProfiles());
  const appearance = useT3TeamPackAppearance();
  const productName = appearance?.labels?.appName ?? "T3 Team";

  const setProjectSetupProfile = (profileId: T3TeamProjectSetupProfileId) => {
    writeT3TeamProjectSetupProfile(profileId);
  };

  return (
    <div className="mb-8 space-y-4 rounded-xl border bg-card/50 p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">Project workspace</h3>
        <p className="text-sm text-muted-foreground">
          Defaults used when {productName} creates a managed project workspace.
        </p>
      </div>
      <div className="space-y-2">
        <div className="space-y-1">
          <h4 className="text-sm font-medium">Default project setup</h4>
          <p className="text-xs text-muted-foreground">
            Choose the default profile used when {productName} creates a managed project workspace.
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
              {projectSetupProfiles.find((profile) => profile.id === projectSetupProfile)?.title ??
                projectSetupProfiles[0]?.title}
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
