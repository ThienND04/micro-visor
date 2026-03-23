# micro-visor

Minimal implementation bootstrap for a low-distraction remote screen sharing app.

Current phase:
- Signaling + session auth skeleton
- Agent A CLI background-style client
- Viewer B CLI client
- One-line chat channel

## Quick start

1. Install dependencies

```bash
npm install
```

2. Start signaling server

```bash
npx tsx services/signaling/src/index.ts
```

3. Start Agent A

```bash
npx tsx apps/agent-cli/src/index.ts --user-id A --session-code DEMO-123 --auto-allow true
```

4. Start Viewer B

```bash
npx tsx apps/viewer-cli/src/index.ts --user-id B --session-code DEMO-123 --target-agent A
```

5. In viewer, try one-line commands

```text
/chat hello-from-viewer
/disconnect
```

## Available scripts

```bash
npm run typecheck
npm run build
```

## Notes

- This baseline does not stream video yet.
- Next phase will attach WebRTC SDP/ICE forwarding and media tracks.
- Current UX behavior is no modal popup during disconnect. Status changes are one-line log entries.
