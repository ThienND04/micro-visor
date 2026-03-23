import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

type AuditDetails = Record<string, string | number | boolean | undefined>;

export interface AuditLogger {
  log: (event: string, details?: AuditDetails) => void;
}

function sanitize(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function serialize(details?: AuditDetails): string {
  if (!details) {
    return "";
  }

  return Object.entries(details)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${sanitize(String(value))}`)
    .join(" ");
}

export function createAuditLogger(logPath?: string): AuditLogger {
  const targetPath = logPath ?? join(process.cwd(), "logs", "sessions.log");
  let prepared = false;

  async function ensurePath(): Promise<void> {
    if (prepared) {
      return;
    }

    await mkdir(dirname(targetPath), { recursive: true });
    prepared = true;
  }

  return {
    log(event: string, details?: AuditDetails) {
      const at = new Date().toISOString();
      const line = `[${at}] event=${event} ${serialize(details)}\n`;

      void ensurePath()
        .then(() => appendFile(targetPath, line))
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[signaling:audit] failed to write log: ${message}`);
        });
    },
  };
}
