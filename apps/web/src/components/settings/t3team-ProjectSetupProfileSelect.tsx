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
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";

/**
 * The default-setup-profile picker. Split out of `t3team-ProjectSetupSetting.tsx` so the whole
 * control — including the profile state it reads — disappears with the `WORK_PROFILE_CHOOSER`
 * flag rather than being hidden around live hooks.
 */
export function T3TeamProjectSetupProfileSelect() {
  const projectSetupProfile = useT3TeamProjectSetupProfile();
  // Same catalog the setup wizard renders: pack-contributed profiles replace the
  // bundled ones. Reading the bundled list here made Settings offer profiles the
  // distribution does not ship (and label the selection "Product Partner").
  const projectSetupProfiles = listT3TeamProjectSetupCardOptions(useT3TeamPackSetupProfiles());

  const setProjectSetupProfile = (profileId: T3TeamProjectSetupProfileId) => {
    writeT3TeamProjectSetupProfile(profileId);
  };

  return (
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
  );
}
