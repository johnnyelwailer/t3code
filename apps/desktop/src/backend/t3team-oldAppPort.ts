// @effect-diagnostics nodeBuiltinImport:off - probes 127.0.0.1:3773 for the daily Nexi environment descriptor.
import * as NodeHttp from "node:http";

import { ENVIRONMENT_DESCRIPTOR_PATH, OLD_NEXI_BACKEND_PORT } from "./t3team-oldAppPaths.ts";

export type PortProbeResult =
  | { readonly kind: "identified"; readonly serverVersion?: string }
  | { readonly kind: "not-listening" }
  | { readonly kind: "other" };

const looksLikeEnvironmentDescriptor = (value: unknown): value is {
  environmentId?: unknown;
  serverVersion?: unknown;
  platform?: unknown;
} => {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.environmentId === "string" &&
    typeof row.serverVersion === "string" &&
    typeof row.platform === "string"
  );
};

/**
 * GET `/.well-known/t3/environment` on 127.0.0.1 at the daily app's port.
 * Only an identifying T3/Nexi descriptor counts; an unrelated listener does not.
 */
export function probeOldNexiPort(input?: {
  readonly host?: string;
  readonly port?: number;
  readonly path?: string;
  readonly timeoutMs?: number;
  readonly fetch?: (url: string, timeoutMs: number) => Promise<{ status: number; body: string }>;
}): Promise<PortProbeResult> {
  const host = input?.host ?? "127.0.0.1";
  const port = input?.port ?? OLD_NEXI_BACKEND_PORT;
  const path = input?.path ?? ENVIRONMENT_DESCRIPTOR_PATH;
  const timeoutMs = input?.timeoutMs ?? 400;
  const url = `http://${host}:${port}${path}`;
  const run = input?.fetch ?? getText;
  return run(url, timeoutMs)
    .then((response) => {
      if (response.status < 200 || response.status >= 300) return { kind: "other" } as const;
      try {
        const parsed: unknown = JSON.parse(response.body);
        if (!looksLikeEnvironmentDescriptor(parsed)) return { kind: "other" } as const;
        return {
          kind: "identified" as const,
          ...(typeof parsed.serverVersion === "string"
            ? { serverVersion: parsed.serverVersion }
            : {}),
        };
      } catch {
        return { kind: "other" } as const;
      }
    })
    .catch((error: unknown) => {
      const code =
        error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "";
      if (
        code === "ECONNREFUSED" ||
        code === "ENOTFOUND" ||
        code === "EHOSTUNREACH" ||
        code === "ECONNRESET" ||
        code === "ETIMEDOUT" ||
        code === "ABORT_ERR"
      ) {
        return { kind: "not-listening" } as const;
      }
      // A timeout on an open port that never identifies is "other", not the old app.
      return { kind: "other" } as const;
    });
}

function getText(url: string, timeoutMs: number): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = NodeHttp.get(url, { timeout: timeoutMs }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      response.on("end", () => {
        resolve({
          status: response.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
      response.on("error", reject);
    });
    request.on("timeout", () => {
      request.destroy();
      const error = new Error("timeout");
      (error as Error & { code: string }).code = "ETIMEDOUT";
      reject(error);
    });
    request.on("error", reject);
  });
}
