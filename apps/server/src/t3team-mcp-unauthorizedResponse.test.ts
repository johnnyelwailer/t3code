import { expect, it } from "@effect/vitest";

import { mcpUnauthorizedResponse } from "./t3team-mcp-unauthorizedResponse.ts";

const readBody = (response: ReturnType<typeof mcpUnauthorizedResponse>) => {
  const body = response.body;
  if (body._tag !== "Uint8Array") throw new Error(`expected a JSON body, got ${body._tag}`);
  return JSON.parse(new TextDecoder().decode(body.body)) as {
    error: string;
    reason: string;
    recoverable: boolean;
    message: string;
  };
};

it("names the cause of a rejected credential instead of implying the server is down", () => {
  const expired = mcpUnauthorizedResponse("unknown_or_expired_token");
  expect(expired.status).toBe(401);
  expect(expired.headers["www-authenticate"]).toBe("Bearer");

  const expiredBody = readBody(expired);
  expect(expiredBody.error).toBe("invalid_mcp_credential");
  expect(expiredBody.reason).toBe("unknown_or_expired_token");
  expect(expiredBody.recoverable).toBe(true);
  // An agent must be able to tell "my credential died" from "the platform is
  // down" — the incident this guards against was the second reading.
  expect(expiredBody.message).toContain("The T3 Code server is running");
  expect(expiredBody.message).toContain("re-establish");

  const missingBody = readBody(mcpUnauthorizedResponse("missing_bearer_token"));
  expect(missingBody.reason).toBe("missing_bearer_token");
  expect(missingBody.recoverable).toBe(false);
  expect(missingBody.message).toContain("The T3 Code server is running");
});
