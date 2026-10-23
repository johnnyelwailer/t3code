/**
 * Composer banner for provider retries (flag `NEXI_FF_TRANSIENT_AUTO_RESUME`, advertised as
 * `ServerConfig.transientAutoResume`; off = no item), mirroring the usage-limit recovery banner:
 *
 *  - while a provider retries in-turn: "Retrying <provider> · attempt N · next try in Xs";
 *  - once the run failed transiently: "Gateway keeps failing · next try in Xm" with the
 *    auto-resume toggle (default on) that writes `thread.transientRecovery`.
 *
 * The countdown ticks inside its own element, so the composer does not re-render with it.
 */
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import type { ThreadStructure } from "@t3tools/client-runtime/state/shell";
import {
  deriveActiveProviderRetry,
  deriveTransientFailureRecovery,
} from "@t3tools/client-runtime/state/provider-retry";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import type { ComposerBannerStackItem } from "./ComposerBannerStack";
import {
  countdownText,
  failedStatusText,
  nextCountdownTickMs,
  providerRetryBannerModel,
  transientRecoveryToggle,
  type ProviderRetryBannerModel,
} from "./t3team-providerRetryBanner.logic";

type FailedModel = Extract<ProviderRetryBannerModel, { kind: "failed" }>;

function RetryCountdown({ nextTryAtMs }: { readonly nextTryAtMs: number }) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const delay = nextCountdownTickMs(nextTryAtMs, nowMs);
    if (delay === null) return;
    const timer = window.setTimeout(() => setNowMs(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [nextTryAtMs, nowMs]);
  return <>{countdownText(nextTryAtMs, nowMs)}</>;
}

function bannerTitle(model: ProviderRetryBannerModel) {
  const status =
    model.nextTryAtMs !== null ? (
      <RetryCountdown nextTryAtMs={model.nextTryAtMs} />
    ) : model.kind === "failed" ? (
      failedStatusText(model)
    ) : null;
  return status === null ? (
    model.title
  ) : (
    <>
      {model.title} · {status}
    </>
  );
}

function AutoResumeToggle(props: {
  readonly model: FailedModel;
  readonly onChange: (model: FailedModel) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function toggle() {
    setPending(true);
    setError(null);
    try {
      await props.onChange(props.model);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change auto-resume.");
    }
    setPending(false);
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="xs" variant="ghost" disabled={pending} onClick={() => void toggle()}>
        {pending ? "Saving..." : props.model.autoResume ? "Cancel auto-resume" : "Auto-resume"}
      </Button>
      {error ? (
        <p role="alert" className="basis-full text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function useProviderRetryBannerItem(input: {
  readonly enabled: boolean;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId | null;
  readonly projection: ThreadStructure | null;
}): ComposerBannerStackItem | null {
  const { enabled, environmentId, threadId, projection } = input;
  const updateThreadMetadata = useAtomCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  const model = useMemo(
    () =>
      !enabled || projection === null
        ? null
        : providerRetryBannerModel({
            active: deriveActiveProviderRetry(projection),
            failed: deriveTransientFailureRecovery(projection),
          }),
    [enabled, projection],
  );
  // Stable across unrelated host renders: the composer banner stack memoizes on it.
  return useMemo<ComposerBannerStackItem | null>(() => {
    if (model === null || threadId === null) return null;
    const onChange = async (failed: FailedModel) => {
      const result = await updateThreadMetadata({
        environmentId,
        input: { threadId, transientRecovery: transientRecoveryToggle(failed, Date.now()) },
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    };
    return {
      id: model.id,
      variant: "warning",
      priority: "urgent",
      icon: model.kind === "retrying" ? <RefreshCwIcon /> : <AlertTriangleIcon />,
      title: bannerTitle(model),
      description: model.description,
      actions:
        model.kind === "failed" && model.canToggle ? (
          <AutoResumeToggle key={model.id} model={model} onChange={onChange} />
        ) : null,
    };
  }, [environmentId, model, threadId, updateThreadMetadata]);
}
