import { ArrowLeft } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";
import { DialogFooter } from "~/t3team/components/ui/t3team-dialog";
import { Spinner } from "~/t3team/components/ui/t3team-spinner";

export function CreateProjectSetupFooter({
  creating,
  failed,
  onBack,
  onCreate,
}: {
  creating: boolean;
  failed: boolean;
  onBack: () => void;
  onCreate: () => void;
}) {
  return (
    <DialogFooter className="items-center sm:justify-between">
      <Button variant="ghost" onClick={onBack} disabled={creating}>
        <ArrowLeft className="size-4" />
        Change project
      </Button>
      <div className="flex items-center gap-3">
        {creating ? (
          <span className="text-xs text-muted-foreground">
            Setting up the workspace — keep this window open.
          </span>
        ) : null}
        <Button onClick={onCreate} disabled={creating}>
          {creating ? <Spinner className="size-4" /> : null}
          {creating ? "Adding…" : failed ? "Try again" : "Add project"}
        </Button>
      </div>
    </DialogFooter>
  );
}
