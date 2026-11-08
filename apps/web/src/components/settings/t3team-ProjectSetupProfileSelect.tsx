import { useRef, useState } from "react";

import { T3TeamRichChoice } from "../../t3team/rich-choice/t3team-RichChoice";
import { toProfileRichChoiceOptions } from "../../t3team/rich-choice/t3team-profileRichChoiceOptions";
import { useT3TeamPackSetupProfiles } from "../../t3team/t3team-packSetupProfiles";
import { resolveT3TeamProjectSetupProfileId } from "../../t3team/t3team-projectSetup";
import { listT3TeamProjectSetupCardOptions } from "../../t3team/t3team-projectSetupProfileCatalog";
import {
  useT3TeamProjectSetupProfile,
  writeT3TeamProjectSetupProfile,
} from "../../t3team/t3team-projectSetupProfile";
import { Button } from "../ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogPopup, DialogTitle } from "../ui/dialog";

/**
 * The default-setup-profile picker, split out so it disappears with `WORK_PROFILE_CHOOSER`.
 * Changing the role opens the shared rich-choice carousel.
 */
export function T3TeamProjectSetupProfileSelect() {
  const projectSetupProfile = useT3TeamProjectSetupProfile();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Pack profiles replace the bundled catalog; reading the bundled list offered roles the distribution does not ship.
  const cards = listT3TeamProjectSetupCardOptions(useT3TeamPackSetupProfiles());
  const current = cards.find((card) => card.id === projectSetupProfile) ?? cards[0];

  return (
    <>
      <Button
        ref={triggerRef}
        variant="outline"
        className="w-full justify-between sm:w-56"
        aria-label="Default project setup profile"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span className="truncate">{current?.title}</span>
        <span className="text-xs text-muted-foreground">Change</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup className="max-w-3xl" finalFocus={triggerRef}>
          <DialogHeader>
            <DialogTitle>Who are you, and how do you want to work?</DialogTitle>
            <DialogDescription>
              The role steers recipes, lens and communication style. You can change it any time.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6">
            <T3TeamRichChoice
              prompt="Choose your role"
              options={toProfileRichChoiceOptions(cards)}
              defaultId={current?.id}
              selectedIds={current ? [current.id] : []}
              onChoose={([id]) => {
                writeT3TeamProjectSetupProfile(resolveT3TeamProjectSetupProfileId(id));
                setOpen(false);
              }}
            />
          </div>
        </DialogPopup>
      </Dialog>
    </>
  );
}
