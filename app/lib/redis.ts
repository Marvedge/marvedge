import { Redis } from "ioredis";
import { resolveRedisConfig } from "./redisConfig";

const redisConfig = resolveRedisConfig();

const connection = new Redis(redisConfig.url, redisConfig.options);

// Log connection errors without throwing so jobs stay queued.
connection.on("error", (err) => {
  console.error("Redis connection error:", err?.message || err);
});

export default connection;
