import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
let os = require("node:os");
let path = require("node:path");
import {
  updateEnvFileIdempotent,
  bootstrapWorkerConfig,
  parseSsmCliOutput,
  parseSsmParameters,
} from "./workerBootstrap";

describe("workerBootstrap", () => {
  let tempDir: string;
  let envFilePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bootstrap-test-"));
    envFilePath = path.join(tempDir, "worker.env");
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("parses raw SSM parameters correctly", () => {
    const rawParams = [
      { Name: "/marvedge/worker/WORKER_SECRET", Value: "abcdef1" },
      { Name: "/marvedge/worker/DEEPGRAM_API_KEY", Value: "deepgram1" },
      { Name: "/marvedge/worker/REDIS_URL", Value: "rediss://example.com" },
    ];

    const parsed = parseSsmParameters(rawParams);
    expect(parsed.WORKER_SECRET).toBe("abcdef1");
    expect(parsed.DEEPGRAM_API_KEY).toBe("deepgram1");
    expect(parsed.REDIS_URL).toBe("rediss://example.com");
  });

  it("parses AWS CLI JSON envelope shape {Parameters: [...]}", () => {
    const cliJson = {
      Parameters: [
        { Name: "/marvedge/worker/WORKER_SECRET", Value: "secret123" },
        { Name: "/marvedge/worker/DEEPGRAM_API_KEY", Value: "deep123" },
      ],
    };
    const parsed = parseSsmCliOutput(cliJson);
    expect(parsed.WORKER_SECRET).toBe("secret123");
  });

  it("throws when NextTokem is present to prevent truncated secret loading", () => {
    const truncatedJson = {
      Parameters: [{ Name: "/marvedge/worker/WORKER_SECRET", Value: "sec" }],
      NextToken: "batch-2-token",
    };
    expect(() => parseSsmCliOutput(truncatedJson)).toThrowError(
      /SSM parameter query result was truncated/
    );
  });

  it("replaces existing keys idempotently without duplication", () => {
    fs.writeFileSync(
      envFilePath,
      "KEEP_ME=1\nWORKER_SECRET=old-secret\n",
      "utf-8"
    );

    updateEnvFileIdempotent({
      envFilePath,
      newEntries: {
        WORKER_SECRET: "new-secret",
        NEW_KEY: "value1",
      },
    });

    const result = fs.readFileSync(envFilePath, "utf-8");
    expect(result).toContain("KEEP_ME=1");
    expect(result).toContain('WORKER_SECRET="new-secret"');
    expect(result).not.toContain('old-secret');
    expect(result).toContain('NEW_KEY="value1"');

    const matches = result.split(/\r?\n/).filter(l => l.startsWith("WORKER_SECRET="));
    expect(matches).toHaveLength(1);
  });

  it("throws when required secret parameters are missing", () => {
    expect(() =>
      bootstrapWorkerConfig(envFilePath, { WORKER_SECRET: "", DEEPGRAM_API_KEY: "" })
    ).toThrowError(/missing required secret parameters/);
  });

  it("validates all production secrets when requireAllProdSecrets is true", () => {
    expect(() =>
      bootstrapWorkerConfig(
        envFilePath,
        { WORKER_SECRET: "sec", DEEPGRAM_API_KEY: "deep" },
        {},
        { requireAllProdSecrets: true }
      )
    ).toThrowError(/missing required secret parameters: CALLBACK_SECRET, REDIS_URL, BACKEND_URL/);
  });

  it("successfully bootstraps complete worker configuration with additional entries", () => {
    bootstrapWorkerConfig(
      envFilePath,
      {
        WORKER_SECRET: "test-worker-secret",
        DEEPGRAM_API_KEY: "test-deepgram-key",
        REDIS_URL: "rediss://marvedge-upstash.io",
        BACKEND_URL: "https://marvedge.com",
        CALLBACK_SECRET: "callback-secret-val",
        WORKER_CONCURRENCY: "1",
      },
      {
        STORAGE_PROVIDER: "aws",
        AWS_REGION: "ap-southeast-2",
      }
    );

    const result = fs.readFileSync(envFilePath, "utf-8");
    expect(result).toContain('WORKER_SECRET="test-worker-secret"');
    expect(result).toContain('DEEPGRAM_API_KEY="test-deepgram-key"');
    expect(result).toContain('REDIS_URL="rediss://marvedge-upstash.io"');
    expect(result).toContain('BACKEND_URL="https://marvedge.com"');
    expect(result).toContain('STORAGE_PROVIDER="aws"');
    expect(result).toContain('AWS_REGION="ap-southeast-2"');
  });
});
