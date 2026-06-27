import * as Schema from "effect/Schema";

import {
  DEFAULT_CLIENT_SETTINGS,
  type ClientSettings,
  type ServerSettings,
} from "@t3tools/contracts";
import {
  SidecarComposition as SidecarCompositionSchema,
  type SidecarComposition,
  SidecarPersonalization as SidecarPersonalizationSchema,
  type SidecarPersonalization,
} from "@t3tools/project-recipes";

import { readLocalApi } from "~/localApi";

const SIDECAR_COMPOSITION_PERSISTENCE_ERROR_SCOPE = "[SIDECAR_COMPOSITION]";

const decodeSidecarComposition = Schema.decodeUnknownSync(SidecarCompositionSchema);
const decodeSidecarPersonalization = Schema.decodeUnknownSync(SidecarPersonalizationSchema);
const EMPTY_SIDECAR_COMPOSITION: SidecarComposition = { sections: [] };
const EMPTY_SIDECAR_PERSONALIZATION: SidecarPersonalization = {};

function normalizeSidecarComposition(composition: SidecarComposition): SidecarComposition {
  const sections = new Map<string, SidecarComposition["sections"][number]>();

  for (const section of composition.sections) {
    if (sections.has(section.sectionId)) {
      sections.delete(section.sectionId);
    }
    sections.set(section.sectionId, section);
  }

  return { sections: [...sections.values()] };
}

function normalizeSidecarItemIds(itemIds: ReadonlyArray<string>): ReadonlyArray<string> {
  const normalized = new Map<string, string>();

  for (const itemId of itemIds) {
    if (normalized.has(itemId)) {
      normalized.delete(itemId);
    }
    normalized.set(itemId, itemId);
  }

  return [...normalized.keys()];
}

function normalizeSidecarItemMap(
  itemMap: Readonly<Record<string, ReadonlyArray<string>>> | undefined,
): Readonly<Record<string, ReadonlyArray<string>>> | undefined {
  if (!itemMap) {
    return undefined;
  }

  const normalizedEntries = Object.entries(itemMap)
    .map(([sectionId, itemIds]) => [sectionId, normalizeSidecarItemIds(itemIds)] as const)
    .filter(([, itemIds]) => itemIds.length > 0);

  return normalizedEntries.length > 0 ? Object.fromEntries(normalizedEntries) : undefined;
}

function normalizeSidecarPersonalization(
  personalization: SidecarPersonalization,
): SidecarPersonalization {
  const composition = personalization.composition
    ? normalizeSidecarComposition(personalization.composition)
    : undefined;
  const itemHides = normalizeSidecarItemMap(personalization.itemHides);
  const itemPins = normalizeSidecarItemMap(personalization.itemPins);
  const itemOrderOverrides = normalizeSidecarItemMap(personalization.itemOrderOverrides);

  return {
    ...(composition ? { composition } : {}),
    ...(itemHides ? { itemHides } : {}),
    ...(itemPins ? { itemPins } : {}),
    ...(itemOrderOverrides ? { itemOrderOverrides } : {}),
  };
}

function encodeSidecarPersonalization(personalization: SidecarPersonalization): string {
  return JSON.stringify(normalizeSidecarPersonalization(personalization));
}

function parseSidecarPersonalization(raw: string | undefined): SidecarPersonalization {
  try {
    if (!raw) {
      return EMPTY_SIDECAR_PERSONALIZATION;
    }

    const parsed = JSON.parse(raw);

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "sections" in parsed &&
      !("composition" in parsed)
    ) {
      return normalizeSidecarPersonalization({
        composition: normalizeSidecarComposition(decodeSidecarComposition(parsed)),
      });
    }

    try {
      return normalizeSidecarPersonalization(decodeSidecarPersonalization(parsed));
    } catch {
      return normalizeSidecarPersonalization({
        composition: normalizeSidecarComposition(decodeSidecarComposition(parsed)),
      });
    }
  } catch {
    return EMPTY_SIDECAR_PERSONALIZATION;
  }
}

export function readStoredSidecarPersonalizationFromClientSettings(
  settings: ClientSettings | null | undefined,
): SidecarPersonalization {
  return parseSidecarPersonalization(settings?.t3workStoredSidecarCompositionJson);
}

export function readStoredSidecarPersonalizationFromServerSettings(
  settings: Pick<ServerSettings, "t3workStoredSidecarCompositionJson"> | null | undefined,
): SidecarPersonalization {
  return parseSidecarPersonalization(settings?.t3workStoredSidecarCompositionJson);
}

export async function hydrateStoredSidecarComposition(): Promise<SidecarPersonalization> {
  const localApi = readLocalApi();
  if (!localApi) {
    return EMPTY_SIDECAR_PERSONALIZATION;
  }

  try {
    const serverSettings = await localApi.server.getSettings();
    const personalization = readStoredSidecarPersonalizationFromServerSettings(serverSettings);
    const nextJson = encodeSidecarPersonalization(personalization);
    const currentJson = serverSettings.t3workStoredSidecarCompositionJson ?? "";

    if (currentJson !== nextJson && (currentJson.length > 0 || nextJson !== "{}")) {
      await localApi.server.updateSettings({
        t3workStoredSidecarCompositionJson: nextJson,
      });
    }

    return personalization;
  } catch {
    return EMPTY_SIDECAR_PERSONALIZATION;
  }
}

let persistStoredSidecarPersonalizationQueue: Promise<void> = Promise.resolve();

export function persistStoredSidecarPersonalization(personalization: SidecarPersonalization): void {
  const localApi = readLocalApi();
  if (!localApi) {
    return;
  }

  const nextJson = encodeSidecarPersonalization(personalization);
  persistStoredSidecarPersonalizationQueue = persistStoredSidecarPersonalizationQueue
    .catch(() => undefined)
    .then(async () => {
      await localApi.server.updateSettings({
        t3workStoredSidecarCompositionJson: nextJson,
      });
    })
    .catch((error) => {
      console.error(`${SIDECAR_COMPOSITION_PERSISTENCE_ERROR_SCOPE} persist failed`, error);
    });
}

export function persistStoredSidecarComposition(composition: SidecarComposition): void {
  persistStoredSidecarPersonalization({ composition });
}

export function readStoredSidecarCompositionFromClientSettings(
  settings: ClientSettings | null | undefined,
): SidecarComposition {
  return (
    readStoredSidecarPersonalizationFromClientSettings(settings).composition ??
    EMPTY_SIDECAR_COMPOSITION
  );
}

export function readStoredSidecarCompositionFromServerSettings(
  settings: Pick<ServerSettings, "t3workStoredSidecarCompositionJson"> | null | undefined,
): SidecarComposition {
  return (
    readStoredSidecarPersonalizationFromServerSettings(settings).composition ??
    EMPTY_SIDECAR_COMPOSITION
  );
}

export async function clearLegacyStoredSidecarComposition(): Promise<void> {
  const localApi = readLocalApi();
  if (!localApi) {
    return;
  }

  const currentClientSettings =
    (await localApi.persistence.getClientSettings()) ?? DEFAULT_CLIENT_SETTINGS;

  await localApi.persistence.setClientSettings({
    ...DEFAULT_CLIENT_SETTINGS,
    ...currentClientSettings,
    t3workStoredSidecarCompositionJson: "",
  });
}
