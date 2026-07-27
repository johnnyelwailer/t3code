import type { IntegrationProvider } from "@t3tools/integrations-core";
import type {
  CommitMutationInput,
  ExternalProject,
  IntegrationAccount,
  IntegrationAccountRef,
  IntegrationAction,
  IntegrationSearchInput,
  ListResourcesInput,
  MutationResult,
  PrepareMutationInput,
  PreparedMutation,
  ResourceSearchResult,
} from "@t3tools/integrations-core";
import type { ResourcePage, ResourceSnapshot } from "@t3tools/project-context";

import {
  loadT3TeamFixtureProjectSource,
  type T3TeamFixtureProjectSource,
} from "./t3team-fixtureProjectSourceLoad.ts";
import {
  fixtureResourcePage,
  fixtureTicketToResourceSnapshot,
} from "./t3team-fixtureProjectSourceRefs.ts";

const FIXTURE_FETCHED_AT = "2026-07-20T08:00:00.000Z";

/**
 * A fixture-directory-backed `IntegrationProvider`. It is a peer of
 * `MockIntegrationProvider`: the same interface, but the data comes from a fixture bundle
 * on disk instead of hardcoded constants, so a project can be ingested through the real
 * refresh pipeline with zero credentials and zero network access.
 */
export class T3TeamFixtureIntegrationProvider implements IntegrationProvider {
  readonly id = "atlassian";
  readonly kind = "atlassian";
  readonly accountId: string;
  readonly fixtureRoot: string;
  #source: T3TeamFixtureProjectSource;

  constructor(input: { readonly accountId: string; readonly fixtureRoot: string }) {
    this.accountId = input.accountId;
    this.fixtureRoot = input.fixtureRoot;
    this.#source = loadT3TeamFixtureProjectSource(input);
  }

  get source(): T3TeamFixtureProjectSource {
    return this.#source;
  }

  /** Re-read the fixture directory (a fixture can be edited while a dev server runs). */
  reload(): void {
    this.#source = loadT3TeamFixtureProjectSource({
      accountId: this.accountId,
      fixtureRoot: this.fixtureRoot,
    });
  }

  async listAccounts(): Promise<ReadonlyArray<IntegrationAccount>> {
    return [
      {
        id: this.accountId,
        provider: "atlassian",
        label: `${this.#source.project.title} (fixture)`,
      },
    ];
  }

  async listProjects(_account: IntegrationAccountRef): Promise<ReadonlyArray<ExternalProject>> {
    const project = this.#source.project;
    return [
      {
        id: this.#source.externalProjectId,
        provider: "atlassian",
        title: project.title,
        ...(project.source.externalProjectKey ? { key: project.source.externalProjectKey } : {}),
        raw: { siteId: this.accountId, fixtureRoot: this.fixtureRoot },
      },
    ];
  }

  async listResources(input: ListResourcesInput): Promise<ResourcePage> {
    if (input.externalProjectId !== this.#source.externalProjectId) {
      return { items: [], totalCount: 0 };
    }
    const page = fixtureResourcePage(this.#source);
    return typeof input.limit === "number"
      ? { items: page.items.slice(0, input.limit), totalCount: page.totalCount }
      : page;
  }

  async getResource(ref: unknown): Promise<ResourceSnapshot> {
    const requested = ref as { readonly id?: unknown; readonly displayId?: unknown };
    const key = String(requested.displayId ?? requested.id ?? "").toUpperCase();
    const ticket = this.#source.ticketsByKey.get(key);
    if (!ticket) {
      throw new Error(`Fixture resource not found: ${key || "(missing id)"}`);
    }
    return fixtureTicketToResourceSnapshot({
      ticket,
      source: this.#source,
      fetchedAt: FIXTURE_FETCHED_AT,
    });
  }

  async search(input: IntegrationSearchInput): Promise<ReadonlyArray<ResourceSearchResult>> {
    const needle = input.query.trim().toLowerCase();
    if (needle.length === 0) {
      return [];
    }
    return fixtureResourcePage(this.#source)
      .items.filter(
        (item) =>
          item.title.toLowerCase().includes(needle) ||
          (item.description ?? "").toLowerCase().includes(needle),
      )
      .map((item) => ({ ref: item, score: 1 }));
  }

  /**
   * Present so the fixture provider stays assignable wherever the Atlassian/mock providers
   * are used (`t3team-atlassian-routes.ts`, the asset-content route). A fixture bundle ships
   * no binary assets, so this always fails rather than inventing bytes.
   */
  async downloadAsset(url: string): Promise<{ bytes: Uint8Array; mimeType?: string }> {
    throw new Error(`Fixture project source has no downloadable assets: ${url}`);
  }

  async getAvailableActions(_ref: unknown): Promise<ReadonlyArray<IntegrationAction>> {
    return [];
  }

  async prepareMutation(input: PrepareMutationInput): Promise<PreparedMutation> {
    return {
      mutationId: `fixture-${input.actionId}`,
      preview: `Fixture project source is read-only; ${input.actionId} would not be committed.`,
      editableFields: [],
      payload: input.payload,
    };
  }

  async commitMutation(_input: CommitMutationInput): Promise<MutationResult> {
    return {
      success: false,
      errorMessage: "Fixture project source is read-only.",
    };
  }
}
