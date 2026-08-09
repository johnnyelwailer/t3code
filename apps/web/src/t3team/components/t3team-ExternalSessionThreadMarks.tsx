/**
 * The two marks a sidebar row carries when its thread mirrors an external Codex/Claude session:
 * the provider icon, and a lock while the native tool still owns the session.
 *
 * Split from `t3team-ProjectSidebarThreadRow.tsx` so that row stays under the fork's LOC ceiling,
 * and because "is this session still live" is one rule rather than two — both marks read the same
 * `EXTERNAL_SESSION_ACTIVE_WINDOW_MS` window, and keeping them together stops the icon and the lock
 * from ever disagreeing about it.
 */
import { LockIcon } from "lucide-react";
import { ProviderDriverKind, localProviderDisplayName } from "@t3tools/contracts";

import { ProviderInstanceIcon } from "~/components/chat/ProviderInstanceIcon";
import { EXTERNAL_SESSION_ACTIVE_WINDOW_MS } from "~/t3team/chat/t3team-externalSessionState";

/**
 * A session counts as active only inside the window AND not in the future: a clock skew on the
 * writing machine would otherwise mark a stale session live forever.
 */
export function isExternalSessionActive(input: {
  readonly providerKind: string | undefined;
  readonly lastMessageAt: string;
}): boolean {
  if (input.providerKind === undefined) return false;
  const age = Date.now() - Date.parse(input.lastMessageAt);
  return age >= 0 && age < EXTERNAL_SESSION_ACTIVE_WINDOW_MS;
}

export function ExternalSessionProviderMark({
  providerKind,
  active,
}: {
  readonly providerKind: string | undefined;
  readonly active: boolean;
}) {
  if (!providerKind) return null;
  return (
    <span
      title={`External ${localProviderDisplayName(providerKind)} session${active ? " · active · read-only" : ""}`}
    >
      <ProviderInstanceIcon
        driverKind={ProviderDriverKind.make(providerKind)}
        displayName={localProviderDisplayName(providerKind)}
        className="size-3.5"
        iconClassName="size-3.5"
      />
    </span>
  );
}

export function ExternalSessionActiveLock({ active }: { readonly active: boolean }) {
  if (!active) return null;
  return (
    <LockIcon
      className="size-3 shrink-0 animate-[pulse_3s_ease-in-out_infinite] text-amber-500"
      aria-label="Active external session, read-only"
    />
  );
}
