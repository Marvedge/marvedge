import Redis from "ioredis";

export const monitoringRedisOptions = {
  maxRetriesPerRequest: 1,
  commandTimeout: 1000,
  connectTimeout: 1000,
  enableOfflineQueue: false,
};

export type MonitoringRedisFactory = (
  redisUrl: string,
  options: typeof monitoringRedisOptions
) => Redis;

export function createWorkerMonitoringRedis(
  redisUrl: string,
  createClient: MonitoringRedisFactory = (url, options) => new Redis(url, options)
): Redis {
  const monitoringRedis = createClient(redisUrl, monitoringRedisOptions);
  monitoringRedis.on("error", () => {
    console.error("[monitoring] Worker latency Redis connection error.");
  });
  return monitoringRedis;
}
