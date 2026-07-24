import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Input } from "~/t3team/components/ui/t3team-input";
import { ToggleGroup } from "~/t3team/t3team-ToggleGroup";
import type {
  T3TeamRecipeLaunchSelection,
  T3TeamRecipeQuickStartLaunchCustomization,
} from "~/t3team/t3team-recipeQuickStartLaunch";
import { areT3TeamRecipeQuickStartLaunchCustomizationsEqual } from "~/t3team/t3team-recipeQuickStartLaunch";

type RecipeLaunchControlsContextValue = {
  readonly upsertSelection: (selection: T3TeamRecipeLaunchSelection) => void;
  readonly removeSelection: (name: string) => void;
  readonly getCustomization: () => T3TeamRecipeQuickStartLaunchCustomization | undefined;
};

const RecipeLaunchControlsContext = createContext<RecipeLaunchControlsContextValue | null>(null);

function toRecipeLaunchCustomization(
  selections: Record<string, T3TeamRecipeLaunchSelection>,
): T3TeamRecipeQuickStartLaunchCustomization | undefined {
  const values = Object.values(selections);
  return values.length > 0 ? { selections: values } : undefined;
}

function useRecipeLaunchControls() {
  const context = useContext(RecipeLaunchControlsContext);
  if (!context) {
    throw new Error("Recipe launch controls must be used inside RecipeLaunchControlsProvider.");
  }
  return context;
}

export function RecipeLaunchControlsProvider({
  onChange,
  children,
}: {
  readonly onChange?: (
    customization: T3TeamRecipeQuickStartLaunchCustomization | undefined,
  ) => void;
  readonly children: ReactNode;
}) {
  const selectionsRef = useRef<Record<string, T3TeamRecipeLaunchSelection>>({});
  const lastCustomizationRef = useRef<T3TeamRecipeQuickStartLaunchCustomization | undefined>(
    undefined,
  );
  // Always call the latest onChange without re-creating context on each render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const contextValue = useMemo<RecipeLaunchControlsContextValue>(() => {
    const emitCustomizationChange = (
      customization: T3TeamRecipeQuickStartLaunchCustomization | undefined,
    ) => {
      if (
        areT3TeamRecipeQuickStartLaunchCustomizationsEqual(
          lastCustomizationRef.current,
          customization,
        )
      ) {
        return;
      }

      lastCustomizationRef.current = customization;
      onChangeRef.current?.(customization);
    };

    return {
      upsertSelection: (selection) => {
        selectionsRef.current[selection.name] = selection;
        emitCustomizationChange(toRecipeLaunchCustomization(selectionsRef.current));
      },
      removeSelection: (name) => {
        delete selectionsRef.current[name];
        emitCustomizationChange(toRecipeLaunchCustomization(selectionsRef.current));
      },
      getCustomization: () => toRecipeLaunchCustomization(selectionsRef.current),
    };
  }, []);

  return (
    <RecipeLaunchControlsContext.Provider value={contextValue}>
      {children}
    </RecipeLaunchControlsContext.Provider>
  );
}

export function LaunchOptionGroup(props: {
  readonly name: string;
  readonly label: string;
  readonly defaultValue?: string;
  readonly options: ReadonlyArray<{
    readonly value: string;
    readonly label: string;
    readonly promptText?: string;
  }>;
}) {
  const controls = useRecipeLaunchControls();
  const [selectedValue, setSelectedValue] = useState(
    props.defaultValue ?? props.options[0]?.value ?? "",
  );
  const selectedOption = props.options.find((option) => option.value === selectedValue);
  const selectedOptionValue = selectedOption?.value;
  const selectedOptionLabel = selectedOption?.label;
  const selectedOptionPromptText = selectedOption?.promptText;

  useEffect(() => {
    if (!selectedOptionValue || !selectedOptionLabel) {
      controls.removeSelection(props.name);
      return;
    }

    controls.upsertSelection({
      name: props.name,
      label: props.label,
      value: selectedOptionValue,
      displayValue: selectedOptionLabel,
      ...(selectedOptionPromptText ? { promptText: selectedOptionPromptText } : {}),
    });
  }, [
    controls,
    props.label,
    props.name,
    selectedOptionLabel,
    selectedOptionPromptText,
    selectedOptionValue,
  ]);

  if (!selectedOption) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
        {props.label}
      </div>
      <ToggleGroup
        value={selectedValue}
        onChange={setSelectedValue}
        wrap
        options={props.options.map((option) => ({ value: option.value, label: option.label }))}
      />
    </div>
  );
}

export function LaunchTextInput(props: {
  readonly name: string;
  readonly label: string;
  readonly placeholder?: string;
  readonly defaultValue?: string;
  readonly promptTemplate?: string;
}) {
  const controls = useRecipeLaunchControls();
  const [value, setValue] = useState(props.defaultValue ?? "");
  const trimmedValue = value.trim();
  const promptText = props.promptTemplate?.replace(/{{\s*value\s*}}/g, trimmedValue);

  useEffect(() => {
    if (!trimmedValue) {
      controls.removeSelection(props.name);
      return;
    }

    controls.upsertSelection({
      name: props.name,
      label: props.label,
      value: trimmedValue,
      displayValue: trimmedValue,
      ...(promptText ? { promptText } : {}),
    });
  }, [controls, props.label, props.name, promptText, trimmedValue]);

  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
        {props.label}
      </span>
      <Input
        value={value}
        placeholder={props.placeholder}
        className="h-8 text-xs"
        onChange={(event) => setValue(event.target.value)}
      />
    </label>
  );
}
