import { type EnvironmentId, PROVIDER_DISPLAY_NAMES } from "@t3tools/contracts";
import { useState } from "react";

import { type ServerUpdateTarget, useServerUpdate } from "../ServerUpdateAction";
import { UpdateEntryChip } from "./t3team-UpdateEntryChip";
import { useProviderEntryUpdate } from "./t3team-useProviderEntryUpdate";

function usePendingKeys() {
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const run = (key: string, work: () => Promise<unknown>) => {
    setPending((keys) => new Set(keys).add(key));
    void work().finally(() =>
      setPending((keys) => new Set([...keys].filter((pendingKey) => pendingKey !== key))),
    );
  };
  return { isPending: (key: string) => pending.has(key), run };
}

/** One server's own update, restarting only that server. */
export function ServerUpdateEntry({
  label,
  machineLabel,
  server,
}: {
  readonly label: string;
  readonly machineLabel: string;
  readonly server: ServerUpdateTarget;
}) {
  const updateServer = useServerUpdate();
  const { isPending, run } = usePendingKeys();
  return (
    <UpdateEntryChip
      label={label}
      action={{
        label: `Update ${machineLabel}`,
        icon: "update",
        restartEnvironmentIds: [server.environmentId],
        pending: isPending("server"),
        onClick: () => run("server", () => updateServer(server)),
      }}
    />
  );
}

/** A machine's providers, each with its own update when one is on offer there. */
export function ProviderUpdateEntries({
  environmentId,
  machineLabel,
  providers,
}: {
  readonly environmentId: EnvironmentId | null;
  readonly machineLabel: string;
  readonly providers: ReadonlyArray<string>;
}) {
  const updates = useProviderEntryUpdate();
  const { isPending, run } = usePendingKeys();
  const candidates =
    updates.machines.find((machine) => machine.environmentId === environmentId)?.candidates ?? [];
  return (
    <span className="flex flex-wrap items-start gap-1">
      {providers.map((label) => {
        const candidate = candidates.find(
          (option) => (PROVIDER_DISPLAY_NAMES[option.driver] ?? option.driver) === label,
        );
        if (environmentId === null || candidate === undefined) {
          return <UpdateEntryChip key={label} label={label} action={null} />;
        }
        return (
          <UpdateEntryChip
            key={label}
            label={label}
            action={{
              label: `Update ${label} on ${machineLabel}`,
              icon: "update",
              restartEnvironmentIds: [],
              pending: isPending(candidate.driver),
              onClick: () =>
                run(candidate.driver, () => updates.update(environmentId, machineLabel, candidate)),
            }}
          />
        );
      })}
    </span>
  );
}
