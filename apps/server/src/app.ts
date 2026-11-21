import path from "node:path";
import compression from "compression";
import cors from "cors";
import express from "express";
import { pinoHttp } from "pino-http";
import { sql } from "drizzle-orm";
import { db } from "./db/client";
import { env } from "./env";
import { corsOrigin } from "./http/cors";
import { errorHandler, unknownRoute } from "./http/errors";
import { accountRouter } from "./http/routes/account";
import { sessionsRouter } from "./http/routes/sessions";
import { logger } from "./logger";
import { tilesRouter } from "./tiles/router";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // behind Coolify's proxy in production

  app.use(
    compression({
      // Vector tiles aren't on the default "compressible" list, but shrink a lot with gzip.
      filter: (req, res) =>
        String(res.getHeader("Content-Type") ?? "").includes("vector-tile") || compression.filter(req, res),
    }),
  );
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: "1mb" }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === "/health" },
      // Don't log session tokens.
      redact: ["req.headers.authorization"],
    }),
  );

  app.get("/health", async (_req, res) => {
    await db.execute(sql`SELECT 1`);
    res.json({ ok: true });
  });

  // Basemap: style.json and XYZ tiles, plus the raw london.pmtiles (HTTP range requests).
  app.use("/tiles", tilesRouter);
  app.use("/tiles", express.static(path.resolve(env.TILES_DIR), { maxAge: "1d" }));

  app.use("/v1/sessions", sessionsRouter);
  app.use("/v1", accountRouter);

  app.use(unknownRoute);
  app.use(errorHandler);
  return app;
}
