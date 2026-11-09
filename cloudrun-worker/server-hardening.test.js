import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module, { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const routes = new Map();
let server;
let originalLoad;

function makeApp() {
  const app = {
    use() {
      return app;
    },
    get(route, handler) {
      routes.set(`GET ${route}`, handler);
      return app;
    },
    post(route, handler) {
      routes.set(`POST ${route}`, handler);
      return app;
    },
    listen() {
      return app;
    },
  };
  return app;
}

beforeAll(() => {
  // Force a tiny cap so the shared streaming cap is observable in a unit test.
  process.env.DOWNLOAD_MAX_BYTES = "10";

  originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "express") {
      const app = makeApp();
      const express = () => app;
      express.json = () => (_req, _res, next) => (next ? next() : undefined);
      express.static = () => (_req, _res, next) => (next ? next() : undefined);
      return express;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    server = require("./server.js");
  } finally {
    Module._load = originalLoad;
  }
});

afterAll(() => {
  delete process.env.DOWNLOAD_MAX_BYTES;
  delete globalThis.fetch;
  vi.restoreAllMocks();
});

function tmpDest(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cr-server-")), name);
}

function fetchResponse(body, headers = {}) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(headers),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(Buffer.from(body));
        controller.close();
      },
    }),
  };
}

function makeRes() {
  const res = {
    statusCode: 200,
    payload: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.payload = payload;
      return res;
    },
  };
  return res;
}

describe("server downloadFromUrl size cap", () => {
  it("streams a body under the cap to disk", async () => {
    globalThis.fetch = vi.fn(async () => fetchResponse("hello"));
    const dest = tmpDest("source.mp4");

    await server.downloadFromUrl({
      url: "https://93.184.216.34/source.mp4",
      destinationPath: dest,
    });

    expect(fs.readFileSync(dest, "utf8")).toBe("hello");
  });

  it("cancels a streamed body past the cap and writes nothing", async () => {
    let cancelled = false;
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(Buffer.alloc(16, 7));
        },
        cancel() {
          cancelled = true;
        },
      }),
    }));
    const dest = tmpDest("huge.mp4");

    await expect(
      server.downloadFromUrl({
        url: "https://93.184.216.34/huge.mp4",
        destinationPath: dest,
      })
    ).rejects.toThrow(/size limit/i);

    expect(cancelled).toBe(true);
    expect(fs.existsSync(dest)).toBe(false);
  });

  it("rejects an oversized Content-Length before reading", async () => {
    globalThis.fetch = vi.fn(async () =>
      fetchResponse("ignored", { "content-length": "5000" })
    );
    const dest = tmpDest("declared-huge.mp4");

    await expect(
      server.downloadFromUrl({
        url: "https://93.184.216.34/declared-huge.mp4",
        destinationPath: dest,
      })
    ).rejects.toThrow(/content-length/i);

    expect(fs.existsSync(dest)).toBe(false);
  });
});

describe("/merge recipeId validation", () => {
  const mergeHandler = () => routes.get("POST /merge");

  it.each([
    "../../../app/something",
    "../evil",
    "..",
    "/etc/passwd",
    "C:\\Windows\\x",
    "a/b",
    "recipe.mp4",
  ])("rejects traversal/absolute recipeId %s", async (recipeId) => {
    const handler = mergeHandler();
    expect(typeof handler).toBe("function");
    const res = makeRes();

    await handler(
      { body: { recipeId, chunkFilenames: ["recipe123_chunk_0.mp4"] } },
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.payload).toMatchObject({ ok: false, error: "Invalid recipeId" });
  });

  it("rejects non-string recipeId", async () => {
    const res = makeRes();
    await mergeHandler()(
      { body: { recipeId: 42, chunkFilenames: ["recipe123_chunk_0.mp4"] } },
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.payload).toMatchObject({ ok: false, error: "Invalid recipeId" });
  });
});
