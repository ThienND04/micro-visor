import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import type { AddressInfo } from "node:net";
import type { WebSocket } from "ws";
import {
  type ClientToServerMessage,
  type ConnectionStatus,
  parseClientMessage,
  toJson,
  type ServerToClientMessage,
  type Role,
  type WebRtcSignalPayload,
} from "../../../packages/protocol/src/index.js";
import { createAuditLogger, type AuditLogger } from "./audit.js";

export interface SignalingServer {
  port: number;
  close: () => Promise<void>;
}

export interface SignalingServerOptions {
  port: number;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  auditLogPath?: string;
}

type ClientRecord = {
  connectionId: string;
  userId: string;
  role: Role;
  sessionCode: string;
  socket: WebSocket;
  peerId?: string;
  lastSeenAt: number;
};

const DEFAULT_HEARTBEAT_INTERVAL_MS = 10_000;
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 35_000;

function send(socket: WebSocket, message: ServerToClientMessage): void {
  socket.send(toJson(message));
}

function safeClose(socket: WebSocket, code: number, reason: string): void {
  if (socket.readyState === socket.CLOSED || socket.readyState === socket.CLOSING) {
    return;
  }

  socket.close(code, reason);
}

function ensurePaired(
  sender: ClientRecord,
  targetId: string,
  byUserId: Map<string, ClientRecord>,
): ClientRecord | null {
  if (!sender.peerId) {
    return null;
  }

  if (sender.peerId !== targetId) {
    return null;
  }

  const target = byUserId.get(targetId);
  if (!target) {
    return null;
  }

  if (target.sessionCode !== sender.sessionCode) {
    return null;
  }

  return target;
}

function relayWebRtcSignal(
  sender: ClientRecord,
  payload: WebRtcSignalPayload,
  byUserId: Map<string, ClientRecord>,
  audit: AuditLogger,
): ServerToClientMessage | null {
  const target = ensurePaired(sender, payload.to, byUserId);
  if (!target) {
    return {
      type: "error",
      payload: {
        code: "WEBRTC_TARGET_INVALID",
        message: "WebRTC signal target is invalid for current session pair.",
      },
    };
  }

  const message: ServerToClientMessage = {
    type: "webrtc_signal",
    payload: {
      from: sender.userId,
      signalType: payload.signalType,
      sdp: payload.sdp,
      candidate: payload.candidate,
      mid: payload.mid,
      mLineIndex: payload.mLineIndex,
    },
  };

  send(target.socket, message);
  audit.log("webrtc_signal", {
    from: sender.userId,
    to: target.userId,
    signalType: payload.signalType,
  });
  return null;
}

