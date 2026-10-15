import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { useMemo, useState } from "react";

import { environmentCatalog } from "../../connection/catalog";
import { useWorkspaceEnvironments } from "../../state/workspace";
import { cloudSessionLaunchers } from "./t3team-cloudSessionLaunchers";

/** Which connected machine starts the phone's cloud sessions: the user's pick, else the first. */
export function useCloudSessionLauncher() {
  const catalog = useAtomValue(environmentCatalog.catalogValueAtom);
  const environments = useWorkspaceEnvironments();
  const launchers = useMemo(
    () => cloudSessionLaunchers(catalog, environments),
    [catalog, environments],
  );
  const [chosen, choose] = useState<EnvironmentId | null>(null);
  const launcher =
    launchers.find((candidate) => candidate.environmentId === chosen) ?? launchers[0] ?? null;
  return { launchers, launcher, choose };
}
