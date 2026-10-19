import { useUiStateStore } from "../uiStateStore";
import { ProjectIconPickerDialog } from "./settings/ProjectIconPickerDialog";

export function ThreadIconPicker(props: { threadId: string; title: string; onClose: () => void }) {
  const { threadId, title, onClose } = props;
  const current = useUiStateStore((state) => state.threadIconByThreadId[threadId] ?? null);
  const setThreadIcon = useUiStateStore((state) => state.setThreadIcon);
  return (
    <ProjectIconPickerDialog
      current={current}
      projectName={title}
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onSelect={(icon) => setThreadIcon(threadId, icon)}
    />
  );
}
