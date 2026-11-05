"use client";

import { useEffect, useRef, useState } from "react";

import { useStableCallback } from "~/hooks/useStableCallback";
import { useBackend } from "~/t3team/backend/t3team-index";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { SettingsRow, SettingsSection } from "./settingsLayout";

const ROW_CLASS = "px-4 py-3.5 text-xs text-muted-foreground sm:px-5";

type TempoState =
  | { readonly kind: "loading" }
  | { readonly kind: "error" }
  | { readonly kind: "ready"; readonly configured: boolean };

/** The Tempo entry of "Connected tools": a personal API token for the Tempo capacity API. */
export function TempoTokenSettings() {
  const backend = useBackend();
  const [state, setState] = useState<TempoState>({ kind: "loading" });
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const unmountedRef = useRef(false);

  const load = useStableCallback(() => {
    if (!backend) return;
    backend.atlassian
      .getTempoStatus()
      .then((result) => {
        if (!unmountedRef.current) setState({ kind: "ready", configured: result.configured });
      })
      .catch(() => {
        if (!unmountedRef.current) setState({ kind: "error" });
      });
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- fetches the Tempo status on mount and when the backend changes; the unmount guard ref keeps an in-flight request from writing state after unmount.
  useEffect(() => {
    unmountedRef.current = false;
    if (backend) load();
    return () => {
      unmountedRef.current = true;
    };
  }, [backend, load]);

  const apply = async (token: string | null) => {
    if (!backend || saving) return;
    setSaving(true);
    try {
      const result = await backend.atlassian.setTempoToken(token);
      setState({ kind: "ready", configured: result.configured });
      setDraft("");
    } catch {
      setState({ kind: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsSection title="Tempo">
      {state.kind === "loading" ? (
        <p className={ROW_CLASS}>Checking the Tempo connection…</p>
      ) : null}
      {state.kind === "error" ? (
        <div className={`${ROW_CLASS} flex items-center justify-between gap-3`}>
          <p>Could not read the Tempo token.</p>
          <Button size="sm" variant="outline" onClick={load}>
            Retry
          </Button>
        </div>
      ) : null}
      {state.kind === "ready" && state.configured ? (
        <SettingsRow
          title="Tempo API token"
          status={<Badge variant="secondary">Configured</Badge>}
          description="Personal token for Tempo capacity. Stored on this machine; it is never shown again."
          control={
            <Button
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => {
                void apply(null);
              }}
            >
              Remove
            </Button>
          }
        />
      ) : null}
      {state.kind === "ready" && !state.configured ? (
        <SettingsRow
          title="Tempo API token"
          description="Paste a personal Tempo API token. It is stored on this machine and used for Tempo capacity."
          control={
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <Input
                nativeInput
                type="password"
                size="sm"
                autoComplete="off"
                placeholder="Tempo API token"
                aria-label="Tempo API token"
                className="w-full sm:w-64"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={saving}
              />
              <Button
                size="sm"
                disabled={saving || draft.trim().length === 0}
                onClick={() => {
                  void apply(draft.trim());
                }}
              >
                Save
              </Button>
            </div>
          }
        />
      ) : null}
    </SettingsSection>
  );
}
