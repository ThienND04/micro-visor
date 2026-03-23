import { describe, expect, it } from "vitest";
import {
  initialRuntimeState,
  resolvePendingViewer,
  setPendingViewer,
  updateStatus,
} from "./status-store.js";

describe("status-store", () => {
  it("tracks pending viewer and approval", () => {
    const initial = initialRuntimeState();
    const pending = setPendingViewer(initial, "viewer-1");
    const approved = resolvePendingViewer(pending, true);

    expect(approved.connectedViewerId).toBe("viewer-1");
    expect(approved.pendingViewerId).toBeUndefined();
  });

  it("clears connected viewer on waiting/disconnected states", () => {
    const initial = {
      ...initialRuntimeState(),
      connectedViewerId: "viewer-2",
    };

    const waiting = updateStatus(initial, "waiting", "New session");
    const disconnected = updateStatus(waiting, "disconnected", "Peer offline");

    expect(waiting.connectedViewerId).toBeUndefined();
    expect(disconnected.connectedViewerId).toBeUndefined();
  });
});
