import { describe, expect, it } from "vite-plus/test";

import { EventId, type OrchestrationThreadActivity } from "@t3tools/contracts";
import {
  findClaimableJobNotificationMarker,
  JOB_NOTIFICATION_CLAIMED_KIND,
  JOB_NOTIFICATION_MARKER_KIND,
  jobNotificationClaimActivityId,
  jobNotificationMessageId,
  parseJobNotificationMarker,
} from "./t3team-jobNotificationFraming.ts";
import {
  buildJobNotificationClaimActivity,
  buildJobNotificationFramingCommand,
  buildJobNotificationMarkerActivity,
} from "./t3team-jobNotificationFraming.builders.ts";

const NOW = "2026-09-13T12:00:00.000Z";

describe("parseJobNotificationMarker", () => {
  it("parses a well-formed marker record", () => {
    expect(
      parseJobNotificationMarker({
        at: "2026-09-13T11:59:00.000Z",
        text: "Background job `build-app` (id: job_abc123) is completed.",
        requestId: "req-1",
      }),
    ).toEqual({
      atIso: "2026-09-13T11:59:00.000Z",
      text: "Background job `build-app` (id: job_abc123) is completed.",
      requestId: "req-1",
    });
  });

  it("trims the notification text and drops an empty requestId", () => {
    expect(
      parseJobNotificationMarker({
        at: "2026-09-13T11:59:00.000Z",
        text: "  done  ",
        requestId: "",
      }),
    ).toEqual({ atIso: "2026-09-13T11:59:00.000Z", text: "done" });
  });

  it("rejects malformed records instead of throwing", () => {
    for (const record of [
      undefined,
      null,
      "marker",
      42,
      [],
      {},
      { at: 123, text: "done" },
      { at: "not-a-date", text: "done" },
      { at: "2026-09-13T11:59:00.000Z" },
      { at: "2026-09-13T11:59:00.000Z", text: "   " },
      { at: "2026-09-13T11:59:00.000Z", text: 42 },
    ]) {
      expect(parseJobNotificationMarker(record)).toBeUndefined();
    }
  });

  it("ignores a non-string requestId instead of rejecting the whole marker", () => {
    expect(
      parseJobNotificationMarker({
        at: "2026-09-13T11:59:00.000Z",
        text: "done",
        requestId: 7,
      }),
    ).toEqual({ atIso: "2026-09-13T11:59:00.000Z", text: "done" });
  });
});

describe("findClaimableJobNotificationMarker", () => {
  function markerActivity(id: string, at: string, claimed = false): OrchestrationThreadActivity {
    return {
      id: EventId.make(id),
      tone: "info" as const,
      kind: claimed ? JOB_NOTIFICATION_CLAIMED_KIND : JOB_NOTIFICATION_MARKER_KIND,
      summary: claimed ? "Job notification claimed" : "Job notification received",
      payload: claimed
        ? { markerActivityId: id, timelineBypass: true }
        : { at, text: `notice ${id}`, timelineBypass: true },
      turnId: null,
      createdAt: at,
    };
  }

  it("claims a fresh, unclaimed marker", () => {
    const claim = findClaimableJobNotificationMarker(
      [markerActivity("evt-1", "2026-09-13T11:58:00.000Z")],
      NOW,
    );
    expect(claim?.markerActivityId).toBe("evt-1");
    expect(claim?.marker.text).toBe("notice evt-1");
  });

  it("ignores claimed markers", () => {
    const claim = findClaimableJobNotificationMarker(
      [
        markerActivity("evt-1", "2026-09-13T11:58:00.000Z"),
        markerActivity("evt-1", "2026-09-13T11:58:00.000Z", true),
      ],
      NOW,
    );
    expect(claim).toBeUndefined();
  });

  it("drops stale markers beyond the 5-minute recency window", () => {
    const claim = findClaimableJobNotificationMarker(
      [markerActivity("evt-1", "2026-09-13T11:54:59.000Z")],
      NOW,
    );
    expect(claim).toBeUndefined();
  });

  it("accepts a marker slightly in the future (clock skew) but not far in the future", () => {
    const skewed = findClaimableJobNotificationMarker(
      [markerActivity("evt-1", "2026-09-13T12:00:30.000Z")],
      NOW,
    );
    expect(skewed?.markerActivityId).toBe("evt-1");

    const farFuture = findClaimableJobNotificationMarker(
      [markerActivity("evt-2", "2026-09-13T12:02:00.000Z")],
      NOW,
    );
    expect(farFuture).toBeUndefined();
  });

  it("picks the NEWEST claimable marker when several are pending", () => {
    const claim = findClaimableJobNotificationMarker(
      [
        markerActivity("evt-1", "2026-09-13T11:55:00.000Z"),
        markerActivity("evt-2", "2026-09-13T11:58:00.000Z"),
      ],
      NOW,
    );
    expect(claim?.markerActivityId).toBe("evt-2");
  });

  it("prefers a fresh marker over a stale one", () => {
    const claim = findClaimableJobNotificationMarker(
      [
        markerActivity("evt-1", "2026-09-13T11:55:00.000Z"),
        markerActivity("evt-2", "2026-09-13T11:00:00.000Z"),
      ],
      NOW,
    );
    expect(claim?.markerActivityId).toBe("evt-1");
  });

  it("returns undefined for no activities, empty lists, or a malformed now", () => {
    expect(findClaimableJobNotificationMarker(undefined, NOW)).toBeUndefined();
    expect(findClaimableJobNotificationMarker([], NOW)).toBeUndefined();
    expect(
      findClaimableJobNotificationMarker([markerActivity("evt-1", "2026-09-13T11:58:00.000Z")], "nope"),
    ).toBeUndefined();
  });

  it("ignores marker rows with corrupt payloads", () => {
    const corrupt: OrchestrationThreadActivity = {
      id: EventId.make("evt-x"),
      tone: "info" as const,
      kind: JOB_NOTIFICATION_MARKER_KIND,
      summary: "Job notification received",
      payload: "oops",
      turnId: null,
      createdAt: NOW,
    };
    expect(findClaimableJobNotificationMarker([corrupt], NOW)).toBeUndefined();
  });
});

