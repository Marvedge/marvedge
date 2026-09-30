import { Redis } from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

// Log connection errors without throwing so jobs stay queued.
connection.on("error", (err) => {
  console.error("Redis connection error:", err?.message || err);
});

export default connection;
