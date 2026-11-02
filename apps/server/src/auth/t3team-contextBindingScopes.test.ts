import {
  AuthOrchestrationOperateScope,
  clientRpcRequiredScopes,
  WS_METHODS,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import { requiredScopeForRpcMethod } from "./RpcAuthorization.ts";

describe("context binding RPC scope", () => {
  it("needs operate scope on the server and in the client permission guard", () => {
    expect(requiredScopeForRpcMethod(WS_METHODS.t3teamContextBindingRecord)).toBe(
      AuthOrchestrationOperateScope,
    );
    expect(clientRpcRequiredScopes(WS_METHODS.t3teamContextBindingRecord, undefined)).toEqual([
      AuthOrchestrationOperateScope,
    ]);
  });
});
