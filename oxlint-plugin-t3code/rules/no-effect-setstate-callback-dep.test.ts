import { assert, describe } from "@effect/vitest";

import { createOxlintRuleHarness } from "../test/utils.ts";

const reports = (output: string) =>
  output.match(/t3code\(no-effect-setstate-callback-dep\)/g)?.length ?? 0;
const lint = (filename: string) =>
  createOxlintRuleHarness("t3code/no-effect-setstate-callback-dep", { filename });

const hook = lint("apps/web/src/t3team/hooks/t3team-useGitHubAuthProbe.ts");

describe("t3code/no-effect-setstate-callback-dep", () => {
  hook.invalid(
    "reports the #923-before auth-probe pattern: setState plus a hook-returned runner in deps",
    `import { useEffect } from "react";
import { useAtomQueryRunner } from "~/state/use-atom-query-runner";

export function useGitHubAuthProbe(params: {
  enabled: boolean;
  onAuthenticated: () => void;
  setLoadingAuth: (loading: boolean) => void;
  setAuthStatus: (status: string) => void;
}) {
  const { enabled, onAuthenticated, setLoadingAuth, setAuthStatus } = params;
  const discoverSourceControl = useAtomQueryRunner(discovery, { refresh: true });
  useEffect(() => {
    setLoadingAuth(true);
    void discoverSourceControl({}).then(() => {
      setAuthStatus("authenticated");
      onAuthenticated();
    });
  }, [discoverSourceControl, enabled, setLoadingAuth, setAuthStatus]);
}
`,
    (output) => assert.strictEqual(reports(output), 1),
  );

  hook.invalid(
    "reports an effect that setStates and depends on a function prop",
    `import { useEffect, useState } from "react";
export function Panel({ onReady }: { onReady: () => void }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
    onReady();
  }, [onReady]);
  return ready;
}
`,
    (output) => assert.strictEqual(reports(output), 1),
  );

  hook.valid(
    "allows the #923 fix: runner held in a ref, not listed in deps",
    `import { useEffect, useRef } from "react";
import { useAtomQueryRunner } from "~/state/use-atom-query-runner";
import { useLatest } from "./t3team-useLatest";

export function useGitHubAuthProbe(params: {
  enabled: boolean;
  onAuthenticated: () => void;
  setLoadingAuth: (loading: boolean) => void;
  setAuthStatus: (status: string) => void;
}) {
  const { enabled, onAuthenticated, setLoadingAuth, setAuthStatus } = params;
  const onAuthenticatedRef = useLatest(onAuthenticated);
  const discoverSourceControl = useAtomQueryRunner(discovery, { refresh: true });
  const discoverSourceControlRef = useLatest(discoverSourceControl);
  useEffect(() => {
    setLoadingAuth(true);
    void discoverSourceControlRef.current({}).then(() => {
      setAuthStatus("authenticated");
      onAuthenticatedRef.current();
    });
  }, [enabled, setLoadingAuth, setAuthStatus]);
}
`,
  );

  hook.valid(
    "allows setState in an effect whose deps are primitives and stable setters",
    `import { useEffect, useState } from "react";
export function Panel({ enabled }: { enabled: boolean }) {
  const [status, setStatus] = useState("idle");
  useEffect(() => {
    if (enabled) setStatus("on");
  }, [enabled, setStatus]);
  return status;
}
`,
  );

  hook.valid(
    "allows a suppressed effect that names why",
    `import { useEffect, useState } from "react";
export function Panel({ onReady }: { onReady: () => void }) {
  const [ready, setReady] = useState(false);
  // oxlint-disable-next-line t3code/no-effect-setstate-callback-dep -- onReady is a stable store action; this effect only runs when the id changes
  useEffect(() => {
    setReady(true);
    onReady();
  }, [onReady]);
  return ready;
}
`,
  );

  hook.valid(
    "ignores an effect that depends on a callback but does not set state",
    `import { useEffect } from "react";
export function Panel({ onClose, open }: { onClose: () => void; open: boolean }) {
  useEffect(() => {
    if (!open) onClose();
  }, [open, onClose]);
  return null;
}
`,
  );

  hook.valid(
    "allows an effect that depends on a useCallback result (stable when its own deps are)",
    `import { useCallback, useEffect, useState } from "react";
export function Panel({ id }: { id: string }) {
  const [status, setStatus] = useState("idle");
  const load = useCallback(async () => setStatus(id), [id]);
  useEffect(() => {
    void load();
  }, [load]);
  return status;
}
`,
  );

  lint("apps/web/src/t3team/hooks/t3team-useGitHubAuthProbe.test.tsx").valid(
    "skips test files",
    `export function useGitHubAuthProbe() {
  const discoverSourceControl = useAtomQueryRunner(discovery);
  const [x, setX] = useState(0);
  useEffect(() => { setX(1); discoverSourceControl(); }, [discoverSourceControl]);
}
`,
  );
});
