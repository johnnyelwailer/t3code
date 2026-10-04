import { useEffect } from "react";
import type { RefObject } from "react";
import type { ActiveAgentEntry } from "~/t3team/chat/t3team-activeAgentsCore";
import { createSBendPhysics, type SBendOut } from "~/t3team/chat/t3team-activeAgentsPhysics";

export const MAX_VISIBLE_DOTS = 5;

export function useActiveAgentsSBendProximity({
  groupRef,
  entries,
}: {
  groupRef: RefObject<HTMLSpanElement | null>;
  entries: readonly ActiveAgentEntry[];
}) {
  // GHE #201 follow-up: S-bend + snap proximity. While the cursor is near
  // the row, the dots AVOID it on the Y axis — the row bends into an S
  // around the cursor's x (one side up, one side down) — and the cursor
  // sitting on a dot's home locks THAT one dot exactly at home and grows
  // it; near-cursor dots shrink in anticipation. The shared physics module
  // (t3team-activeAgentsPhysics) is the single source of truth; the
  // exploration story imports it too. Transforms are written on the cell
  // buttons; reduced-motion users get none of it (matchMedia + CSS).
  const visibleCount = Math.min(entries.length, MAX_VISIBLE_DOTS);
  useEffect(() => {
    const group = groupRef.current;
    if (!group || visibleCount === 0) return;
    if (
      typeof window.matchMedia !== "function" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    // The trigger scope is the whole working row (stamped by
    // WorkingTimelineRow), not the tiny dot group: the bend is meant to
    // start well before the cursor touches the dots.
    const scope = group.closest<HTMLElement>("[data-t3team-working-row]") ?? group;
    // Exploration stories can opt out per-card (data-sdv-no-springs on the
    // card scope, inherited down through the row).
    if (scope.closest("[data-sdv-no-springs]")) return;
    const physics = createSBendPhysics();
    const out: SBendOut = { poses: [], scales: [], snapIndex: -1 };
    // Viewport-space pointer; re-converted against a fresh scope rect every
    // frame because the layout moves under a still mouse.
    const pointer = { x: 0, y: 0, active: false };
    let raf = 0;
    let dots: HTMLElement[] = [];

    const tick = (now: number) => {
      // Perf: reuse the cached cell list; re-query only when the first one
      // left the tree (entries changed / virtualization).
      const firstDot = dots[0];
      if (!firstDot || !group.contains(firstDot)) {
        dots = Array.from(group.querySelectorAll<HTMLElement>(".t3team-aci-cell"));
        if (dots.length === 0) {
          raf = 0;
          return;
        }
      }
      // Reads batched (one reflow), writes after.
      const srect = scope.getBoundingClientRect();
      const cursor = {
        x: pointer.x - srect.left,
        y: pointer.y - srect.top,
        active: pointer.active,
      };
      const homes = dots.map((dot, i) => {
        const dr = dot.getBoundingClientRect();
        const prevX = out.poses[i]?.x ?? 0;
        const prevY = out.poses[i]?.y ?? 0;
        return {
          x: dr.left + dr.width / 2 - srect.left - prevX,
          y: dr.top + dr.height / 2 - srect.top - prevY,
        };
      });
      const frame = physics.stepFrame(now, { cursor, homes }, out);
      dots.forEach((dot, i) => {
        const pose = frame.poses[i];
        if (!pose) return;
        const scale = frame.scales[i] ?? "1";
        dot.style.transform = `translate(${pose.x.toFixed(2)}px, ${pose.y.toFixed(2)}px)`;
        dot.style.scale = scale === "1" ? "" : scale;
      });
      // Keep the loop alive while anything is in motion; otherwise stop and
      // let a pointer event re-prime it (no idle rAF cost).
      const inMotion =
        cursor.active ||
        frame.snapIndex !== -1 ||
        out.scales.some((scale) => scale !== "1") ||
        frame.poses.some((pose) => Math.abs(pose.y) > 0.2);
      if (inMotion) raf = requestAnimationFrame(tick);
      else raf = 0;
    };

    const prime = () => {
      if (raf === 0) raf = requestAnimationFrame(tick);
    };
    const onMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
      prime();
    };
    const onLeave = () => {
      pointer.active = false;
      prime();
    };
    scope.addEventListener("pointermove", onMove, { passive: true });
    scope.addEventListener("pointerleave", onLeave, { passive: true });
    dots = []; // force a re-query for the current entries
    prime();
    return () => {
      scope.removeEventListener("pointermove", onMove);
      scope.removeEventListener("pointerleave", onLeave);
      if (raf !== 0) cancelAnimationFrame(raf);
      dots.forEach((dot) => {
        dot.style.transform = "";
        dot.style.scale = "";
      });
    };
  }, [visibleCount]);
}
