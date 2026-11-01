import { assert, describe, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import { ProjectId } from "./baseSchemas.ts";

import {
  T3TEAM_CONTEXT_BINDING_FACT_KEY,
  T3TeamContextBinding,
  T3TeamContextBindingRecordInput,
  readThreadContextBinding,
} from "./t3team-contextBinding.ts";

const is = Schema.is(T3TeamContextBinding);
const base = { version: 1, projectId: "project-x" } as const;

describe("T3TeamContextBinding", () => {
  it("accepts each kind with the reference it needs", () => {
    assert.isTrue(is({ ...base, kind: "my-work" }));
    assert.isTrue(is({ ...base, kind: "project-dashboard" }));
    assert.isTrue(is({ ...base, kind: "work-item", workItemKey: "NX-12" }));
    assert.isTrue(
      is({
        ...base,
        kind: "change-request",
        changeRequest: { repository: "hive/nx-nexi", number: 7, host: "github.com" },
      }),
    );
    assert.isTrue(
      is({
        ...base,
        kind: "change-request",
        changeRequest: { repository: "hive/nx-nexi", number: 7 },
      }),
    );
  });

  it("rejects a missing reference, an unknown kind or version, and bad numbers", () => {
    assert.isFalse(is({ ...base, kind: "work-item" }));
    assert.isFalse(is({ ...base, kind: "change-request" }));
    assert.isFalse(is({ ...base, kind: "inbox" }));
    assert.isFalse(is({ ...base, version: 2, kind: "my-work" }));
    assert.isFalse(is({ ...base, kind: "work-item", workItemKey: "  " }));
    assert.isFalse(
      is({ ...base, kind: "change-request", changeRequest: { repository: "r", number: 0 } }),
    );
    assert.isFalse(is({ version: 1, kind: "my-work" }));
  });

  it("requires a thread id on the record input", () => {
    const isInput = Schema.is(T3TeamContextBindingRecordInput);
    assert.isTrue(isInput({ threadId: "thread:a", binding: { ...base, kind: "my-work" } }));
    assert.isFalse(isInput({ binding: { ...base, kind: "my-work" } }));
  });
});

describe("readThreadContextBinding", () => {
  const binding = { ...base, kind: "my-work" } as const;

  it("reads a well-formed fact and ignores absent, malformed or newer ones", () => {
    const withValue = (value: unknown) => ({
      extensions: { [T3TEAM_CONTEXT_BINDING_FACT_KEY]: value },
    });
    assert.deepStrictEqual(readThreadContextBinding(withValue(binding)), {
      ...binding,
      projectId: ProjectId.make("project-x"),
    });
    assert.isNull(readThreadContextBinding(undefined));
    assert.isNull(readThreadContextBinding({ extensions: {} }));
    assert.isNull(readThreadContextBinding(withValue({ ...binding, version: 2 })));
    assert.isNull(readThreadContextBinding(withValue("my-work")));
  });
});
