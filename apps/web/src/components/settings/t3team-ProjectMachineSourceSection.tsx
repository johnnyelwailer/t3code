import { useAtomValue } from "@effect/atom-react";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, ProjectId, ProjectMachineDiscovery } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";
import { useState } from "react";

import { cloudSessionEnvironment } from "../../state/t3team-cloudSessions";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { SettingResetButton, SettingsRow, SettingsSection } from "./settingsLayout";
import {
  describeMachineSource,
  machineSourceFormValues,
  machineSourceFromForm,
} from "./t3team-projectMachineSourceText";

/**
 * "Machine definition from" in a project's settings: the repository and branch a cloud session's
 * machine (devcontainer, `.nexi/machine.json`) is read from. Empty means the project's own
 * repository at its default branch. The choice is kept by the environment that holds the project.
 */
export function T3TeamProjectMachineSourceSection({
  environmentId,
  projectId,
}: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
}) {
  const result = useAtomValue(
    cloudSessionEnvironment.projectMachine({ environmentId, input: { projectId } }),
  );
  const canWrite = useAtomValue(
    cloudSessionEnvironment.setProjectMachineSource.permissionAtom(environmentId),
  );
  const save = useAtomCommand(cloudSessionEnvironment.setProjectMachineSource, {
    reportFailure: false,
  });
  const [saved, setSaved] = useState<ProjectMachineDiscovery | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const loaded = AsyncResult.value(result);
  const discovery = saved ?? (Option.isSome(loaded) ? loaded.value : null);
  const [form, setForm] = useState<{ repository: string; branch: string } | null>(null);
  const values = form ?? machineSourceFormValues(discovery?.source);

  const run = async (source: ReturnType<typeof machineSourceFromForm>) => {
    setPending(true);
    setError(null);
    const outcome = await save({ environmentId, input: { projectId, source } });
    setPending(false);
    if (outcome._tag === "Success") {
      setSaved(outcome.value);
      setForm(null);
      return;
    }
    const failure = squashAtomCommandFailure(outcome);
    setError(
      typeof failure === "object" && failure !== null && "message" in failure
        ? String(failure.message)
        : "The machine source could not be saved.",
    );
  };

  const locked = pending || !canWrite;
  const customized = discovery?.source?.override != null;
  return (
    <SettingsSection title="Cloud machine">
      <SettingsRow
        title="Machine definition from"
        description={
          <>
            <span className="block">{describeMachineSource(discovery?.source)}</span>
            <span className="block">
              The repository and branch a cloud session reads .nexi/machine.json and the
              devcontainer from. Leave empty for this project's repository at its default branch.
            </span>
            {error === null ? null : <span className="block text-destructive">{error}</span>}
          </>
        }
        resetAction={
          customized ? (
            <SettingResetButton
              label="machine definition source"
              disabled={locked}
              onClick={() => void run(null)}
            />
          ) : null
        }
        control={
          <div className="flex items-center gap-2">
            <Input
              aria-label="Machine definition repository"
              placeholder="owner/repo or https URL"
              value={values.repository}
              disabled={locked}
              onChange={(event) => setForm({ ...values, repository: event.target.value })}
            />
            <Input
              aria-label="Machine definition branch"
              placeholder="default branch"
              value={values.branch}
              disabled={locked}
              onChange={(event) => setForm({ ...values, branch: event.target.value })}
            />
            <Button
              size="sm"
              variant="outline"
              type="button"
              disabled={locked || form === null}
              onClick={() => void run(machineSourceFromForm(values))}
            >
              Save
            </Button>
          </div>
        }
      />
    </SettingsSection>
  );
}
