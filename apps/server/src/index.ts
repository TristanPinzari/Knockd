import "./env"; // validate environment first
import { createServer } from "node:http";
import { createApp } from "./app";
import { pg } from "./db/client";
import { env } from "./env";
import { logger } from "./logger";
import { closeRealtime, createRealtime } from "./realtime/io";

const server = createServer(createApp());
createRealtime(server);

server.listen(env.PORT, () => {
  logger.info(`Knockd API listening on http://localhost:${env.PORT}`);
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  await closeRealtime();
  server.close();
  await pg.end({ timeout: 5 });
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
