export type Role = "agent" | "viewer";

export type ConnectionStatus =
  | "idle"
  | "waiting"
  | "requested"
  | "approved"
  | "rejected"
  | "connected"
  | "disconnected";

export interface RegisterPayload {
  userId: string;
  role: Role;
  sessionCode: string;
}

export interface ViewRequestPayload {
  targetAgentId: string;
}

export interface ViewDecisionPayload {
  viewerId: string;
  allow: boolean;
}

export interface OneLineChatPayload {
  to: string;
  text: string;
}

export type ClientToServerMessage =
  | { type: "register"; payload: RegisterPayload }
  | { type: "view_request"; payload: ViewRequestPayload }
  | { type: "view_decision"; payload: ViewDecisionPayload }
  | { type: "chat"; payload: OneLineChatPayload }
  | { type: "disconnect"; payload?: { reason?: string } }
  | { type: "ping" };

export type ServerToClientMessage =
  | { type: "registered"; payload: { connectionId: string; status: ConnectionStatus } }
  | { type: "status"; payload: { status: ConnectionStatus; detail?: string } }
  | { type: "view_request"; payload: { viewerId: string } }
  | { type: "view_decision"; payload: { agentId: string; allow: boolean; reason?: string } }
  | { type: "chat"; payload: { from: string; text: string } }
  | { type: "error"; payload: { code: string; message: string } }
  | { type: "pong" };

export type AnyProtocolMessage = ClientToServerMessage | ServerToClientMessage;

export function parseClientMessage(raw: string): ClientToServerMessage | null {
  try {
    const value = JSON.parse(raw) as { type?: string; payload?: unknown };
    if (!value.type || typeof value.type !== "string") {
      return null;
    }

    return value as ClientToServerMessage;
  } catch {
    return null;
  }
}

export function parseServerMessage(raw: string): ServerToClientMessage | null {
  try {
    const value = JSON.parse(raw) as { type?: string; payload?: unknown };
    if (!value.type || typeof value.type !== "string") {
      return null;
    }

    return value as ServerToClientMessage;
  } catch {
    return null;
  }
}

export function toJson(message: AnyProtocolMessage): string {
  return JSON.stringify(message);
}
