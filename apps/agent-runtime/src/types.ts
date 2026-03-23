import type { ConnectionStatus, WebRtcSignalType } from "../../../packages/protocol/src/index.js";

export type RuntimeState = {
  connectionStatus: ConnectionStatus;
  statusLine: string;
  connectedViewerId?: string;
  pendingViewerId?: string;
};

export type RuntimeCommand =
  | { type: "approve" }
  | { type: "deny" }
  | { type: "disconnect" }
  | { type: "chat"; text: string }
  | { type: "signal"; signalType: WebRtcSignalType; payload: string }
  | { type: "status" }
  | { type: "help" };

export type RuntimeUiAdapter = {
  start: () => void;
  stop: () => void;
  showStatus: (line: string) => void;
  showChat: (from: string, text: string) => void;
  onCommand: (handler: (command: RuntimeCommand) => void) => void;
};
