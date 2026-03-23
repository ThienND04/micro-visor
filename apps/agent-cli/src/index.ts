import { createInterface } from "node:readline";
import WebSocket from "ws";
import {
  parseServerMessage,
  toJson,
  type ClientToServerMessage,
} from "../../../packages/protocol/src/index.js";

type Args = {
  serverUrl: string;
  userId: string;
  sessionCode: string;
  autoAllow: boolean;
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
  };
}

function oneLine(input: string): string {
  return input.replace(/[\r\n]+/g, " ").trim();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const ws = new WebSocket(args.serverUrl);

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
    if (ws.readyState !== WebSocket.OPEN) {
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

  ws.on("open", () => {
    showStatus(`Connected signaling ${args.serverUrl}`);
    send({
      type: "register",
      payload: {
        userId: args.userId,
        role: "agent",
        sessionCode: args.sessionCode,
      },
    });
  });

  ws.on("message", (data) => {
    const message = parseServerMessage(data.toString());
    if (!message) {
      showStatus("Received invalid message");
      return;
    }

    if (message.type === "registered") {
      showStatus(`Registered with connection ${message.payload.connectionId}`);
      showStatus("Commands: /chat <text>, /disconnect");
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

    if (message.type === "chat") {
      showStatus(`Chat from ${message.payload.from}: ${oneLine(message.payload.text)}`);
      return;
    }

    if (message.type === "error") {
      showStatus(`Error ${message.payload.code}: ${message.payload.message}`);
      return;
    }
  });

  ws.on("close", () => {
    showStatus("Signaling connection closed");
    process.exit(0);
  });

  ws.on("error", (error) => {
    showStatus(`Socket error: ${String(error)}`);
  });

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

    showStatus("Unknown command. Use /chat <text> or /disconnect");
  });

  process.on("SIGINT", () => {
    send({ type: "disconnect", payload: { reason: "Agent process stopped" } });
    ws.close();
    rl.close();
    process.exit(0);
  });
}

void main();
