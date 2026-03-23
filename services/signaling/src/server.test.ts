import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import {
  parseServerMessage,
  toJson,
  type ClientToServerMessage,
} from "../../../packages/protocol/src/index.js";
import { startSignalingServer, type SignalingServer } from "./server.js";

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", (error) => reject(error));
  });
}

function waitForMessage(socket: WebSocket, type: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for message type ${type}`));
    }, 5000);

    socket.on("message", (data) => {
      const parsed = parseServerMessage(data.toString());
      if (!parsed) {
        return;
      }

      if (parsed.type === type) {
        clearTimeout(timeout);
        resolve(parsed);
      }
    });
  });
}

function send(socket: WebSocket, message: ClientToServerMessage): void {
  socket.send(toJson(message));
}

describe("signaling server", () => {
  let server: SignalingServer;
  let url: string;

  beforeAll(async () => {
    server = await startSignalingServer({
      port: 0,
      heartbeatIntervalMs: 250,
      heartbeatTimeoutMs: 4000,
      auditLogPath: "/tmp/micro-visor-test-audit.log",
    });
    url = `ws://127.0.0.1:${server.port}/ws`;
  });

  afterAll(async () => {
    await server.close();
  });

  it("relays webrtc signaling between connected viewer and agent", async () => {
    const agent = new WebSocket(url);
    const viewer = new WebSocket(url);

    await Promise.all([waitForOpen(agent), waitForOpen(viewer)]);

    send(agent, {
      type: "register",
      payload: { userId: "agent-A", role: "agent", sessionCode: "S1" },
    });
    send(viewer, {
      type: "register",
      payload: { userId: "viewer-B", role: "viewer", sessionCode: "S1" },
    });

    await Promise.all([waitForMessage(agent, "registered"), waitForMessage(viewer, "registered")]);

    send(viewer, { type: "view_request", payload: { targetAgentId: "agent-A" } });
    await waitForMessage(agent, "view_request");

    send(agent, { type: "view_decision", payload: { viewerId: "viewer-B", allow: true } });
    await Promise.all([waitForMessage(agent, "status"), waitForMessage(viewer, "view_decision")]);

    send(viewer, {
      type: "webrtc_signal",
      payload: {
        to: "agent-A",
        signalType: "offer",
        sdp: "v=0\no=- 0 0 IN IP4 127.0.0.1",
      },
    });

    const signal = (await waitForMessage(agent, "webrtc_signal")) as {
      type: "webrtc_signal";
      payload: { from: string; signalType: string; sdp?: string };
    };

    expect(signal.type).toBe("webrtc_signal");
    expect(signal.payload.from).toBe("viewer-B");
    expect(signal.payload.signalType).toBe("offer");
    expect(signal.payload.sdp).toContain("v=0");

    agent.close();
    viewer.close();
  });
});
