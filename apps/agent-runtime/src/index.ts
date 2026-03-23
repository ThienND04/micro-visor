import { startAgentRuntimeCli } from "./bootstrap.js";

const runtime = startAgentRuntimeCli(process.argv.slice(2));

process.on("SIGINT", () => {
  runtime.stop();
  process.exit(0);
});
