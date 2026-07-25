import { ProviderDriverKind } from "@t3tools/contracts";

import { ProviderInstanceIcon } from "~/components/chat/ProviderInstanceIcon";

export type ExternalWorkspaceProvider = "Codex" | "Claude";

export function ExternalWorkspaceProviderIcons({
  providers,
}: {
  readonly providers: ReadonlyArray<ExternalWorkspaceProvider>;
}) {
  return (
    <span
      className="flex items-center gap-1 text-muted-foreground"
      aria-label={`External sessions from ${providers.join(" and ")}`}
    >
      {providers.map((provider) => (
        <ProviderInstanceIcon
          key={provider}
          driverKind={ProviderDriverKind.make(provider === "Codex" ? "codex" : "claudeAgent")}
          displayName={provider}
          className="size-3.5"
          iconClassName="size-3.5"
        />
      ))}
    </span>
  );
}
