import { useAtomValue } from "@effect/atom-react";
import type { FeatureFlagsView } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useState } from "react";

import { usePrimaryEnvironmentId } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";

export interface FeatureFlagsSettingsController {
  readonly view: FeatureFlagsView | null;
  readonly loadError: string | null;
  readonly canEdit: boolean;
  /** Keys with a request in flight, and the value it sends (`null` = reset). */
  readonly pending: ReadonlyMap<string, boolean | null>;
  /** The last failed request per key, cleared when the key is tried again. */
  readonly errors: ReadonlyMap<string, string>;
  readonly setEnabled: (key: string, enabled: boolean) => void;
  readonly reset: (key: string) => void;
}

interface ReceivedView {
  readonly view: FeatureFlagsView;
  readonly receivedAt: number;
}

const withEntry = <V>(map: ReadonlyMap<string, V>, key: string, value: V) =>
  new Map(map).set(key, value);

function withoutEntry<V>(map: ReadonlyMap<string, V>, key: string): ReadonlyMap<string, V> {
  if (!map.has(key)) return map;
  const next = new Map(map);
  next.delete(key);
  return next;
}

const failureMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export function useFeatureFlagsSettings(): FeatureFlagsSettingsController {
  const environmentId = usePrimaryEnvironmentId();
  const query = useEnvironmentQuery(
    environmentId === null ? null : serverEnvironment.featureFlags({ environmentId, input: {} }),
  );
  const canEdit = useAtomValue(serverEnvironment.setFeatureFlag.permissionAtom(environmentId));
  const setFeatureFlag = useAtomCommand(serverEnvironment.setFeatureFlag, {
    reportFailure: false,
  });
  const [received, setReceived] = useState<ReceivedView | null>(null);
  const [pending, setPending] = useState<ReadonlyMap<string, boolean | null>>(new Map());
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map());
  // A set answers with the whole view; it stays authoritative until a newer read lands
  // (the read re-runs when the server streams the changed values).
  const view =
    received !== null && received.receivedAt >= query.dataUpdatedAt ? received.view : query.data;

  const send = async (key: string, enabled: boolean | null) => {
    if (environmentId === null || pending.has(key)) return;
    setPending((current) => withEntry(current, key, enabled));
    setErrors((current) => withoutEntry(current, key));
    const result = await setFeatureFlag({ environmentId, input: { key, enabled } });
    if (result._tag === "Success") {
      setReceived({ view: result.value, receivedAt: Date.now() });
    } else {
      setErrors((current) =>
        withEntry(current, key, failureMessage(squashAtomCommandFailure(result))),
      );
    }
    setPending((current) => withoutEntry(current, key));
  };

  return {
    view,
    loadError: view === null ? query.error : null,
    canEdit,
    pending,
    errors,
    setEnabled: (key, enabled) => void send(key, enabled),
    reset: (key) => void send(key, null),
  };
}
