import { useCallback, useEffect, useMemo } from "react";

import {
  resolveSidecarComposition,
  type SidecarComposition,
  type SidecarPersonalization,
} from "@t3tools/project-recipes";

import { useServerConfig } from "~/t3work/t3work-serverState";
import {
  configureStoredSidecarPersonalizationPersister,
  persistStoredSidecarPersonalization,
  readStoredSidecarPersonalizationFromServerSettings,
} from "~/t3work/hooks/t3work-sidecarCompositionPersistence";
import {
  appendUniqueItem,
  removeItem,
  resolveStoredComposition,
  updateSectionItemMap,
  updateSectionState,
} from "~/t3work/hooks/t3work-sidecarCompositionState";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";

export function useT3workSidecarComposition(input: {
  bundledDefault: SidecarComposition;
  profileDefault?: SidecarComposition | undefined;
  projectDefault?: SidecarComposition | undefined;
}) {
  const serverConfig = useServerConfig();
  const environmentId = usePrimaryEnvironmentId();
  const updateServerSettings = useAtomCommand(serverEnvironment.updateSettings, {
    label: "t3work.sidecar.updateSettings",
  });
  const personalization = useMemo(
    () => readStoredSidecarPersonalizationFromServerSettings(serverConfig?.settings),
    [serverConfig?.settings.t3workStoredSidecarCompositionJson],
  );

  useEffect(() => {
    if (environmentId === null) {
      return;
    }
    return configureStoredSidecarPersonalizationPersister(async (nextJson) => {
      await updateServerSettings({
        environmentId,
        input: { patch: { t3workStoredSidecarCompositionJson: nextJson } },
      });
    });
  }, [environmentId, updateServerSettings]);

  const composition = useMemo(
    () =>
      resolveSidecarComposition({
        bundledDefault: input.bundledDefault,
        profileDefault: input.profileDefault,
        projectDefault: input.projectDefault,
        userOverrides: personalization.composition,
      }),
    [input.bundledDefault, input.profileDefault, input.projectDefault, personalization],
  );

  const persistPersonalization = useCallback(
    (
      update: (
        current: SidecarPersonalization,
        baseComposition: SidecarComposition,
      ) => SidecarPersonalization,
    ) => {
      persistStoredSidecarPersonalization(
        update(personalization, resolveStoredComposition(personalization, composition)),
      );
    },
    [composition, personalization],
  );

  const setCollapsed = useCallback(
    (sectionId: string, collapsed: boolean) => {
      persistPersonalization((current, baseComposition) => ({
        ...current,
        composition: {
          sections: updateSectionState(baseComposition.sections, sectionId, { collapsed }),
        },
      }));
    },
    [persistPersonalization],
  );

  const hideSection = useCallback(
    (sectionId: string) => {
      persistPersonalization((current, baseComposition) => ({
        ...current,
        composition: {
          sections: updateSectionState(baseComposition.sections, sectionId, { visible: false }),
        },
      }));
    },
    [persistPersonalization],
  );

  const moveSection = useCallback(
    (sectionId: string, direction: "up" | "down") => {
      persistPersonalization((current, baseComposition) => {
        const currentIndex = baseComposition.sections.findIndex(
          (section) => section.sectionId === sectionId,
        );

        if (currentIndex < 0) {
          return current;
        }

        const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex < 0 || targetIndex >= baseComposition.sections.length) {
          return current;
        }

        const nextSections = [...baseComposition.sections];
        const [movedSection] = nextSections.splice(currentIndex, 1);
        if (!movedSection) {
          return current;
        }
        nextSections.splice(targetIndex, 0, movedSection);

        return {
          ...current,
          composition: { sections: nextSections },
        };
      });
    },
    [persistPersonalization],
  );

  const hideItem = useCallback(
    (sectionId: string, itemId: string) => {
      persistPersonalization((current) => ({
        ...current,
        itemHides: updateSectionItemMap(
          current.itemHides,
          sectionId,
          appendUniqueItem(current.itemHides?.[sectionId], itemId),
        ),
        itemPins: updateSectionItemMap(
          current.itemPins,
          sectionId,
          removeItem(current.itemPins?.[sectionId], itemId),
        ),
      }));
    },
    [persistPersonalization],
  );

  const pinItem = useCallback(
    (sectionId: string, itemId: string) => {
      persistPersonalization((current) => ({
        ...current,
        itemPins: updateSectionItemMap(
          current.itemPins,
          sectionId,
          appendUniqueItem(current.itemPins?.[sectionId], itemId),
        ),
        itemHides: updateSectionItemMap(
          current.itemHides,
          sectionId,
          removeItem(current.itemHides?.[sectionId], itemId),
        ),
      }));
    },
    [persistPersonalization],
  );

  const unpinItem = useCallback(
    (sectionId: string, itemId: string) => {
      persistPersonalization((current) => ({
        ...current,
        itemPins: updateSectionItemMap(
          current.itemPins,
          sectionId,
          removeItem(current.itemPins?.[sectionId], itemId),
        ),
      }));
    },
    [persistPersonalization],
  );

  return {
    composition,
    setCollapsed,
    hideSection,
    moveSection,
    hideItem,
    pinItem,
    unpinItem,
    personalization,
    userOverrides: personalization,
  };
}
