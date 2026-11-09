import { ResourcePressureThresholds } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useState } from "react";

import { usePrimarySettings } from "../../hooks/useSettings";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { useFeatureFlag } from "../../t3team/t3team-useFeatureFlag";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { SettingsSection } from "./settingsLayout";

const FIELDS = [
  ["warningAvailableGiB", "Warning headroom cap (GiB)"],
  ["warningRamPercent", "Warning headroom (% of RAM)"],
  ["criticalAvailableGiB", "Critical headroom cap (GiB)"],
  ["criticalRamPercent", "Critical headroom (% of RAM)"],
  ["recoveryGiB", "Recovery margin cap (GiB)"],
  ["recoveryRamPercent", "Recovery margin (% of RAM)"],
  ["noticeUsageWarnPercent", "Agent note: usage warning (% of limit)"],
  ["noticeUsageCriticalPercent", "Agent note: usage critical (% of limit)"],
  ["noticeProcessCpuPercent", "Agent note: job CPU (% of one core, for 10 s)"],
  ["noticeProcessRssWarnGiB", "Agent note: job memory warning (GiB)"],
  ["noticeProcessRssCriticalGiB", "Agent note: job memory critical (GiB)"],
  ["noticeHostCpuPercent", "Agent note: machine CPU (%)"],
  ["noticeQuietMinutes", "Agent note: quiet time between repeats (minutes)"],
] as const;

const isThresholds = Schema.is(ResourcePressureThresholds);

export function PressureThresholdForm({
  saved,
  onSave,
}: {
  readonly saved: ResourcePressureThresholds;
  readonly onSave: (value: ResourcePressureThresholds) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Partial<ResourcePressureThresholds>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const values = { ...saved, ...draft };
  const valid = isThresholds(values);
  const changed = FIELDS.some(([key]) => values[key] !== saved[key]);
  const save = () => {
    setPending(true);
    setError(false);
    void onSave(values)
      .then(
        (ok) => {
          setError(!ok);
          if (ok)
            setDraft((current) => {
              const next = { ...current };
              for (const [key] of FIELDS) if (next[key] === values[key]) delete next[key];
              return next;
            });
        },
        () => setError(true),
      )
      .finally(() => setPending(false));
  };
  return (
    <SettingsSection title="Experimental pressure and agent-note thresholds">
      <p className="text-xs text-muted-foreground">
        Each threshold uses the smaller of its GiB cap and RAM percentage. Recovery requires two
        samples above the threshold plus its margin. Changes apply on the next sample.
      </p>
      {FIELDS.map(([key, label]) => (
        <label key={key} className="flex items-center justify-between gap-4 text-sm">
          {label}
          <Input
            type="number"
            min={0.1}
            step={0.1}
            className="w-24"
            value={values[key]}
            onChange={(event) => setDraft({ ...draft, [key]: Number(event.target.value) })}
          />
        </label>
      ))}
      {!valid ? (
        <p role="alert" className="text-xs text-destructive">
          Use positive values. Warning headroom must exceed critical headroom.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          Could not save thresholds. Your edits are kept; try again.
        </p>
      ) : null}
      <Button size="sm" disabled={!valid || !changed || pending} onClick={save}>
        {pending ? "Saving…" : "Save thresholds"}
      </Button>
    </SettingsSection>
  );
}

export function PressureThresholdSettings() {
  const enabled = useFeatureFlag("RESOURCE_PRESSURE");
  const saved = usePrimarySettings((settings) => settings.resourcePressureThresholds);
  const environmentId = usePrimaryEnvironmentId();
  const update = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  return enabled ? (
    <PressureThresholdForm
      saved={saved}
      onSave={async (resourcePressureThresholds) => {
        if (environmentId === null) return false;
        const result = await update({
          environmentId,
          input: { patch: { resourcePressureThresholds } },
        });
        return result._tag === "Success";
      }}
    />
  ) : null;
}
