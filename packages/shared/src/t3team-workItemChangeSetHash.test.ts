// @effect-diagnostics-next-line nodeBuiltinImport:off -- independent SHA-256 vectors from node:crypto.
import * as NodeCrypto from "node:crypto";

import { describe, expect, it } from "vite-plus/test";

import { hashDraftPayload, verifyDraftPayloadHash } from "./t3team-workItemChangeSetHash.ts";

const draft = {
  target: { provider: "jira", issueIdOrKey: "A-1" },
  field: "comment",
  patch: { body: "hi", n: [1, undefined] },
} as const;

const nodeSha256 = (text: string) => NodeCrypto.createHash("sha256").update(text).digest("hex");

describe("work item change set payload hash", () => {
  it("is the node:crypto SHA-256 of the key-sorted JSON, for single-block, multi-block and unicode input", () => {
    const cases = [
      { patch: { body: "" }, canonical: '{"field":"comment","patch":{"body":""},"target":' },
      { patch: { body: "abc" }, canonical: '{"field":"comment","patch":{"body":"abc"},"target":' },
      {
        patch: { body: "x".repeat(500) },
        canonical: `{"field":"comment","patch":{"body":"${"x".repeat(500)}"},"target":`,
      },
      {
        patch: { body: "Grüße 😀 日本語" },
        canonical: '{"field":"comment","patch":{"body":"Grüße 😀 日本語"},"target":',
      },
    ];
    for (const { patch, canonical } of cases) {
      const target = { provider: "jira", issueIdOrKey: "A-1" };
      expect(hashDraftPayload({ target, field: "comment", patch })).toBe(
        nodeSha256(`${canonical}{"issueIdOrKey":"A-1","provider":"jira"}}`),
      );
    }
  });

  it("matches known SHA-256 digests of the empty string and abc through the same primitive", () => {
    expect(nodeSha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(nodeSha256("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("pins a real draft payload to its node:crypto digest, independent of key order and undefined", () => {
    const expected = nodeSha256(
      '{"field":"comment","patch":{"body":"hi","n":[1,null]},"target":{"issueIdOrKey":"A-1","provider":"jira"}}',
    );
    expect(hashDraftPayload(draft)).toBe(expected);
    expect(expected).toBe("26f2d9f2f0f6d698380cbba689bc003288e3991cd793295249f68bed6e446314");
    const reordered = {
      patch: { n: [1, null], body: "hi" },
      field: "comment",
      target: { issueIdOrKey: "A-1", provider: "jira" },
    } as const;
    expect(hashDraftPayload(reordered as never)).toBe(expected);
  });

  it("fails verification once anything the client acts on changed", () => {
    const operation = { payloadHash: hashDraftPayload(draft) };
    expect(verifyDraftPayloadHash(draft, operation)).toBe(true);
    for (const changed of [
      { ...draft, patch: { ...draft.patch, body: "other" } },
      { ...draft, field: "description" },
      { ...draft, target: { ...draft.target, issueIdOrKey: "A-2" } },
    ]) {
      expect(verifyDraftPayloadHash(changed as never, operation)).toBe(false);
    }
  });
});
