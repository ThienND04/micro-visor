import { createInterface } from "node:readline";
import type { WebRtcSignalType } from "../../../../packages/protocol/src/index.js";
import type { RuntimeCommand, RuntimeUiAdapter } from "../types.js";

function parseSignalType(value: string): WebRtcSignalType | null {
  if (value === "offer" || value === "answer" || value === "ice" || value === "renegotiate") {
    return value;
  }

  return null;
}

export function createConsoleUiAdapter(prefix: string): RuntimeUiAdapter {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let commandHandler: ((command: RuntimeCommand) => void) | undefined;

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed || !commandHandler) {
      return;
    }

    if (trimmed === "/approve") {
      commandHandler({ type: "approve" });
      return;
    }

    if (trimmed === "/deny") {
      commandHandler({ type: "deny" });
      return;
    }

    if (trimmed === "/disconnect") {
      commandHandler({ type: "disconnect" });
      return;
    }

    if (trimmed === "/status") {
      commandHandler({ type: "status" });
      return;
    }

    if (trimmed === "/help") {
      commandHandler({ type: "help" });
      return;
    }

    if (trimmed.startsWith("/chat ")) {
      commandHandler({ type: "chat", text: trimmed.slice(6) });
      return;
    }

    if (trimmed.startsWith("/signal ")) {
      const [rawType, ...rest] = trimmed.slice(8).split(" ");
      const signalType = parseSignalType(rawType ?? "");
      if (!signalType) {
        console.log(`[${prefix}] invalid signal type`);
        return;
      }

      commandHandler({ type: "signal", signalType, payload: rest.join(" ") });
      return;
    }

    console.log(`[${prefix}] unknown command`);
  });

  return {
    start() {
      console.log(
        `[${prefix}] commands: /approve /deny /chat <text> /signal <type> <payload> /disconnect /status`,
      );
    },
    stop() {
      rl.close();
    },
    showStatus(line: string) {
      console.log(`[${prefix}] ${line}`);
    },
    showChat(from: string, text: string) {
      console.log(`[${prefix}] chat from ${from}: ${text.replace(/[\r\n]+/g, " ").trim()}`);
    },
    onCommand(handler) {
      commandHandler = handler;
    },
  };
}
