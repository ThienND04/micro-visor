import { AgentRuntime } from "./runtime.js";

export type AgentRuntimeArgs = {
  serverUrl: string;
  userId: string;
  sessionCode: string;
  autoAllow: boolean;
  reconnectBaseMs: number;
  reconnectMaxMs: number;
};

export function parseAgentRuntimeArgs(argv: string[]): AgentRuntimeArgs {
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

export function startAgentRuntimeFromArgs(args: AgentRuntimeArgs): AgentRuntime {
  const runtime = new AgentRuntime(args);
  runtime.start();
  return runtime;
}

export function startAgentRuntimeCli(argv: string[]): AgentRuntime {
  return startAgentRuntimeFromArgs(parseAgentRuntimeArgs(argv));
}
