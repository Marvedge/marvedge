import { describe, it, expect } from "vitest";
import { getStandardRedisOptions } from "../app/lib/redisConfig";

describe("Video Worker Redis Connection Options", () => {
  it("enforces BullMQ requirements: maxRetriesPerRequest is null", () => {
    const options = getStandardRedisOptions();
    expect(options.maxRetriesPerRequest).toBeNull();
  });

  it("sets enableReadyCheck to false for managed Redis compatibility", () => {
    const options = getStandardRedisOptions();
    expect(options.enableReadyCheck).toBe(false);
  });

  it("sets connectTimeout to 5000ms to avoid indefinite connection hangs", () => {
    const options = getStandardRedisOptions();
    expect(options.connectTimeout).toBe(5000);
  });

  it("passes valid connection options to Worker configuration", () => {
    const workerOptions = {
      connection: {
        host: "localhost",
        port: 6379,
        ...getStandardRedisOptions(),
      },
      concurrency: 2,
    };

    expect(workerOptions.connection.maxRetriesPerRequest).toBeNull();
    expect(workerOptions.connection.enableReadyCheck).toBe(false);
    expect(workerOptions.connection.connectTimeout).toBe(5000);
    expect(workerOptions.concurrency).toBe(2);
  });

  it("handles rediss:// TLS connection options correctly", () => {
    const standardOptions = getStandardRedisOptions();
    const mockRedisClient = {
      options: {
        ...standardOptions,
        tls: {},
      },
      status: "ready",
    };

    expect(mockRedisClient.options.maxRetriesPerRequest).toBeNull();
    expect(mockRedisClient.options.enableReadyCheck).toBe(false);
    expect(mockRedisClient.options.connectTimeout).toBe(5000);
    expect(mockRedisClient.options.tls).toBeDefined();
  });
});
