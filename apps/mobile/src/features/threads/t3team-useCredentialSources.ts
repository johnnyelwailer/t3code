/**
 * State and calls behind the mobile credential-source picker. A phone has no `gh` sign-in or
 * environment of its own, so it reads from another connected machine (never the session's own).
 * `probe` describes sources without a value; `use` is the one read that returns it, after a tap.
 */
import {
  credentialSourceOptions,
  type CredentialSourceOption,
} from "@t3tools/client-runtime/t3team-credentialSourceOptions";
import type { EnvironmentId } from "@t3tools/contracts";
import { useRef, useState } from "react";

import { useEnvironments } from "../../state/environments";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";

export interface CredentialRequestSource {
  readonly host?: string | undefined;
  readonly name?: string | undefined;
  readonly scopes?: ReadonlyArray<string> | undefined;
}

export function useT3TeamCredentialSources(props: {
  readonly sessionEnvironmentId: EnvironmentId;
  readonly source: CredentialRequestSource;
  readonly onReadingChange: (reading: boolean) => void;
  readonly onValue: (value: string) => void;
}) {
  const { source } = props;
  const { environments } = useEnvironments();
  const machines = environments.filter(
    (environment) =>
      environment.environmentId !== props.sessionEnvironmentId &&
      environment.connection.phase === "connected",
  );
  const quiet = { reportFailure: false, reportDefect: false } as const;
  const probeCommand = useAtomCommand(serverEnvironment.probeCredentialSources, {
    label: "probe credential sources",
    ...quiet,
  });
  const readCommand = useAtomCommand(serverEnvironment.readCredentialSource, {
    label: "read credential source",
    ...quiet,
  });
  const [checked, setChecked] = useState<{
    readonly environmentId: EnvironmentId;
    readonly options: ReadonlyArray<CredentialSourceOption>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const inFlight = useRef(false);

  const hold = async <A>(run: () => Promise<A>): Promise<A | null> => {
    if (inFlight.current) return null;
    inFlight.current = true;
    setReading(true);
    props.onReadingChange(true);
    setError(null);
    try {
      return await run();
    } finally {
      inFlight.current = false;
      setReading(false);
      props.onReadingChange(false);
    }
  };

  const probe = async (environmentId: EnvironmentId) => {
    const result = await hold(() =>
      probeCommand({
        environmentId,
        input: {
          ...(source.host === undefined ? {} : { host: source.host }),
          ...(source.name === undefined ? {} : { name: source.name }),
          ...(source.scopes === undefined || source.scopes.length === 0
            ? {}
            : { scopes: [...source.scopes] }),
        },
      }),
    );
    if (result === null) return;
    if (result._tag === "Success") {
      setChecked({ environmentId, options: credentialSourceOptions(result.value) });
    } else {
      setError("Could not check that machine. Enter the value below instead.");
    }
  };

  const use = async (environmentId: EnvironmentId, id: "gh" | "env") => {
    const result = await hold(() =>
      readCommand({
        environmentId,
        input: {
          source: id,
          ...(source.host === undefined ? {} : { host: source.host }),
          ...(source.name === undefined ? {} : { name: source.name }),
        },
      }),
    );
    if (result === null) return;
    if (result._tag === "Success") props.onValue(result.value.value);
    else setError("Could not read that source. Enter the value below instead.");
  };

  return { machines, checked, error, reading, probe, use };
}
