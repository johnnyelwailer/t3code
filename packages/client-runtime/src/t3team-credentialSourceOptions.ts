/**
 * What the credential-request card shows for the sources the user's own machine has: pure text and
 * state, so the card stays a thin view. A value never passes through here; a source is only described.
 */
import {
  CREDENTIAL_ADDABLE_SCOPES,
  type CredentialSource,
  type CredentialSourcesProbeResult,
} from "@t3tools/contracts";

export interface CredentialSourceOption {
  readonly id: "gh" | "env";
  readonly label: string;
  readonly detail?: string;
  /** A one-line fix or a warning, shown under the option. */
  readonly hint?: string;
  readonly warning?: string;
  readonly disabled: boolean;
  /** A gh sign-in missing a scope can add it from the card: the host and the scopes to ask for. */
  readonly canAddAccess?: true;
  readonly host?: string;
  readonly missingScopes?: ReadonlyArray<string>;
}

const addable = (scopes: ReadonlyArray<string>) =>
  scopes.length > 0 &&
  scopes.every((scope) => (CREDENTIAL_ADDABLE_SCOPES as ReadonlyArray<string>).includes(scope));

/** The button text names the exact scopes it will ask GitHub for. */
export function addAccessLabel(scopes: ReadonlyArray<string>): string {
  return `Add package access (${scopes.join(", ")})`;
}

function describe(source: CredentialSource): CredentialSourceOption | null {
  switch (source.kind) {
    case "gh":
      return {
        id: "gh",
        label: `Your gh sign-in on ${source.host} as ${source.account}`,
        ...(source.scopeCheck === "unknown"
          ? { detail: "Its scopes could not be checked for this kind of token." }
          : {}),
        ...(source.refreshCommand === undefined ? {} : { hint: source.refreshCommand }),
        disabled: source.scopeCheck === "missing",
        ...(source.scopeCheck === "missing" && addable(source.missingScopes)
          ? { canAddAccess: true as const, host: source.host, missingScopes: source.missingScopes }
          : {}),
      };
    case "env":
      return {
        id: "env",
        label: `The ${source.name} variable on this machine`,
        ...(source.warning === undefined
          ? {}
          : {
              warning:
                "Its value looks like a different kind of secret than this request asks for.",
            }),
        disabled: false,
      };
    case "manual":
      return null;
  }
}

/** Sources worth a button; typing the value is the card's own input and is always there. */
export function credentialSourceOptions(
  probe: CredentialSourcesProbeResult,
): ReadonlyArray<CredentialSourceOption> {
  return probe.sources.flatMap((source) => describe(source) ?? []);
}

export function credentialRequestIntro(source: {
  readonly host?: string | undefined;
  readonly name?: string | undefined;
  readonly scopes?: ReadonlyArray<string> | undefined;
}): string {
  const parts = [
    source.host === undefined ? null : `for ${source.host}`,
    source.scopes === undefined || source.scopes.length === 0
      ? null
      : `with ${source.scopes.join(", ")} access`,
    source.name === undefined ? null : `read as ${source.name}`,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return "";
  return `This agent needs a credential ${parts.join(", ")}. Nothing is sent until you choose where it comes from.`;
}
