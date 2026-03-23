# micro-visor

Minimal bootstrap for a low-distraction remote screen sharing app.

Current focus is Phase A foundation:

- Signaling service and session workflow skeleton
- Agent A CLI process
- Viewer B CLI process
- One-line chat channel

Phase B signaling upgrades are now included:

- WebRTC signaling relay (offer, answer, ice, renegotiate)
- Heartbeat and stale-connection timeout handling on signaling server
- Automatic reconnect in Agent and Viewer clients with exponential backoff
- Session audit logging on signaling server

## Status

Early development prototype. Not production ready.

## Repository layout

- `packages/protocol`: shared message protocol types and parsers
- `services/signaling`: WebSocket signaling server
- `apps/agent-cli`: Agent-side client process
- `apps/viewer-cli`: Viewer-side client process
- `docs`: implementation notes and status

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Start signaling server:

```bash
npx tsx services/signaling/src/index.ts
```

3. Start Agent A:

```bash
npx tsx apps/agent-cli/src/index.ts --user-id A --session-code DEMO-123 --auto-allow true
```

4. Start Viewer B:

```bash
npx tsx apps/viewer-cli/src/index.ts --user-id B --session-code DEMO-123 --target-agent A
```

5. In Viewer, try one-line commands:

```text
/chat hello-from-viewer
/signal offer v=0\no=- 0 0 IN IP4 127.0.0.1
/disconnect
```

## Quality checks

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run format:check
```

## Development workflow

- Use feature branches from `main`
- Run `npm run check` before opening a PR
- Use issue templates and PR template in `.github`

## Security

Please report vulnerabilities privately. See `SECURITY.md`.

## Contributing

See `CONTRIBUTING.md` for setup, conventions, and PR checklist.

## License

MIT. See `LICENSE`.

## Notes

- This baseline includes WebRTC signaling only, not media capture/encoding yet.
- Next phase is native screen capture and tray-based UI behavior for Agent A.
- Current UX behavior is no modal popup during disconnect. Status changes are one-line log entries.
