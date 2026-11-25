import { Redis } from "ioredis";
import { resolveDubbingQueueName, resolveReframeQueueName } from "./config/dubbingQueue";
import { resolveRedisConfig } from "./redisConfig";

// Fail closed in staging before opening a Redis connection if isolated queue names are missing/invalid.
resolveReframeQueueName();
resolveDubbingQueueName();

const redisConfig = resolveRedisConfig();

const connection = new Redis(redisConfig.url, redisConfig.options);

// Log connection errors without throwing so jobs stay queued.
connection.on("error", (err) => {
  console.error("Redis connection error:", err?.message || err);
});

export default connection;
