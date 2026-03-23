import type { ConnectionStatus } from "../../../packages/protocol/src/index.js";
import { createConsoleUiAdapter } from "./adapters/console-ui.js";
import {
  initialRuntimeState,
  resolvePendingViewer,
  setPendingViewer,
  updateStatus,
} from "./status-store.js";
import { SignalingAgentClient } from "./signaling-agent-client.js";
import type { RuntimeCommand } from "./types.js";

type RuntimeConfig = {
  serverUrl: string;
  userId: string;
  sessionCode: string;
  autoAllow: boolean;
  reconnectBaseMs: number;
  reconnectMaxMs: number;
};

export class AgentRuntime {
  private state = initialRuntimeState();
  private readonly ui;
  private readonly client: SignalingAgentClient;

  constructor(private readonly config: RuntimeConfig) {
    this.ui = createConsoleUiAdapter(`agent-runtime:${config.userId}`);

    this.client = new SignalingAgentClient(
      {
        serverUrl: config.serverUrl,
        userId: config.userId,
        sessionCode: config.sessionCode,
        autoAllow: config.autoAllow,
        reconnectBaseMs: config.reconnectBaseMs,
        reconnectMaxMs: config.reconnectMaxMs,
      },
      {
        onStatus: (status, detail) => this.onStatus(status, detail),
        onViewerRequest: (viewerId) => {
          this.state = setPendingViewer(this.state, viewerId);
          this.ui.showStatus(this.state.statusLine);
        },
        onChat: (from, text) => this.ui.showChat(from, text),
        onWebRtcSignal: (from, signalType) => {
          this.ui.showStatus(`WebRTC ${signalType} from ${from}`);
        },
        onError: (line) => this.ui.showStatus(`error: ${line}`),
      },
    );
  }

  start(): void {
    this.ui.onCommand((command) => this.onCommand(command));
    this.ui.start();
    this.client.start();
  }

  stop(): void {
    this.client.stop();
    this.ui.stop();
  }

  private onStatus(status: ConnectionStatus, detail?: string): void {
    this.state = updateStatus(this.state, status, detail);
    this.ui.showStatus(this.state.statusLine);
  }

  private onCommand(command: RuntimeCommand): void {
    if (command.type === "approve") {
      this.client.approvePending();
      this.state = resolvePendingViewer(this.state, true);
      this.ui.showStatus(this.state.statusLine);
      return;
    }

    if (command.type === "deny") {
      this.client.denyPending();
      this.state = resolvePendingViewer(this.state, false);
      this.ui.showStatus(this.state.statusLine);
      return;
    }

    if (command.type === "chat") {
      this.client.sendChat(command.text);
      return;
    }

    if (command.type === "signal") {
      this.client.sendSignal(command.signalType, command.payload);
      return;
    }

    if (command.type === "disconnect") {
      this.client.disconnectSession();
      return;
    }

    if (command.type === "status") {
      const snapshot = this.client.snapshot();
      this.ui.showStatus(
        `status=${this.state.connectionStatus} pending=${snapshot.pendingViewerId ?? "none"} connected=${snapshot.connectedViewerId ?? "none"}`,
      );
      return;
    }

    if (command.type === "help") {
      this.ui.showStatus("commands: /approve /deny /chat /signal /disconnect /status");
    }
  }
}
