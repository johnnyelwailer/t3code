import { safeErrorLogAttributes } from "@t3tools/client-runtime/errors";
import {
  createToolAuthEnvironmentAtoms,
  type ToolAuthStatesByTool,
} from "@t3tools/client-runtime/state/toolauth";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, ToolAuthState } from "@t3tools/contracts";
import { useCallback } from "react";

import type { ToolAuthToolMeta } from "../components/settings/t3team-toolAuthTools";
import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { connectionAtomRuntime } from "../connection/runtime";
import { usePrimaryEnvironmentId } from "./environments";
import { useEnvironmentQuery } from "./query";
import { useAtomCommand } from "./use-atom-command";
import {
  missingToolAuthEnvironmentError,
  resolveToolAuthEnvironmentId,
} from "./t3team-toolauthActions";
import { toolAuthActionOutcome, type ToolAuthActionOutcome } from "./t3team-toolauthActionOutcome";

export const toolAuthEnvironment = createToolAuthEnvironmentAtoms(connectionAtomRuntime);

/**
 * Live per-tool sign-in status (snapshot + live updates). `recheck` resubscribes, so the server
 * asks each CLI again: a sign-in done outside the app (`gh auth login` in a terminal) reaches no
 * live update on its own.
 */
export function useToolAuthStatesQuery(environmentId: EnvironmentId | null): {
  readonly states: ToolAuthStatesByTool;
  readonly recheck: () => void;
} {
  const query = useEnvironmentQuery(
    environmentId === null ? null : toolAuthEnvironment.stream({ environmentId, input: null }),
  );
  return { states: query.data ?? new Map(), recheck: query.refresh };
}

/** Live per-tool sign-in status for the given environment (snapshot + live updates). */
export function useToolAuthStates(environmentId: EnvironmentId | null): ToolAuthStatesByTool {
  return useToolAuthStatesQuery(environmentId).states;
}

function reportToolAuthFailure(label: string, action: string, error: unknown) {
  toastManager.add(
    stackedThreadToast({
      type: "error",
      title: `Could not ${action} ${label}`,
      description:
        error instanceof Error ? error.message : `The ${action} request could not be started.`,
    }),
  );
  console.warn(`Failed to ${action} tool auth`, {
    operation: `toolauth-${action}`,
    tool: label,
    ...safeErrorLogAttributes(error),
  });
}

function reportMissingToolAuthEnvironment(label: string, action: string) {
  const error = missingToolAuthEnvironmentError(label, action);
  toastManager.add(stackedThreadToast({ type: "error", ...error }));
  console.warn(`Failed to ${action} tool auth`, {
    operation: `toolauth-${action}`,
    tool: label,
    reason: "missing-environment",
  });
}

/**
 * `start`/`install`/`submitCode`/`cancel` wired to an environment (the primary unless one is given),
 * with failure toasts + logging. Shared by every "Connect this tool" surface —
 * the settings page's `ConnectedToolsSettings` and the model picker's
 * `ModelPickerProviderConnectPanel` — so the connect flow behaves
 * identically wherever it's triggered from.
 *
 * `options.hostname` signs a per-host CLI (`gh`) in to that host instead of its default one.
 */
export function useToolAuthActions(
  meta: ToolAuthToolMeta,
  targetEnvironmentId?: EnvironmentId | null,
  options?: { readonly hostname?: string | undefined },
) {
  const hostname = options?.hostname;
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const environmentId = resolveToolAuthEnvironmentId(targetEnvironmentId, primaryEnvironmentId);
  const start = useAtomCommand(toolAuthEnvironment.start, { reportFailure: false });
  const install = useAtomCommand(toolAuthEnvironment.install, { reportFailure: false });
  const submitCode = useAtomCommand(toolAuthEnvironment.submitCode, { reportFailure: false });
  const cancel = useAtomCommand(toolAuthEnvironment.cancel, { reportFailure: false });

  /**
   * Every action answers with what happened. A refusal the server returns as a success value (the
   * `INTEGRATIONS_TOOL_AUTH` gate) is a `failed` outcome here, not a dropped result — the card
   * merges it in and shows it with Retry. The toast stays for the error channel only, so the two
   * never say the same thing twice.
   */
  const runAction = useCallback(
    async (
      action: string,
      send: () => Promise<AtomCommandResult<ToolAuthState, unknown>>,
    ): Promise<ToolAuthActionOutcome> => {
      const outcome = toolAuthActionOutcome(await send());
      if (outcome.kind === "failed" && outcome.error !== undefined) {
        reportToolAuthFailure(meta.label, action, outcome.error);
      }
      return outcome;
    },
    [meta.label],
  );

  const onConnect = useCallback((): Promise<ToolAuthActionOutcome> => {
    if (!environmentId) {
      reportMissingToolAuthEnvironment(meta.label, "connect");
      return Promise.resolve({ kind: "failed", reason: "noEnvironment" });
    }
    return runAction("connect", () =>
      start({
        environmentId,
        input: { tool: meta.tool, ...(hostname === undefined ? {} : { hostname }) },
      }),
    );
  }, [environmentId, hostname, meta.label, meta.tool, runAction, start]);

  /**
   * One click for "install it and sign me in". The server installs, re-probes,
   * then chains straight into the login flow, reporting every phase over the
   * same stream `useToolAuthStates` already renders — so there is nothing to
   * call afterwards and no intermediate state for the caller to manage.
   */
  const onInstall = useCallback((): Promise<ToolAuthActionOutcome> => {
    if (!environmentId) {
      reportMissingToolAuthEnvironment(meta.label, "install");
      return Promise.resolve({ kind: "failed", reason: "noEnvironment" });
    }
    return runAction("install", () => install({ environmentId, input: { tool: meta.tool } }));
  }, [environmentId, meta.label, meta.tool, install, runAction]);

  const onSubmitCode = useCallback(
    (code: string): Promise<ToolAuthActionOutcome> => {
      if (!environmentId) {
        reportMissingToolAuthEnvironment(meta.label, "verify");
        return Promise.resolve({ kind: "failed", reason: "noEnvironment" });
      }
      return runAction("verify", () =>
        submitCode({ environmentId, input: { tool: meta.tool, code } }),
      );
    },
    [environmentId, meta.label, meta.tool, runAction, submitCode],
  );

  const onCancel = useCallback((): Promise<ToolAuthActionOutcome> => {
    if (!environmentId) {
      reportMissingToolAuthEnvironment(meta.label, "cancel");
      return Promise.resolve({ kind: "failed", reason: "noEnvironment" });
    }
    return runAction("cancel", () => cancel({ environmentId, input: { tool: meta.tool } }));
  }, [environmentId, meta.label, meta.tool, cancel, runAction]);

  return { onConnect, onInstall, onSubmitCode, onCancel, environmentId };
}