describe("job notification builders", () => {
  it("builds the marker activity with the provider event id (replay-safe)", () => {
    const activity = buildJobNotificationMarkerActivity({
      eventId: "evt-marker-1",
      createdAt: "2026-09-13T11:59:00.000Z",
      marker: { atIso: "2026-09-13T11:59:00.000Z", text: "done", requestId: "req-1" },
      turnId: null,
    });
    expect(activity.id).toBe("evt-marker-1");
    expect(activity.kind).toBe(JOB_NOTIFICATION_MARKER_KIND);
    expect(activity.payload).toMatchObject({
      at: "2026-09-13T11:59:00.000Z",
      text: "done",
      requestId: "req-1",
      timelineBypass: true,
    });
    expect("sequence" in activity).toBe(false);
  });

  it("omits optional fields when absent", () => {
    const activity = buildJobNotificationMarkerActivity({
      eventId: "evt-marker-2",
      createdAt: "2026-09-13T11:59:00.000Z",
      marker: { atIso: "2026-09-13T11:59:00.000Z", text: "done" },
      turnId: null,
      sequence: 7,
    });
    expect(activity.payload).toEqual({
      at: "2026-09-13T11:59:00.000Z",
      text: "done",
      timelineBypass: true,
    });
    expect(activity.sequence).toBe(7);
  });

  it("builds the hidden user-message upsert with the notification framing", () => {
    const command = buildJobNotificationFramingCommand({
      threadId: "thread-1",
      commandId: "cmd-1",
      marker: { atIso: "2026-09-13T11:59:00.000Z", text: "Background job done." },
      markerActivityId: "evt-marker-1",
      nowIso: NOW,
    });
    expect(command.type).toBe("thread.message.upsert");
    const message = (command as { message: Record<string, unknown> }).message;
    expect(message.messageId).toBe("job-notification:evt-marker-1");
    expect(message.role).toBe("user");
    expect(message.text).toBe("Background job done.");
    expect(message.turnId).toBeNull();
    expect(message.streaming).toBe(false);
    expect(message.t3teamExt).toEqual({
      notification: true,
      visibleToUser: false,
      author: { kind: "system" },
    });
  });

  it("builds the claimed activity with a deterministic, marker-keyed id", () => {
    const activity = buildJobNotificationClaimActivity({
      markerActivityId: "evt-marker-1",
      turnId: "turn-1",
      nowIso: NOW,
    });
    expect(activity.id).toBe(jobNotificationClaimActivityId("evt-marker-1"));
    expect(activity.id).toBe("job-notification-claimed:evt-marker-1");
    expect(activity.kind).toBe(JOB_NOTIFICATION_CLAIMED_KIND);
    expect(activity.payload).toEqual({
      markerActivityId: "evt-marker-1",
      turnId: "turn-1",
      timelineBypass: true,
    });
    expect(jobNotificationMessageId("evt-marker-1")).toBe("job-notification:evt-marker-1");
  });
});
