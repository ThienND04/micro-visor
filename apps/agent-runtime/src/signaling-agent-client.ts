import WebSocket from "ws";
import {
  parseServerMessage,
  toJson,
  type ClientToServerMessage,
  type ConnectionStatus,
  type WebRtcSignalType,
} from "../../../packages/protocol/src/index.js";

type AgentClientConfig = {
  serverUrl: string;
  userId: string;
  sessionCode: string;
  autoAllow: boolean;
  reconnectBaseMs: number;
  reconnectMaxMs: number;
};

type AgentClientEvents = {
  onStatus: (status: ConnectionStatus, detail?: string) => void;
  onViewerRequest: (viewerId: string) => void;
  onChat: (from: string, text: string) => void;
  onWebRtcSignal: (from: string, signalType: WebRtcSignalType) => void;
  onError: (line: string) => void;
};

export class SignalingAgentClient {
  private readonly config: AgentClientConfig;
  private readonly events: AgentClientEvents;

  private ws: WebSocket | null = null;
  private connectedViewerId: string | undefined;
  private pendingViewerId: string | undefined;
  private shouldRun = false;
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private heartbeatTimer: NodeJS.Timeout | undefined;

  constructor(config: AgentClientConfig, events: AgentClientEvents) {
    this.config = config;
    this.events = events;
  }

  start(): void {
    this.shouldRun = true;
    this.connect();
  }

  stop(): void {
    this.shouldRun = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.stopHeartbeat();

    this.send({ type: "disconnect", payload: { reason: "Agent runtime stopped" } });
    this.ws?.close();
  }

  approvePending(): void {
    if (!this.pendingViewerId) {
      this.events.onError("No pending viewer request");
      return;
    }

    this.send({ type: "view_decision", payload: { viewerId: this.pendingViewerId, allow: true } });
  }

  denyPending(): void {
    if (!this.pendingViewerId) {
      this.events.onError("No pending viewer request");
      return;
    }

    this.send({
      type: "view_decision",
      payload: { viewerId: this.pendingViewerId, allow: false },
    });
  }

  disconnectSession(): void {
    this.send({ type: "disconnect", payload: { reason: "Disconnected by agent runtime" } });
  }

  sendChat(text: string): void {
    if (!this.connectedViewerId) {
      this.events.onError("No connected viewer for chat");
      return;
    }

    this.send({ type: "chat", payload: { to: this.connectedViewerId, text } });
  }

  sendSignal(signalType: WebRtcSignalType, payload: string): void {
    if (!this.connectedViewerId) {
      this.events.onError("No connected viewer for signaling");
      return;
    }

    this.send({
      type: "webrtc_signal",
      payload: {
        to: this.connectedViewerId,
        signalType,
        sdp: signalType === "offer" || signalType === "answer" ? payload : undefined,
        candidate: signalType === "ice" ? payload : undefined,
      },
    });
  }

  snapshot(): { connectedViewerId?: string; pendingViewerId?: string } {
    return {
      connectedViewerId: this.connectedViewerId,
      pendingViewerId: this.pendingViewerId,
    };
  }

  private handleClose(code: number, reasonBuffer: Buffer): void {
    const reason = reasonBuffer.toString("utf8").trim();

    this.stopHeartbeat();
    this.connectedViewerId = undefined;

    if (reason === "Replaced by new connection") {
      this.shouldRun = false;
      this.events.onStatus(
        "idle",
        "Stopped reconnect: another process is connected with the same userId",
      );
      return;
    }

    const detail = reason
      ? `Signaling connection closed (code=${code}, reason=${reason})`
      : `Signaling connection closed (code=${code})`;

    this.events.onStatus("disconnected", detail);
    this.scheduleReconnect();
  }

  private connect(): void {
    if (!this.shouldRun) {
      return;
    }

    const socket = new WebSocket(this.config.serverUrl);
    this.ws = socket;

    socket.on("open", () => {
      this.reconnectAttempt = 0;
      this.send({
        type: "register",
        payload: {
          userId: this.config.userId,
          role: "agent",
          sessionCode: this.config.sessionCode,
        },
      });

      this.events.onStatus("waiting", "Connected to signaling");
      this.startHeartbeat();
    });

    socket.on("message", (data) => {
      const message = parseServerMessage(data.toString());
      if (!message) {
        this.events.onError("Received invalid signaling message");
        return;
      }

      if (message.type === "status") {
        this.events.onStatus(message.payload.status, message.payload.detail);
        if (message.payload.status === "waiting" || message.payload.status === "disconnected") {
          this.connectedViewerId = undefined;
        }
        return;
      }

      if (message.type === "view_request") {
        this.pendingViewerId = message.payload.viewerId;
        this.events.onViewerRequest(message.payload.viewerId);
        if (this.config.autoAllow) {
          this.approvePending();
        }
        return;
      }

      if (message.type === "view_decision") {
        if (!this.pendingViewerId) {
          return;
        }

        if (message.payload.allow) {
          this.connectedViewerId = this.pendingViewerId;
        } else {
          this.connectedViewerId = undefined;
        }
        this.pendingViewerId = undefined;
        return;
      }

      if (message.type === "chat") {
        this.events.onChat(message.payload.from, message.payload.text);
        return;
      }

      if (message.type === "webrtc_signal") {
        this.events.onWebRtcSignal(message.payload.from, message.payload.signalType);
        return;
      }

      if (message.type === "error") {
        this.events.onError(`${message.payload.code}: ${message.payload.message}`);
      }
    });

    socket.on("close", (code, reasonBuffer) => {
      this.handleClose(code, reasonBuffer);
    });

    socket.on("error", (error) => {
      this.events.onError(`Socket error: ${String(error)}`);
    });
  }

  private send(message: ClientToServerMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.ws.send(toJson(message));
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: "ping" });
    }, 10_000);
  }

  private stopHeartbeat(): void {
    if (!this.heartbeatTimer) {
      return;
    }

    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  private scheduleReconnect(): void {
    if (!this.shouldRun || this.reconnectTimer) {
      return;
    }

    const delay = Math.min(
      this.config.reconnectBaseMs * 2 ** this.reconnectAttempt,
      this.config.reconnectMaxMs,
    );

    this.reconnectAttempt += 1;
    this.events.onStatus("idle", `Reconnecting in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, delay);
  }
}
