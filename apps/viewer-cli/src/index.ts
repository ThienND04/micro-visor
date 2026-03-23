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
  targetAgent: string;
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
    userId: entries.get("user-id") ?? "B",
    sessionCode: entries.get("session-code") ?? "DEMO-123",
    targetAgent: entries.get("target-agent") ?? "A",
  };
}

function oneLine(input: string): string {
  return input.replace(/[\r\n]+/g, " ").trim();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const ws = new WebSocket(args.serverUrl);

  let connected = false;

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  function showStatus(line: string): void {
    console.log(`[viewer:${args.userId}] ${oneLine(line)}`);
  }

  function send(message: ClientToServerMessage): boolean {
    if (ws.readyState !== WebSocket.OPEN) {
      showStatus("Socket is not ready yet");
      return false;
    }

    ws.send(toJson(message));
    return true;
  }

  ws.on("open", () => {
    showStatus(`Connected signaling ${args.serverUrl}`);
    send({
      type: "register",
      payload: {
        userId: args.userId,
        role: "viewer",
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
      showStatus(`Requesting access to agent ${args.targetAgent}`);
      send({ type: "view_request", payload: { targetAgentId: args.targetAgent } });
      showStatus("Commands: /chat <text>, /disconnect");
      return;
    }

    if (message.type === "status") {
      showStatus(`Status=${message.payload.status} ${message.payload.detail ?? ""}`);
      connected = message.payload.status === "connected";
      return;
    }

    if (message.type === "view_decision") {
      if (message.payload.allow) {
        connected = true;
        showStatus(`Access approved by ${message.payload.agentId}`);
      } else {
        connected = false;
        showStatus(`Access rejected: ${message.payload.reason ?? "Rejected"}`);
      }
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
      send({ type: "disconnect", payload: { reason: "Disconnected by viewer" } });
      return;
    }

    if (value.startsWith("/chat ")) {
      if (!connected) {
        showStatus("Not connected to agent yet");
        return;
      }

      send({
        type: "chat",
        payload: {
          to: args.targetAgent,
          text: value.slice(6),
        },
      });
      return;
    }

    showStatus("Unknown command. Use /chat <text> or /disconnect");
  });

  process.on("SIGINT", () => {
    send({ type: "disconnect", payload: { reason: "Viewer process stopped" } });
    ws.close();
    rl.close();
    process.exit(0);
  });
}

void main();
