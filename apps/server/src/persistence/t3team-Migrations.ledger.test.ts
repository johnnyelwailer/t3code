import { assert, it } from "@effect/vitest";

import { migrationEntries } from "./Migrations.ts";

it("keeps the fork ledger's released ids contiguous and every id unique and increasing", () => {
  // The fork ledger keeps its own ids 1..85 (upstream 055/056 sit at 84/85); fork migrations from
  // 86 are allocated in reserved blocks, so later ids may skip, but never repeat or go backwards.
  const ids = migrationEntries.map(([id]) => id);
  assert.deepStrictEqual(
    ids.filter((id) => id <= 85),
    Array.from({ length: 85 }, (_, index) => index + 1),
  );
  assert.ok(ids.every((id, index) => index === 0 || id > ids[index - 1]!));
});
