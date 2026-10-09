/**
 * An account a pack signs the user in to: a standard OAuth 2.0 public client (authorization code +
 * PKCE, RFC 7636; device code, RFC 8628; refresh) described as data. The host owns every flow, the
 * stored grant and the UI; a pack only says where the issuer is and what it may ask for, so no
 * identity provider's code lives in the host.
 *
 * One sign-in serves every resource the account names: the host redeems the same refresh grant for
 * each resource's scope when a feature asks for a token (`accessToken(accountId, resource)`).
 */
export type AccountDefinition = {
  /** Lowercase identifier, e.g. `"acme"`; keys the stored grant and the routes. */
  readonly id: string;
  /** What the user signs in to, as shown in the app: "Sign in to {label}". */
  readonly label: string;
  readonly issuer: {
    readonly clientId: string;
    readonly authorizationEndpoint: string;
    readonly tokenEndpoint: string;
    /** Absent when the issuer has no device-code grant: then only the browser sign-in exists. */
    readonly deviceAuthorizationEndpoint?: string;
  };
  /** Requested with every grant, e.g. `"openid profile offline_access"`. */
  readonly baseScopes: string;
  /** Named resources the account can mint tokens for, and the scope each needs. */
  readonly resources: Readonly<Record<string, string>>;
  /** The resource the sign-in itself asks consent for; must be a key of `resources`. */
  readonly signInResource: string;
};

const ACCOUNT_ID = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

const assertHttps = (value: string | undefined, field: string): void => {
  if (value === undefined) return;
  const url = URL.canParse(value) ? new URL(value) : null;
  if (url === null || url.protocol !== "https:") throw new Error(`${field} must be an https URL`);
};

export const defineAccount = <const T extends AccountDefinition>(definition: T): T => {
  if (!ACCOUNT_ID.test(definition.id)) {
    throw new Error("Account id must be a lowercase pack identifier");
  }
  if (definition.label.trim() === "") throw new Error(`Account ${definition.id} needs a label`);
  if (definition.issuer.clientId.trim() === "") {
    throw new Error(`Account ${definition.id} needs an issuer clientId`);
  }
  assertHttps(definition.issuer.authorizationEndpoint, "issuer.authorizationEndpoint");
  assertHttps(definition.issuer.tokenEndpoint, "issuer.tokenEndpoint");
  assertHttps(definition.issuer.deviceAuthorizationEndpoint, "issuer.deviceAuthorizationEndpoint");
  if (!Object.hasOwn(definition.resources, definition.signInResource)) {
    throw new Error(`Account ${definition.id}: signInResource must name one of its resources`);
  }
  return definition;
};
