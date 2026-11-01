/**
 * Adds a missing scope to a gh sign-in on the connected machine: start shows the one-time code and page, polling
 * waits for the user to approve, then `onDone` re-checks the sources. A value is never read here.
 */
import {
  awaitCredentialRefresh,
  CREDENTIAL_REFRESH_FAILED_TEXT,
} from "@t3tools/client-runtime/t3team-credentialRefreshFlow";
import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect, useRef, useState } from "react";

import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";

export type CredentialRefreshView =
  | { readonly phase: "idle" | "starting" }
  | { readonly phase: "waiting"; readonly userCode: string; readonly verificationUri: string }
  | { readonly phase: "failed"; readonly message: string };

export function useT3TeamCredentialRefresh() {
  const quiet = { reportFailure: false, reportDefect: false } as const;
  const startCommand = useAtomCommand(serverEnvironment.refreshCredentialStart, {
    label: "start credential refresh",
    ...quiet,
  });
  const statusCommand = useAtomCommand(serverEnvironment.refreshCredentialStatus, {
    label: "check credential refresh",
    ...quiet,
  });
  const [view, setView] = useState<CredentialRefreshView>({ phase: "idle" });
  const controller = useRef<AbortController | null>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- stops the status polling when the card unmounts
  useEffect(() => () => controller.current?.abort(), []);

  const start = async (
    environmentId: EnvironmentId,
    host: string,
    scopes: ReadonlyArray<string>,
    onDone: () => void,
  ) => {
    if (view.phase === "starting" || view.phase === "waiting") return;
    const failed = () => setView({ phase: "failed", message: CREDENTIAL_REFRESH_FAILED_TEXT });
    setView({ phase: "starting" });
    const started = await startCommand({ environmentId, input: { host, scopes: [...scopes] } });
    if (started._tag !== "Success") return failed();
    const { id, userCode, verificationUri } = started.value;
    setView({ phase: "waiting", userCode, verificationUri });
    controller.current?.abort();
    const own = new AbortController();
    controller.current = own;
    const outcome = await awaitCredentialRefresh({
      signal: own.signal,
      poll: async () => {
        const status = await statusCommand({ environmentId, input: { id } });
        return status._tag === "Success" ? status.value.state : "failed";
      },
    });
    if (outcome === "aborted") return;
    if (outcome === "failed") return failed();
    setView({ phase: "idle" });
    onDone();
  };

  return { view, start };
}
