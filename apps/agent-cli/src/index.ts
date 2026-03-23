import { createInterface } from "node:readline";
import WebSocket from "ws";
import {
  parseServerMessage,
  toJson,
  type ClientToServerMessage,
  type WebRtcSignalType,
} from "../../../packages/protocol/src/index.js";

type Args = {
  serverUrl: string;
  userId: string;
  sessionCode: string;
  autoAllow: boolean;
  reconnectBaseMs: number;
  reconnectMaxMs: number;
};

function parseArgs(argv: string[]): Args {
  const entries = new Map<string, string>();

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) {
      continue;
    }

    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      entries.set(key.slice(2), "true");
      continue;
    }

    entries.set(key.slice(2), value);
    i += 1;
  }

  return {
    serverUrl: entries.get("server-url") ?? "ws://localhost:8787/ws",
    userId: entries.get("user-id") ?? "A",
    sessionCode: entries.get("session-code") ?? "DEMO-123",
    autoAllow: (entries.get("auto-allow") ?? "false") === "true",
    reconnectBaseMs: Number(entries.get("reconnect-base-ms") ?? 1000),
    reconnectMaxMs: Number(entries.get("reconnect-max-ms") ?? 10_000),
  };
}

function oneLine(input: string): string {
  return input.replace(/[\r\n]+/g, " ").trim();
}

function toSignalType(input: string): WebRtcSignalType | null {
  if (input === "offer" || input === "answer" || input === "ice" || input === "renegotiate") {
    return input;
  }

  return null;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  let ws: WebSocket | null = null;
  let shouldRun = true;
  let reconnectAttempt = 0;
  let reconnectTimer: NodeJS.Timeout | undefined;
  let heartbeatTimer: NodeJS.Timeout | undefined;
  let connectedViewerId: string | undefined;
  let pendingViewerId: string | undefined;

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  function showStatus(line: string): void {
    console.log(`[agent:${args.userId}] ${oneLine(line)}`);
  }

  function send(message: ClientToServerMessage): boolean {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      showStatus("Socket is not ready yet");
      return false;
    }

    ws.send(toJson(message));
    return true;
  }

  function askDecision(viewerId: string): void {
    if (args.autoAllow) {
      send({ type: "view_decision", payload: { viewerId, allow: true } });
      return;
    }

    rl.question(`Allow viewer ${viewerId}? [y/N] `, (answer) => {
      const allow = answer.trim().toLowerCase() === "y";
      send({ type: "view_decision", payload: { viewerId, allow } });
    });
  }

  function clearHeartbeat(): void {
    if (!heartbeatTimer) {
      return;
    }

    clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
  }

  function startHeartbeat(): void {
    clearHeartbeat();
    heartbeatTimer = setInterval(() => {
      send({ type: "ping" });
    }, 10_000);
  }

  function scheduleReconnect(): void {
    if (!shouldRun) {
      return;
    }
    if (reconnectTimer) {
      return;
    }

    const delay = Math.min(args.reconnectBaseMs * 2 ** reconnectAttempt, args.reconnectMaxMs);
    reconnectAttempt += 1;
    showStatus(`Disconnected. Reconnecting in ${delay}ms`);

    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      connect();
    }, delay);
  }

  function bindSocket(nextSocket: WebSocket): void {
    ws = nextSocket;

    nextSocket.on("open", () => {
      reconnectAttempt = 0;
      showStatus(`Connected signaling ${args.serverUrl}`);
      send({
        type: "register",
        payload: {
          userId: args.userId,
          role: "agent",
          sessionCode: args.sessionCode,
        },
      });
      startHeartbeat();
    });

    nextSocket.on("message", (data) => {
      const message = parseServerMessage(data.toString());
      if (!message) {
        showStatus("Received invalid message");
        return;
      }

      if (message.type === "registered") {
        showStatus(`Registered with connection ${message.payload.connectionId}`);
        showStatus("Commands: /chat <text>, /signal <type> <payload>, /disconnect");
        return;
      }

      if (message.type === "status") {
        showStatus(`Status=${message.payload.status} ${message.payload.detail ?? ""}`);
        if (message.payload.status === "disconnected" || message.payload.status === "waiting") {
          connectedViewerId = undefined;
        }
        return;
      }

      if (message.type === "view_request") {
        pendingViewerId = message.payload.viewerId;
        showStatus(`View request from ${message.payload.viewerId}`);
        askDecision(message.payload.viewerId);
        return;
      }

      if (message.type === "view_decision") {
        if (message.payload.allow && pendingViewerId) {
          connectedViewerId = pendingViewerId;
        }
        if (!message.payload.allow) {
          connectedViewerId = undefined;
        }
        pendingViewerId = undefined;
        return;
      }

      if (message.type === "webrtc_signal") {
        showStatus(`WebRTC ${message.payload.signalType} from ${message.payload.from}`);
        return;
      }

      if (message.type === "chat") {
        showStatus(`Chat from ${message.payload.from}: ${oneLine(message.payload.text)}`);
        return;
      }

      if (message.type === "error") {
        showStatus(`Error ${message.payload.code}: ${message.payload.message}`);
        return;
      }
    });

    nextSocket.on("close", () => {
      clearHeartbeat();
      showStatus("Signaling connection closed");
      connectedViewerId = undefined;
      scheduleReconnect();
    });

    nextSocket.on("error", (error) => {
      showStatus(`Socket error: ${String(error)}`);
    });
  }

  function connect(): void {
    if (!shouldRun) {
      return;
    }

    const socket = new WebSocket(args.serverUrl);
    bindSocket(socket);
  }

  connect();

  rl.on("line", (line) => {
    const value = oneLine(line);
    if (!value) {
      return;
    }

    if (value === "/disconnect") {
      send({ type: "disconnect", payload: { reason: "Disconnected by agent" } });
      return;
    }

    if (value.startsWith("/chat ")) {
      if (!connectedViewerId) {
        showStatus("No connected viewer for chat");
        return;
      }

      send({
        type: "chat",
        payload: {
          to: connectedViewerId,
          text: value.slice(6),
        },
      });
      return;
    }

    if (value.startsWith("/signal ")) {
      if (!connectedViewerId) {
        showStatus("No connected viewer for signaling");
        return;
      }

      const [rawType, ...rest] = value.slice(8).split(" ");
      const signalType = toSignalType(rawType ?? "");
      if (!signalType) {
        showStatus("Invalid signal type. Use offer|answer|ice|renegotiate");
        return;
      }

      const payload = rest.join(" ");
      send({
        type: "webrtc_signal",
        payload: {
          to: connectedViewerId,
          signalType,
          sdp: signalType === "offer" || signalType === "answer" ? payload : undefined,
          candidate: signalType === "ice" ? payload : undefined,
        },
      });
      showStatus(`Sent WebRTC ${signalType} to ${connectedViewerId}`);
      return;
    }

    showStatus("Unknown command. Use /chat <text>, /signal <type> <payload>, /disconnect");
  });

  process.on("SIGINT", () => {
    shouldRun = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
    clearHeartbeat();
    send({ type: "disconnect", payload: { reason: "Agent process stopped" } });
    ws?.close();
    rl.close();
    process.exit(0);
  });
}

void main();
