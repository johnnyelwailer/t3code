import { ArrowLeft } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";
import { Spinner } from "~/t3team/components/ui/t3team-spinner";
import { CalmError } from "~/t3team/t3team-CalmError";

export function CreateProjectSetupFooter({
  projectTitle,
  creating,
  error,
  onBack,
  onCreate,
}: {
  projectTitle: string;
  creating: boolean;
  /** Set when the last create attempt failed; `null` otherwise. */
  error: unknown;
  onBack: () => void;
  onCreate: () => void;
}) {
  const failed = error !== null && error !== undefined;
  return (
    <div className="flex shrink-0 flex-col gap-3 border-t border-border bg-card/95 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <Button variant="ghost" onClick={onBack} disabled={creating} className="self-start">
        <ArrowLeft className="size-4" />
        Change project
      </Button>
      <div className="flex flex-1 items-center justify-end gap-3">
        {failed ? (
          <CalmError
            compact
            error={error}
            action={`adding ${projectTitle}`}
            headline={`Couldn't add ${projectTitle}`}
            className="flex-1"
          />
        ) : null}
        <Button onClick={onCreate} disabled={creating}>
          {creating ? <Spinner className="size-4" /> : null}
          {creating ? "Adding…" : failed ? "Try again" : "Add project"}
        </Button>
      </div>
    </div>
  );
}
