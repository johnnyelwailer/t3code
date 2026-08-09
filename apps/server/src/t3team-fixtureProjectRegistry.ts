import { MockIntegrationProvider } from "@t3tools/integrations-core/mock";
import * as Effect from "effect/Effect";

import { T3TeamFixtureIntegrationProvider } from "./t3team-fixtureProjectProvider.ts";

/**
 * Fixture project sources (Epic 10 §File Size "static fixture data", Epic 04 §Stale fallback).
 *
 * Source-kind decision: a fixture project keeps `source.provider === "atlassian"` and is
 * identified by an account id under the `fixture:` namespace. The alternative — a distinct
 * `"fixture"` provider kind — would silently disable large parts of the product, because
 * these paths key on the literal string `"atlassian"`:
 *   - `t3team-contextRefreshGraphHelpers.ts#fetchT3TeamContextSnapshot` builds its refs with
 *     `provider: "atlassian"`;
 *   - `apps/web/.../t3team-sidecarRecipeRenderContext.ts` only attaches ticket context when
 *     `project.source.provider === "atlassian"` — with a `"fixture"` kind the recipe render
 *     context would carry no work item, so `workitem.type` would stay unset and every
 *     type-gated recipe would remain invisible (the exact bug this exists to fix);
 *   - `appliesTo.projectSourceKinds` compares against `source.provider`, so recipes written
 *     as `projectSourceKinds: ["atlassian"]` would stop matching.
 * The account-id namespace keeps fixture-ness explicit and greppable without forking those
 * code paths. No pack recipe currently gates on `projectSourceKinds`, so nothing in the
 * shipped library depends on either choice.
 */
export const T3TEAM_FIXTURE_ACCOUNT_PREFIX = "fixture:";

export const T3TEAM_FIXTURE_PROJECT_ROOT_ENV = "T3TEAM_FIXTURE_PROJECT_ROOT";
export const T3TEAM_FIXTURE_PROJECT_ACCOUNT_ENV = "T3TEAM_FIXTURE_PROJECT_ACCOUNT_ID";

const mockProvider = new MockIntegrationProvider();
const fixtureProviders = new Map<string, T3TeamFixtureIntegrationProvider>();
let envRegistrationDone = false;

export function isT3TeamFixtureAccountId(accountId: string | null | undefined): boolean {
  return typeof accountId === "string" && accountId.startsWith(T3TEAM_FIXTURE_ACCOUNT_PREFIX);
}

export function buildT3TeamFixtureAccountId(name: string): string {
  return `${T3TEAM_FIXTURE_ACCOUNT_PREFIX}${name}`;
}

export function registerT3TeamFixtureProject(input: {
  readonly accountId: string;
  readonly fixtureRoot: string;
}): T3TeamFixtureIntegrationProvider {
  const provider = new T3TeamFixtureIntegrationProvider(input);
  fixtureProviders.set(input.accountId, provider);
  return provider;
}

export function clearT3TeamFixtureProjects(): void {
  fixtureProviders.clear();
  envRegistrationDone = false;
}

/**
 * Honor `T3TEAM_FIXTURE_PROJECT_ROOT` once per process so a plain `dev`/`dev:agent` server
 * serves a fixture project without any CLI step.
 */
function registerFixtureProjectsFromEnv(): void {
  if (envRegistrationDone) {
    return;
  }
  envRegistrationDone = true;
  const fixtureRoot = process.env[T3TEAM_FIXTURE_PROJECT_ROOT_ENV]?.trim();
  if (!fixtureRoot) {
    return;
  }
  const accountId =
    process.env[T3TEAM_FIXTURE_PROJECT_ACCOUNT_ENV]?.trim() || buildT3TeamFixtureAccountId("demo");
  try {
    registerT3TeamFixtureProject({ accountId, fixtureRoot });
  } catch {
    // A bad fixture path must not take the server down; the project simply stays unbound.
  }
}

export function findT3TeamFixtureProvider(
  accountId: string | null | undefined,
): T3TeamFixtureIntegrationProvider | null {
  registerFixtureProjectsFromEnv();
  return (accountId ? fixtureProviders.get(accountId) : null) ?? null;
}

/**
 * Seam used by `providerForAccount`: a fixture account resolves to its fixture provider,
 * everything else keeps the previous mock fallback.
 */
export function t3teamFixtureOrMockProvider(accountId: string) {
  return Effect.sync(() => findT3TeamFixtureProvider(accountId) ?? mockProvider);
}
