/**
 * The sources the user's own machine offers for a credential request: their gh sign-in for the host, an
 * environment variable of the requested name. The probe and the read run on the primary environment (the
 * machine the user is at), never on the session's machine; the chosen value goes to the card's own answer.
 */
import { useAtomValue } from "@effect/atom-react";
import {
  credentialRequestIntro,
  credentialSourceOptions,
  type CredentialSourceOption,
} from "@t3tools/client-runtime/t3team-credentialSourceOptions";
import { TriangleAlertIcon } from "lucide-react";
import { useRef, useState } from "react";

import { primaryEnvironmentIdAtom } from "../../state/primaryEnvironment";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";

export interface CredentialRequestSource {
  readonly host?: string | undefined;
  readonly name?: string | undefined;
  readonly scopes?: ReadonlyArray<string> | undefined;
}

export function T3TeamCredentialSourcesPicker(props: {
  readonly source: CredentialRequestSource;
  readonly busy: boolean;
  /** True while a source is being checked or read, so the card can hold its own actions. */
  readonly onReadingChange: (reading: boolean) => void;
  /** The chosen source's value, handed to the card's own answer. */
  readonly onValue: (value: string) => void;
}) {
  const { source } = props;
  const primaryEnvironmentId = useAtomValue(primaryEnvironmentIdAtom);
  const probe = useAtomCommand(serverEnvironment.probeCredentialSources, {
    label: "probe credential sources",
    reportFailure: false,
    reportDefect: false,
  });
  const read = useAtomCommand(serverEnvironment.readCredentialSource, {
    label: "read credential source",
    reportFailure: false,
    reportDefect: false,
  });
  const [options, setOptions] = useState<ReadonlyArray<CredentialSourceOption> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<"gh" | "env" | "probe" | null>(null);
  const inFlight = useRef(false);
  const intro = credentialRequestIntro(source);

  const check = async () => {
    if (primaryEnvironmentId === null || inFlight.current) return;
    inFlight.current = true;
    setReading("probe");
    props.onReadingChange(true);
    setError(null);
    const result = await probe({
      environmentId: primaryEnvironmentId,
      input: {
        ...(source.host === undefined ? {} : { host: source.host }),
        ...(source.name === undefined ? {} : { name: source.name }),
        ...(source.scopes === undefined || source.scopes.length === 0
          ? {}
          : { scopes: [...source.scopes] }),
      },
    }).finally(() => {
      inFlight.current = false;
      setReading(null);
      props.onReadingChange(false);
    });
    if (result._tag === "Success") setOptions(credentialSourceOptions(result.value));
    else setError("Could not check this machine. Enter the value below instead.");
  };

  const use = async (id: "gh" | "env") => {
    if (primaryEnvironmentId === null || inFlight.current) return;
    inFlight.current = true;
    setReading(id);
    props.onReadingChange(true);
    setError(null);
    const result = await read({
      environmentId: primaryEnvironmentId,
      input: {
        source: id,
        ...(source.host === undefined ? {} : { host: source.host }),
        ...(source.name === undefined ? {} : { name: source.name }),
      },
    }).finally(() => {
      inFlight.current = false;
      setReading(null);
      props.onReadingChange(false);
    });
    if (result._tag === "Success") props.onValue(result.value.value);
    else setError("Could not read that source on this machine. Enter the value below instead.");
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {intro === "" ? null : <p className="text-sm text-muted-foreground">{intro}</p>}
      {options === null ? (
        <div>
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={props.busy || reading !== null || primaryEnvironmentId === null}
            onClick={() => void check()}
          >
            Use something from this machine
          </Button>
        </div>
      ) : options.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nothing for this request on this machine. Enter the value below.
        </p>
      ) : null}
      {(options ?? []).map((option) => (
        <div key={option.id} className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="min-w-0 text-sm text-foreground">{option.label}</span>
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={props.busy || reading !== null || option.disabled}
              aria-label={`Use ${option.label}`}
              onClick={() => void use(option.id)}
            >
              Use
            </Button>
          </div>
          {option.detail === undefined ? null : (
            <p className="text-xs text-muted-foreground">{option.detail}</p>
          )}
          {option.hint === undefined ? null : (
            <p className="text-xs text-muted-foreground">
              This sign-in lacks a requested scope. To add it, run{" "}
              <code className="font-mono">{option.hint}</code>, then ask again.
            </p>
          )}
          {option.warning === undefined ? null : (
            <p className="flex items-center gap-1 text-xs text-warning-foreground">
              <TriangleAlertIcon className="size-3.5 shrink-0" aria-hidden />
              {option.warning}
            </p>
          )}
        </div>
      ))}
      {error === null ? null : (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
