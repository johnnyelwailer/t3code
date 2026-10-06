import type { AccountDefinition } from "@t3team/pack-api";

/**
 * The accounts the compiled-in distribution defines (`defineAccount`), set once at activation by
 * `t3team-distribution-bootstrap` and read by `t3team-Accounts`. Empty for a build without one.
 */
let accounts: ReadonlyArray<AccountDefinition> = [];

export const setPackAccounts = (definitions: ReadonlyArray<AccountDefinition>): void => {
  const ids = new Set<string>();
  for (const definition of definitions) {
    if (ids.has(definition.id)) throw new Error(`Account ${definition.id} is defined twice`);
    ids.add(definition.id);
  }
  accounts = definitions;
};

export const packAccounts = (): ReadonlyArray<AccountDefinition> => accounts;
