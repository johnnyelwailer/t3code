import { safeErrorLogAttributes } from "@t3tools/client-runtime/errors";
import { createToolAuthEnvironmentAtoms, type ToolAuthStatesByTool } from "@t3tools/client-runtime/state/toolauth";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import type * as Cause from "effect/Cause";
import { useCallback } from "react";

import type { ToolAuthToolMeta } from "../components/settings/toolAuthTools";
import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { connectionAtomRuntime } from "../connection/runtime";
import { usePrimaryEnvironmentId } from "./environments";
import { useEnvironmentQuery } from "./query";
import { useAtomCommand } from "./use-atom-command";

export const toolAuthEnvironment = createToolAuthEnvironmentAtoms(connectionAtomRuntime);

/** Live per-tool sign-in status for the given environment (snapshot + live updates). */
export function useToolAuthStates(environmentId: EnvironmentId | null): ToolAuthStatesByTool {
  const query = useEnvironmentQuery(
    environmentId === null ? null : toolAuthEnvironment.stream({ environmentId, input: null }),
  );
  return query.data ?? new Map();
}

function reportToolAuthFailure(
  label: string,
  action: string,
  result: { readonly cause: Cause.Cause<unknown> },
) {
  const error = squashAtomCommandFailure(result);
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

/**
 * `start`/`install`/`submitCode`/`cancel` wired to the primary environment,
 * with failure toasts + logging. Shared by every "Connect this tool" surface —
 * the settings page's `ConnectedToolsSettings` and the model picker's
 * `ModelPickerProviderConnectPanel` — so the connect flow behaves
 * identically wherever it's triggered from.
 */
export function useToolAuthActions(meta: ToolAuthToolMeta) {
  const environmentId = usePrimaryEnvironmentId();
  const start = useAtomCommand(toolAuthEnvironment.start, { reportFailure: false });
  const install = useAtomCommand(toolAuthEnvironment.install, { reportFailure: false });
  const submitCode = useAtomCommand(toolAuthEnvironment.submitCode, { reportFailure: false });
  const cancel = useAtomCommand(toolAuthEnvironment.cancel, { reportFailure: false });

  const onConnect = useCallback(() => {
    if (!environmentId) return;
    void (async () => {
      const result = await start({ environmentId, input: { tool: meta.tool } });
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        reportToolAuthFailure(meta.label, "connect", result);
      }
    })();
  }, [environmentId, meta.label, meta.tool, start]);

  /**
   * One click for "install it and sign me in". The server installs, re-probes,
   * then chains straight into the login flow, reporting every phase over the
   * same stream `useToolAuthStates` already renders — so there is nothing to
   * call afterwards and no intermediate state for the caller to manage.
   */
  const onInstall = useCallback(() => {
    if (!environmentId) return;
    void (async () => {
      const result = await install({ environmentId, input: { tool: meta.tool } });
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        reportToolAuthFailure(meta.label, "install", result);
      }
    })();
  }, [environmentId, meta.label, meta.tool, install]);

  const onSubmitCode = useCallback(
    (code: string) => {
      if (!environmentId) return;
      void (async () => {
        const result = await submitCode({ environmentId, input: { tool: meta.tool, code } });
        if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
          reportToolAuthFailure(meta.label, "verify", result);
        }
      })();
    },
    [environmentId, meta.label, meta.tool, submitCode],
  );

  const onCancel = useCallback(() => {
    if (!environmentId) return;
    void (async () => {
      const result = await cancel({ environmentId, input: { tool: meta.tool } });
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        reportToolAuthFailure(meta.label, "cancel", result);
      }
    })();
  }, [environmentId, meta.label, meta.tool, cancel]);

  return { onConnect, onInstall, onSubmitCode, onCancel };
}
