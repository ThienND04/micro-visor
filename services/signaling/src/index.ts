import { startSignalingServer } from "./server.js";

const port = Number(process.env.PORT ?? 8787);

void startSignalingServer({
  port,
  auditLogPath: process.env.AUDIT_LOG_PATH,
}).then((server) => {
  console.log(`[signaling] listening on ws://localhost:${server.port}/ws`);
});
