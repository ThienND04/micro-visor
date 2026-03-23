# Implementation status

## Done in this iteration

- Monorepo scaffold with workspaces for:
  - `packages/protocol`
  - `services/signaling`
  - `apps/agent-cli`
  - `apps/viewer-cli`
- Protocol message schema and JSON parsing helpers
- WebSocket signaling server supporting:
  - register agent/viewer
  - viewer -> agent view request
  - agent allow/reject decision
  - one-line chat relay
  - disconnect state propagation
- Agent CLI process:
  - receives view requests
  - supports auto allow mode
  - one-line chat and disconnect commands
- Viewer CLI process:
  - requests session access
  - receives decision/status
  - one-line chat and disconnect commands
- Safety hardening:
  - guard against sending when socket is not open

## Verified manually

- Typecheck passes across all workspaces
- Build passes across all workspaces
- Runtime smoke test confirms request/approve/chat/disconnect flow

## Not done yet

- Real screen capture pipeline
- WebRTC media stream setup (SDP/ICE forwarding)
- System tray icon and small status overlay UI on Agent A
- Tiny corner chat widget UI (currently CLI only)
- Packaging for Linux and Windows

## Next implementation target

Phase B: Add WebRTC negotiation messages and establish peer media stream channel.
