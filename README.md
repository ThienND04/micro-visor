# micro-visor

Minimal bootstrap for a low-distraction remote screen sharing app.

Current focus is Phase A foundation:

- Signaling service and session workflow skeleton
- Agent A runtime process
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
- `apps/agent-runtime`: Agent runtime shell with adapter-based UI architecture
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

3. Start Agent A with Agent Runtime shell (canonical path):

```bash
npx tsx apps/agent-runtime/src/index.ts --user-id A --session-code DEMO-123
```

Important: only run one Agent process per userId. The signaling server keeps one active
connection per userId and will replace the old connection.

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

Agent Runtime shell commands:

```text
/approve
/deny
/chat hello
/signal offer <sdp>
/disconnect
/status
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
- Agent runtime currently uses a console UI adapter; native tray/overlay adapter is the next step.
- Current UX behavior is no modal popup during disconnect. Status changes are one-line log entries.
