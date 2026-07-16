import { useCallback, useRef, useState } from "react";

import { cn, randomUUID } from "~/lib/utils";
import type { AgentContextCapabilities } from "~/t3work/t3work-agentContext";

const T3WORK_AGENT_CONTEXT_DRAG_TYPE = "application/x-t3work-agent-context";

type AgentContextDragRecord = {
  id: string;
  label: string;
  capabilities: AgentContextCapabilities;
};

const activeDragRecords = new Map<string, AgentContextDragRecord>();
let activeDragId: string | null = null;

function readDragRecord(dataTransfer: DataTransfer | null): AgentContextDragRecord | null {
  const dragId = dataTransfer?.getData(T3WORK_AGENT_CONTEXT_DRAG_TYPE) || activeDragId;
  if (!dragId) {
    return null;
  }

  return activeDragRecords.get(dragId) ?? null;
}

function clearDragRecord(dragId: string | null) {
  if (!dragId) {
    return;
  }

  activeDragRecords.delete(dragId);
  if (activeDragId === dragId) {
    activeDragId = null;
  }
}

export function useT3WorkAgentContextDrag(input: {
  capabilities: AgentContextCapabilities | null;
  label: string;
}) {
  const { capabilities, label } = input;

  const onDragStart = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (!capabilities) {
        event.preventDefault();
        return;
      }

      // A previous drag source may have unmounted mid-drag without firing
      // dragend, leaving its record orphaned. Clear it before claiming the
      // new id so strays cap at ~1 instead of accumulating.
      clearDragRecord(activeDragId);

      const dragId = randomUUID();
      activeDragId = dragId;
      activeDragRecords.set(dragId, { id: dragId, label, capabilities });
      event.dataTransfer.effectAllowed = "copyMove";
      event.dataTransfer.setData(T3WORK_AGENT_CONTEXT_DRAG_TYPE, dragId);
      event.dataTransfer.setData("text/plain", label);
    },
    [capabilities, label],
  );

  const onDragEnd = useCallback((event: React.DragEvent<HTMLElement>) => {
    clearDragRecord(readDragRecord(event.dataTransfer)?.id ?? activeDragId);
  }, []);

  return {
    draggable: Boolean(capabilities),
    onDragStart,
    onDragEnd,
  };
}

export function useT3WorkAgentContextDropTarget(input: {
  canDrop: (record: AgentContextDragRecord) => boolean;
  onDropRecord: (record: AgentContextDragRecord) => Promise<void> | void;
  dropEffect?: DataTransfer["dropEffect"];
  onDropped?: () => void;
}) {
  const [isActive, setIsActive] = useState(false);
  const dragDepthRef = useRef(0);

  const readDroppableRecord = useCallback(
    (dataTransfer: DataTransfer | null) => {
      const record = readDragRecord(dataTransfer);
      if (!record) {
        return null;
      }

      return input.canDrop(record) ? record : null;
    },
    [input],
  );

  const onDragEnter = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (!readDroppableRecord(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      dragDepthRef.current += 1;
      setIsActive(true);
    },
    [readDroppableRecord],
  );

  const onDragOver = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (!readDroppableRecord(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = input.dropEffect ?? "copy";
      if (!isActive) {
        setIsActive(true);
      }
    },
    [input.dropEffect, isActive, readDroppableRecord],
  );

  const onDragLeave = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (!readDroppableRecord(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsActive(false);
      }
    },
    [readDroppableRecord],
  );

  const onDrop = useCallback(
    async (event: React.DragEvent<HTMLElement>) => {
      const record = readDroppableRecord(event.dataTransfer);
      if (!record) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current = 0;
      setIsActive(false);
      await input.onDropRecord(record);
      clearDragRecord(record.id);
      input.onDropped?.();
    },
    [input, readDroppableRecord],
  );

  return {
    isActive,
    dropProps: {
      onDragEnter,
      onDragOver,
      onDragLeave,
      onDrop,
    },
  };
}

export function T3WorkAgentContextDropOverlay({
  active,
  label,
  className,
}: {
  active: boolean;
  label: string;
  className?: string;
}) {
  if (!active) {
    return null;
  }

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-20 border border-emerald-500/50 bg-emerald-500/8 shadow-[0_0_0_1px_rgba(16,185,129,0.2)]",
        className,
      )}
    >
      <div className="absolute inset-x-3 top-3 rounded-md bg-background/92 px-2.5 py-1 text-[11px] font-medium text-emerald-200 backdrop-blur-sm">
        {label}
      </div>
    </div>
  );
}
