import { useCallback, useEffect, useRef, useState } from "react";

import type { ProviderJobControlResult } from "@t3tools/contracts";

import {
  type ThreadJobsController,
  type ThreadJobsControlResponse,
} from "~/t3team/backend/t3team-thread-jobsBackend";

import { cn } from "../../lib/utils";

/**
 * Terminal-style live tail for one background job's retained output.
 *
 * Cursor-POLL, never a raw stream: each poll asks for `since: cursor` bytes
 * from the runtime's bounded ring, and the runtime — not the client —
 * resolves torn UTF-8 boundaries and the page cap. Polling every 1.5s keeps
 * the websocket quiet (raw output streaming over it is a known anti-pattern:
 * a busy job would peg the frame budget). The poll stops on `settled`, on
 * close, and — while the tab is hidden — on the browser's timer throttle.
 *
 * The panel shows the TAIL: older bytes fall off the top of the ring on the
 * runtime side (`oldestRetained`), so when a poll lands past the start of
 * what is retained we render a "…" seam instead of claiming the page is the
 * whole stream.
 *
 * The panel is opened from the job's own row, so it carries no job identity
 * of its own (no command, no id) — the row above already says what this is.
 * The header keeps only what the row does not: the live/settled state and
 * the close affordance.
 *
 * @module BackgroundJobOutputPanel
 */

const POLL_INTERVAL_MS = 1500;
const PAGE_BYTES = 32 * 1024;
/** How many lines of the tail the pre element keeps in the DOM. */
const MAX_RENDERED_LINES = 400;

export function BackgroundJobOutputPanel({
  threadId,
  jobId,
  controller,
  onClose,
  className,
}: {
  readonly threadId: string;
  readonly jobId: string;
  readonly controller: ThreadJobsController;
  readonly onClose: () => void;
  readonly className?: string;
}) {
  const [chunks, setChunks] = useState<readonly string[]>([]);
  const [cursor, setCursor] = useState(0);
  const [settled, setSettled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unknownJob, setUnknownJob] = useState(false);
  const pollInFlight = useRef(false);
  const preRef = useRef<HTMLPreElement | null>(null);

  const poll = useCallback(async () => {
    if (pollInFlight.current || settled) return;
    pollInFlight.current = true;
    try {
      const response: ThreadJobsControlResponse = await controller({
        threadId,
        request: { kind: "read-output", jobId, since: cursor, maxBytes: PAGE_BYTES },
      });
      if (response.supported === false) {
        // The capability disappeared mid-flight (kill switch, session swap)
        // — stop politely; the affordance layer will hide us on the next tick.
        setSettled(true);
        return;
      }
      const result: ProviderJobControlResult = response.result;
      if (result.kind === "unknown-job") {
        setUnknownJob(true);
        setSettled(true);
        return;
      }
      if (result.kind === "output") {
        if (result.text.length > 0) {
          setChunks((current) => [...current, result.text]);
        }
        setCursor(result.nextCursor);
        if (result.settled) setSettled(true);
      }
      setError(null);
    } catch (e) {
      // A failed page is not a lost tail: the cursor did not move, so the
      // next poll re-reads the same bytes. Surface it, keep polling.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      pollInFlight.current = false;
    }
  }, [controller, jobId, cursor, settled, threadId]);

  useEffect(() => {
    void poll();
  }, [poll]);

  useEffect(() => {
    if (settled) return;
    const id = window.setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [poll, settled]);

  // Keep the tail pinned to the bottom while new bytes arrive.
  useEffect(() => {
    const el = preRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chunks]);

  const text = chunks.join("");
  const lines = text.length > 0 ? text.split("\n") : [];
  const visible = lines.length > MAX_RENDERED_LINES ? lines.slice(-MAX_RENDERED_LINES) : lines;

  return (
    <div
      className={cn(
        "mt-1.5 overflow-hidden rounded-md border border-border/70 bg-black/90",
        className,
      )}
      role="region"
      aria-label="Background job output"
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-2 py-1">
        <span
          className={cn(
            "text-[.65rem] tabular-nums",
            settled ? "text-emerald-300/80" : "text-amber-300/80",
          )}
        >
          {settled ? "settled" : "live"}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close job output"
          className="rounded px-1 text-white/60 outline-none hover:bg-white/10 hover:text-white focus-visible:bg-white/10"
        >
          ×
        </button>
      </div>
      {unknownJob ? (
        <div className="px-2 py-2 font-mono text-xs text-white/60">
          The runtime no longer knows this job — it settled before we looked.
        </div>
      ) : (
        <pre
          ref={preRef}
          className="max-h-64 overflow-y-auto px-2 py-1.5 font-mono text-[.7rem] leading-relaxed whitespace-pre-wrap break-all text-white/85"
        >
          {lines.length === 0 && !settled ? (
            <span className="text-white/40">waiting for output…</span>
          ) : null}
          {visible.map((line, i) => (
            <span key={i} className="block min-h-[1em]">
              {line}
            </span>
          ))}
        </pre>
      )}
      {error !== null && !unknownJob ? (
        <div className="border-t border-white/10 px-2 py-1 font-mono text-[.65rem] text-rose-300/90">
          {error} — retrying
        </div>
      ) : null}
    </div>
  );
}
