import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import {
  type ClientToServerMessage,
  type ConnectionStatus,
  parseClientMessage,
  toJson,
  type ServerToClientMessage,
  type Role,
} from "../../../packages/protocol/src/index.js";

const port = Number(process.env.PORT ?? 8787);

type ClientRecord = {
  connectionId: string;
  userId: string;
  role: Role;
  sessionCode: string;
  socket: WebSocket;
  peerId?: string;
};

const bySocket = new Map<WebSocket, ClientRecord>();
const byUserId = new Map<string, ClientRecord>();

function send(socket: WebSocket, message: ServerToClientMessage): void {
  socket.send(toJson(message));
}

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
    old.socket.close(1000, "Replaced by new connection");
  }

  const connectionId = randomUUID();
  const record: ClientRecord = {
    connectionId,
    userId,
    role,
    sessionCode,
    socket,
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
    return;
  }

  setStatus(viewer, "rejected", `Rejected by agent ${agent.userId}`);
  setStatus(agent, "waiting", "Waiting for next session request.");
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

  if (!bySocket.has(socket)) {
    sendError(socket, "NOT_REGISTERED", "You must register first.");
    return;
  }

  if (message.type === "ping") {
    send(socket, { type: "pong" });
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
}

const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

wss.on("connection", (socket) => {
  socket.on("message", (data) => onMessage(socket, data.toString()));
  socket.on("close", () => onClose(socket));
});

httpServer.listen(port, () => {
  console.log(`[signaling] listening on ws://localhost:${port}/ws`);
});
