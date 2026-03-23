# Implementation status

## Done in this iteration

- Monorepo scaffold with workspaces for:
  - `packages/protocol`
  - `services/signaling`
  - `apps/agent-runtime` (canonical Agent entrypoint)
  - `apps/viewer-cli`
- Protocol message schema and JSON parsing helpers
- WebSocket signaling server supporting:
  - register agent/viewer
  - viewer -> agent view request
  - agent allow/reject decision
  - one-line chat relay
  - disconnect state propagation
- Agent runtime process:
  - receives view requests
  - supports auto allow mode
  - one-line chat and disconnect commands via console adapter
- Viewer CLI process:
  - requests session access
  - receives decision/status
  - one-line chat and disconnect commands
- Safety hardening:
  - guard against sending when socket is not open

## Done in this phase

- WebRTC signaling messages and forwarding path in protocol and signaling server
- Heartbeat timeout sweep to auto-disconnect stale clients
- Session audit log writer for signaling events
- Automatic reconnect behavior for Agent and Viewer CLI clients
- Signaling integration test suite with Vitest
- Agent Runtime scaffold with adapter-based architecture (console UI adapter)
- Runtime state store with unit tests

## Verified manually

- Typecheck passes across all workspaces
- Build passes across all workspaces
- Runtime smoke test confirms request/approve/chat/disconnect flow

## Not done yet

- Real screen capture pipeline
- WebRTC media stream setup (capture + RTCPeerConnection runtime)
- System tray icon adapter and small status overlay UI on Agent A
- Tiny corner chat widget adapter UI (runtime shell currently uses console adapter)
- Packaging for Linux and Windows

## Next implementation target

Phase C.1: Implement native tray adapter and capture backend abstraction for Agent Runtime.
