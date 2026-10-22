import { useAtomValue } from "@effect/atom-react";
import {
  AuthRelayReadScope,
  AuthRelayWriteScope,
  type EnvironmentConnectSignInStatus,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";
import { HttpClient } from "effect/http";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import { runtime } from "../lib/runtime";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { usePrimaryEnvironment } from "../state/environments";
import { useEnvironmentScope } from "../state/session";
import type { CloudEnvironmentLinkError, CloudLinkTarget } from "./linkEnvironment";
import { hasCloudPublicConfig } from "./publicConfig";
import {
  readPrimaryConnectSignInStatus,
  startPrimaryConnectSignIn,
} from "./t3team-connectSignInApi";
import {
  CONNECT_SIGN_IN_POLL_MS,
  dismissConnectSignInNoticeForSession,
  isConnectSignInNoticeDismissedForSession,
  subscribeConnectSignInNoticeDismissal,
} from "./t3team-connectSignInNotice.logic";

const connectSignInAtomRuntime = Atom.runtime(
  Layer.effect(
    HttpClient.HttpClient,
    runtime.contextEffect.pipe(
      Effect.map((context) => Context.get(context, HttpClient.HttpClient)),
    ),
  ),
);

const connectSignInStatusAtom = Atom.family((key: string) => {
  const target = JSON.parse(key) as CloudLinkTarget;
  return connectSignInAtomRuntime
    .atom(readPrimaryConnectSignInStatus({ target }))
    .pipe(
      Atom.swr({ staleTime: 5_000, revalidateOnMount: true }),
      Atom.setIdleTTL(5 * 60_000),
      Atom.withLabel(`connect-sign-in:${target.environmentId}`),
    );
});

const EMPTY_STATUS_ATOM = Atom.make(
  AsyncResult.success<EnvironmentConnectSignInStatus | null>(null),
).pipe(Atom.keepAlive, Atom.withLabel("connect-sign-in:null"));

/**
 * The primary environment's T3 Connect sign-in state, plus the user-started sign-in. Reads on
 * mount and window focus, and polls only while a sign-in the user started is open.
 */
export function useConnectSignIn() {
  const primary = usePrimaryEnvironment();
  const canRead = useEnvironmentScope(primary?.environmentId ?? null, AuthRelayReadScope);
  const canStart = useEnvironmentScope(primary?.environmentId ?? null, AuthRelayWriteScope);
  const target = useMemo<CloudLinkTarget | null>(
    () =>
      primary?.entry.target._tag === "PrimaryConnectionTarget"
        ? {
            environmentId: primary.environmentId,
            label: primary.label,
            httpBaseUrl: primary.entry.target.httpBaseUrl,
            wsBaseUrl: primary.entry.target.wsBaseUrl,
          }
        : null,
    [primary],
  );
  const key = target && hasCloudPublicConfig() && canRead ? JSON.stringify(target) : null;
  const atom: Atom.Atom<
    AsyncResult.AsyncResult<EnvironmentConnectSignInStatus | null, CloudEnvironmentLinkError>
  > = key ? connectSignInStatusAtom(key) : EMPTY_STATUS_ATOM;
  const result = useAtomValue(atom);
  const status = result._tag === "Failure" ? null : Option.getOrNull(AsyncResult.value(result));
  const dismissed = useSyncExternalStore(
    subscribeConnectSignInNoticeDismissal,
    isConnectSignInNoticeDismissedForSession,
  );

  const refresh = useCallback(() => {
    if (key) appAtomRegistry.refresh(connectSignInStatusAtom(key));
  }, [key]);

  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);
  const inProgress = status?.attempt === "in_progress";
  useEffect(() => {
    if (!inProgress) return;
    const id = window.setInterval(refresh, CONNECT_SIGN_IN_POLL_MS);
    return () => window.clearInterval(id);
  }, [inProgress, refresh]);

  const start = useCallback(async () => {
    if (!target || !canStart) return;
    await runtime.runPromise(startPrimaryConnectSignIn({ target }));
    refresh();
  }, [canStart, refresh, target]);

  return { status, dismissed, canStart, start, dismiss: dismissConnectSignInNoticeForSession };
}
