import "dotenv/config";

import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createPersistenceAdapter } from "./persistence/index.js";

async function main() {
  const config = loadConfig();
  const logger = createLogger(config);
  const persistence = await createPersistenceAdapter(config);
  const app = await buildApp(config, logger, persistence);

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutdown signal received");
    await app.close();
    await persistence.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({
    host: config.HOST,
    port: config.PORT
  });

  logger.info(
    {
      host: config.HOST,
      port: config.PORT,
      environment: config.SERVICE_ENVIRONMENT
    },
    "Proposal Follow-Up Enforcer runtime listening"
  );
}

main().catch((error) => {
  console.error("Startup failure", error);
  process.exit(1);
});
