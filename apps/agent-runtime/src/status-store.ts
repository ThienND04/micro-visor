import type { ConnectionStatus } from "../../../packages/protocol/src/index.js";
import type { RuntimeState } from "./types.js";

export function initialRuntimeState(): RuntimeState {
  return {
    connectionStatus: "idle",
    statusLine: "Runtime idle",
  };
}

export function updateStatus(
  state: RuntimeState,
  nextStatus: ConnectionStatus,
  detail?: string,
): RuntimeState {
  return {
    ...state,
    connectionStatus: nextStatus,
    statusLine: detail ? `${nextStatus}: ${detail}` : nextStatus,
    connectedViewerId:
      nextStatus === "disconnected" || nextStatus === "waiting"
        ? undefined
        : state.connectedViewerId,
  };
}

export function setPendingViewer(state: RuntimeState, viewerId: string): RuntimeState {
  return {
    ...state,
    pendingViewerId: viewerId,
    statusLine: `Pending decision for ${viewerId}`,
  };
}

export function resolvePendingViewer(state: RuntimeState, allow: boolean): RuntimeState {
  if (!state.pendingViewerId) {
    return state;
  }

  return {
    ...state,
    connectedViewerId: allow ? state.pendingViewerId : undefined,
    pendingViewerId: undefined,
    statusLine: allow ? `Connected to ${state.pendingViewerId}` : "Request rejected",
  };
}
