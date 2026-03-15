import { Redis } from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

export default connection;
