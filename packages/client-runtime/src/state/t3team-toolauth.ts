import { WS_METHODS } from "@t3tools/contracts";
import * as Stream from "effect/Stream";
import { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { subscribe } from "../rpc/client.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentSubscriptionAtomFamily,
} from "./runtime.ts";
import { applyToolAuthStreamEvent, EMPTY_TOOLAUTH_STATES } from "./t3team-toolauthSession.ts";

/**
 * "Connected tools" — signing `claude`/`codex` into a hosted sandbox from the
 * settings UI. `stream` carries a full snapshot followed by live per-tool
 * updates (mirrors `terminalEnvironment.attach`'s subscribe+scan idiom); the
 * mutation commands (`start`/`submitCode`/`cancel`) are serialized per tool so
 * a double-click can't race two flows for the same tool.
 */
export function createToolAuthEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const commandScheduler = createAtomCommandScheduler();
  const toolConcurrency = {
    mode: "serial" as const,
    key: ({
      environmentId,
      input,
    }: {
      readonly environmentId: string;
      readonly input: { readonly tool: string };
    }) => JSON.stringify([environmentId, input.tool]),
  };

  return {
    stream: createEnvironmentSubscriptionAtomFamily(runtime, {
      label: "environment-data:toolauth:stream",
      subscribe: (_input: null) =>
        subscribe(WS_METHODS.subscribeToolAuth, {}).pipe(
          Stream.scan(EMPTY_TOOLAUTH_STATES, applyToolAuthStreamEvent),
        ),
    }),
    start: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:toolauth:start",
      tag: WS_METHODS.toolAuthStart,
      scheduler: commandScheduler,
      concurrency: toolConcurrency,
    }),
    /**
     * One action for "install the CLI, then sign me in". The server chains
     * install → re-probe → login and reports every phase over the same
     * `stream` above, so callers fire this once and render whatever arrives;
     * there is no second call to make and no "installed, now connect" step.
     *
     * Shares `toolConcurrency` with `start`, which is what stops a double-click
     * from spawning two package-manager processes for the same tool.
     */
    install: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:toolauth:install",
      tag: WS_METHODS.toolAuthInstall,
      scheduler: commandScheduler,
      concurrency: toolConcurrency,
    }),
    submitCode: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:toolauth:submit-code",
      tag: WS_METHODS.toolAuthSubmitCode,
      scheduler: commandScheduler,
      concurrency: toolConcurrency,
    }),
    cancel: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:toolauth:cancel",
      tag: WS_METHODS.toolAuthCancel,
      scheduler: commandScheduler,
      concurrency: toolConcurrency,
    }),
  };
}

export * from "./t3team-toolauthSession.ts";
