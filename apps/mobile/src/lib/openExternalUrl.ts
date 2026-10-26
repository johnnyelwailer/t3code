import * as Schema from "effect/Schema";
import { Linking } from "react-native";

import { APP_PRIVATE_URL_MESSAGE, isAppPrivateUrl } from "./t3team-urlPolicy";

const ExternalUrlTarget = Schema.Literals([
  "file-preview",
  "markdown-link",
  "pull-request",
  "provider-auth",
  "html-render",
  "mcp-app",
]);

export type ExternalUrlTarget = typeof ExternalUrlTarget.Type;

export class ExternalUrlOpenError extends Schema.TaggedError<ExternalUrlOpenError>()(
  "ExternalUrlOpenError",
  {
    target: ExternalUrlTarget,
    scheme: Schema.String,
    host: Schema.optional(Schema.String),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to open ${this.target} URL with the ${this.scheme} scheme.`;
  }
}

function externalUrlMetadata(url: string): { readonly scheme: string; readonly host?: string } {
  try {
    const parsed = new URL(url);
    return {
      scheme: parsed.protocol.replace(/:$/, "") || "unknown",
      host: parsed.hostname || undefined,
    };
  } catch {
    return {
      scheme: /^([a-z][a-z\d+.-]*):/i.exec(url)?.[1]?.toLowerCase() ?? "unknown",
    };
  }
}

export async function tryOpenExternalUrl(url: string, target: ExternalUrlTarget): Promise<boolean> {
  try {
    // A URL that only works inside this app is never handed to another app.
    if (isAppPrivateUrl(url)) throw new Error(APP_PRIVATE_URL_MESSAGE);
    await Linking.openURL(url);
    return true;
  } catch (cause) {
    const error = new ExternalUrlOpenError({ target, ...externalUrlMetadata(url), cause });
    console.error(error.message, {
      _tag: error._tag,
      target: error.target,
      scheme: error.scheme,
      host: error.host,
      stack: error.stack,
    });
    return false;
  }
}