export async function startSignalingServer(
  options: SignalingServerOptions,
): Promise<SignalingServer> {
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  const heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS;
  const audit = createAuditLogger(options.auditLogPath);

  const bySocket = new Map<WebSocket, ClientRecord>();
  const byUserId = new Map<string, ClientRecord>();

  function sendError(socket: WebSocket, code: string, message: string): void {
    send(socket, { type: "error", payload: { code, message } });
  }

  function setStatus(record: ClientRecord, status: ConnectionStatus, detail?: string): void {
    send(record.socket, { type: "status", payload: { status, detail } });
  }

  function ensureRegistered(socket: WebSocket): ClientRecord | null {
    const record = bySocket.get(socket);
    if (!record) {
      sendError(socket, "NOT_REGISTERED", "You must register first.");
      return null;
    }

    record.lastSeenAt = Date.now();
    return record;
  }

  function closePair(record: ClientRecord, reason: string): void {
    if (!record.peerId) {
      return;
    }

    const peer = byUserId.get(record.peerId);
    record.peerId = undefined;

    if (peer) {
      peer.peerId = undefined;
      setStatus(peer, "disconnected", reason);
      setStatus(peer, "waiting", "Waiting for next session request.");
      audit.log("peer_disconnected", {
        userId: peer.userId,
        reason,
      });
    }
  }

  function handleRegister(socket: WebSocket, message: ClientToServerMessage): void {
    if (message.type !== "register") {
      sendError(socket, "INVALID_MESSAGE", "First message must be register.");
      return;
    }

    const { userId, role, sessionCode } = message.payload;
    if (!userId || !role || !sessionCode) {
      sendError(socket, "INVALID_REGISTER", "Missing userId/role/sessionCode.");
      return;
    }

    const old = byUserId.get(userId);
    if (old) {
      safeClose(old.socket, 1000, "Replaced by new connection");
      audit.log("register_replaced", { userId, previousConnectionId: old.connectionId });
    }

    const connectionId = randomUUID();
    const record: ClientRecord = {
      connectionId,
      userId,
      role,
      sessionCode,
      socket,
      lastSeenAt: Date.now(),
    };

    bySocket.set(socket, record);
    byUserId.set(userId, record);

    send(socket, {
      type: "registered",
      payload: {
        connectionId,
        status: role === "agent" ? "waiting" : "idle",
      },
    });

    setStatus(record, role === "agent" ? "waiting" : "idle");
    audit.log("registered", { userId, role, connectionId });
  }

  function handleViewRequest(socket: WebSocket, message: ClientToServerMessage): void {
    if (message.type !== "view_request") {
      return;
    }

    const viewer = ensureRegistered(socket);
    if (!viewer) {
      return;
    }

    if (viewer.role !== "viewer") {
      sendError(socket, "ROLE_FORBIDDEN", "Only viewer can request view.");
      return;
    }

    const target = byUserId.get(message.payload.targetAgentId);
    if (!target || target.role !== "agent") {
      sendError(socket, "AGENT_NOT_FOUND", "Target agent is offline.");
      return;
    }

    if (target.sessionCode !== viewer.sessionCode) {
      sendError(socket, "SESSION_MISMATCH", "Session code mismatch.");
      return;
    }

    setStatus(viewer, "requested", `Waiting decision from ${target.userId}`);
    send(target.socket, { type: "view_request", payload: { viewerId: viewer.userId } });
    audit.log("view_requested", { viewerId: viewer.userId, targetAgentId: target.userId });
  }

  function handleViewDecision(socket: WebSocket, message: ClientToServerMessage): void {
    if (message.type !== "view_decision") {
      return;
    }

    const agent = ensureRegistered(socket);
    if (!agent) {
      return;
    }

    if (agent.role !== "agent") {
      sendError(socket, "ROLE_FORBIDDEN", "Only agent can send decision.");
      return;
    }

    const viewer = byUserId.get(message.payload.viewerId);
    if (!viewer || viewer.role !== "viewer") {
      sendError(socket, "VIEWER_NOT_FOUND", "Viewer is not connected.");
      return;
    }

    if (viewer.sessionCode !== agent.sessionCode) {
      sendError(socket, "SESSION_MISMATCH", "Session code mismatch.");
      return;
    }

    const allow = message.payload.allow;
    send(viewer.socket, {
      type: "view_decision",
      payload: {
        agentId: agent.userId,
        allow,
        reason: allow ? undefined : "Rejected by agent",
      },
    });

    send(agent.socket, {
      type: "view_decision",
      payload: {
        agentId: agent.userId,
        allow,
        reason: allow ? undefined : "Decision sent",
      },
    });

    if (allow) {
      agent.peerId = viewer.userId;
      viewer.peerId = agent.userId;
      setStatus(agent, "connected", `Viewer ${viewer.userId} connected`);
      setStatus(viewer, "connected", `Connected to agent ${agent.userId}`);
      audit.log("view_approved", { agentId: agent.userId, viewerId: viewer.userId });
      return;
    }

    setStatus(viewer, "rejected", `Rejected by agent ${agent.userId}`);
    setStatus(agent, "waiting", "Waiting for next session request.");
    audit.log("view_rejected", { agentId: agent.userId, viewerId: viewer.userId });
  }

  function handleChat(socket: WebSocket, message: ClientToServerMessage): void {
    if (message.type !== "chat") {
      return;
    }

    const sender = ensureRegistered(socket);
    if (!sender) {
      return;
    }

    const target = byUserId.get(message.payload.to);
    if (!target) {
      sendError(socket, "TARGET_OFFLINE", "Target is offline.");
      return;
    }

    if (sender.sessionCode !== target.sessionCode) {
      sendError(socket, "SESSION_MISMATCH", "Session code mismatch.");
      return;
    }

    const text = message.payload.text.trim();
    if (!text) {
      return;
    }

    send(target.socket, {
      type: "chat",
      payload: {
        from: sender.userId,
        text: text.slice(0, 200),
      },
    });
    audit.log("chat", { from: sender.userId, to: target.userId });
  }

  function handleDisconnect(socket: WebSocket, message: ClientToServerMessage): void {
    if (message.type !== "disconnect") {
      return;
    }

    const record = ensureRegistered(socket);
    if (!record) {
      return;
    }

    closePair(record, message.payload?.reason ?? "Peer disconnected");
    setStatus(record, "idle", "Disconnected by client request.");
    audit.log("disconnect", {
      userId: record.userId,
      reason: message.payload?.reason ?? "client_request",
    });
  }

  function onMessage(socket: WebSocket, raw: string): void {
    const message = parseClientMessage(raw);
    if (!message) {
      sendError(socket, "BAD_JSON", "Invalid message format.");
      return;
    }

    if (message.type === "register") {
      handleRegister(socket, message);
      return;
    }

    const sender = ensureRegistered(socket);
    if (!sender) {
      return;
    }

    if (message.type === "ping") {
      send(socket, { type: "pong" });
      return;
    }

    if (message.type === "webrtc_signal") {
      const relayError = relayWebRtcSignal(sender, message.payload, byUserId, audit);
      if (relayError) {
        send(socket, relayError);
      }
      return;
    }

    handleViewRequest(socket, message);
    handleViewDecision(socket, message);
    handleChat(socket, message);
    handleDisconnect(socket, message);
  }

  function onClose(socket: WebSocket): void {
    const record = bySocket.get(socket);
    if (!record) {
      return;
    }

    closePair(record, `${record.userId} went offline`);
    bySocket.delete(socket);

    const candidate = byUserId.get(record.userId);
    if (candidate?.connectionId === record.connectionId) {
      byUserId.delete(record.userId);
    }

    audit.log("closed", { userId: record.userId, connectionId: record.connectionId });
  }

  const httpServer = createServer();
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (socket) => {
    socket.on("message", (data) => onMessage(socket, data.toString()));
    socket.on("close", () => onClose(socket));
  });

  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const record of bySocket.values()) {
      if (now - record.lastSeenAt <= heartbeatTimeoutMs) {
        continue;
      }

      audit.log("heartbeat_timeout", { userId: record.userId });
      safeClose(record.socket, 4000, "Heartbeat timeout");
    }
  }, heartbeatIntervalMs);

  await new Promise<void>((resolve) => {
    httpServer.listen(options.port, resolve);
  });

  const actualPort = (httpServer.address() as AddressInfo).port;

  return {
    port: actualPort,
    async close() {
      clearInterval(sweeper);
      await new Promise<void>((resolve) => {
        wss.clients.forEach((client) => safeClose(client, 1001, "Server shutdown"));
        wss.close(() => {
          httpServer.close(() => resolve());
        });
      });
    },
  };
}
