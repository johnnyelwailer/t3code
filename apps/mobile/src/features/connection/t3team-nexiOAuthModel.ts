import * as Schema from "effect/Schema";

const DeviceCode = Schema.Struct({
  device_code: Schema.NonEmptyString,
  user_code: Schema.NonEmptyString,
  verification_uri: Schema.String,
  expires_in: Schema.Number.check(Schema.isGreaterThan(0)),
  interval: Schema.optional(Schema.Number.check(Schema.isGreaterThan(0))),
});
const Token = Schema.Struct({
  access_token: Schema.NonEmptyString,
  refresh_token: Schema.optional(Schema.NonEmptyString),
  expires_in: Schema.Number.check(Schema.isGreaterThan(0)),
});
const StoredToken = Schema.Struct({
  ...Token.fields,
  expiresAt: Schema.Number,
});
export const decodeToken = Schema.decodeUnknownSync(Token);
export const decodeCode = Schema.decodeUnknownSync(DeviceCode);
export const decodeStored = Schema.decodeUnknownSync(StoredToken);
export type NexiDeviceCode = typeof DeviceCode.Type;
export type NexiTokens = typeof StoredToken.Type;
export class NexiSignInRequiredError extends Error {}
export interface NexiOAuthConfig {
  app: string;
  deviceEndpoint: string;
  tokenEndpoint: string;
}
export interface NexiTokenStorage {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  clear(): Promise<void>;
}
