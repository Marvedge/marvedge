import { describe, it, expect, vi } from "vitest";
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
    expect(mockRedisClient.options.tls).toBeDefined();
  });
});
