/**
 * `getConfig()` (G12): the run's recipe config for one repository, resolved by the host from the
 * recipe's `defaults`, the project's `<recipeId>.config.ts` and the caller's and run's values,
 * and journaled, so a replay reads the same values even after the file changed. An edit applies
 * at the next call (the next pass or run), never to an answer already recorded.
 */
import type { MessageBroker } from "./t3team-sdk.broker.ts";
import { fromRun } from "./t3team-sdk.engineApi.ts";
import type { HandleDispatch } from "./t3team-sdk.handles.ts";
import type { ResolvedRecipeConfig } from "./t3team-sdk.recipeConfig.ts";

export const CONFIG_RESOLVE_KIND = "config.resolve" as const;

/** The host could not resolve the config (no recipe behind the run, an unreadable project). */
export class RecipeConfigError extends Error {
  readonly _tag = "RecipeConfigError" as const;
  constructor(message: string) {
    super(message);
    this.name = "RecipeConfigError";
  }
}

export interface RecipeConfigQuery {
  /** `owner/name`, or `host/owner/name`; absent resolves without any scope. */
  readonly repository?: string;
  /** What the calling recipe passed in its `with` block for this recipe. */
  readonly caller?: Readonly<Record<string, unknown>>;
  /** This run's own values (its arguments, the user's per-run choice): the top layer. */
  readonly run?: Readonly<Record<string, unknown>>;
}

export interface RecipeConfigReader<Inputs> {
  readonly for: (query?: RecipeConfigQuery) => Promise<ResolvedRecipeConfig<Inputs>>;
}

export interface RecipeConfigPrimitives {
  readonly getConfig: <Inputs = Record<string, unknown>>() => RecipeConfigReader<Inputs>;
}

type HostAnswer<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

export function createRecipeConfigPrimitives(deps: {
  readonly dispatch: HandleDispatch;
  readonly broker: MessageBroker;
}): RecipeConfigPrimitives {
  const read = async <Inputs>(query: RecipeConfigQuery = {}) => {
    const payload = { ...query };
    const correlationId = await deps.dispatch.send({
      kind: CONFIG_RESOLVE_KIND,
      refId: query.repository ?? "*",
      args: payload,
      fire: (cid, resolver) =>
        deps.broker.send({ correlationId: cid, kind: CONFIG_RESOLVE_KIND, payload }, resolver),
    });
    const answer = await deps.dispatch.awaitResolution<HostAnswer<ResolvedRecipeConfig<Inputs>>>(
      correlationId,
      undefined,
    );
    if (!answer.ok) throw new RecipeConfigError(answer.error);
    return answer.value;
  };
  return { getConfig: <Inputs>() => ({ for: (query?: RecipeConfigQuery) => read<Inputs>(query) }) };
}

/** The run's recipe config: `await getConfig<Inputs>().for({ repository })`. */
export function getConfig<Inputs = Record<string, unknown>>(): RecipeConfigReader<Inputs> {
  return fromRun<RecipeConfigPrimitives["getConfig"]>("getConfig")<Inputs>();
}
