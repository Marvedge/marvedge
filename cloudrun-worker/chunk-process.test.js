/**
 * Unit tests for worker chunk-state and recipe store access (Task-00018).
 *
 * Proves:
 * 1. getRecipeById and updateChunkStatus use jobstore (DynamoDB / fallback), not an undefined firestore variable.
 * 2. setChunkStatus handles DynamoDB updates cleanly without throwing ReferenceError.
 * 3. getRecipeById throws descriptive error when recipe is missing.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("express", () => {
  const mockApp = {
    use: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    listen: vi.fn(),
  };
  const fn = () => mockApp;
  fn.json = () => vi.fn();
  return { default: fn, ...fn };
});

const mockDdbSend = vi.fn().mockResolvedValue({});
class MockUpdateCommand {
  constructor(input) {
    this.input = input;
  }
}
class MockGetCommand {
  constructor(input) {
    this.input = input;
  }
}
class MockPutCommand {
  constructor(input) {
    this.input = input;
  }
}
const mockDocClient = {
  send: mockDdbSend,
};

class MockDynamoDBClient {}
class MockFirestore {
  constructor() {
    return mockFirestore;
  }
}

const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "@aws-sdk/lib-dynamodb") {
    return {
      DynamoDBDocumentClient: {
        from: vi.fn(() => mockDocClient),
      },
      UpdateCommand: MockUpdateCommand,
      GetCommand: MockGetCommand,
      PutCommand: MockPutCommand,
    };
  }
  if (request === "@aws-sdk/client-dynamodb") {
    return {
      DynamoDBClient: MockDynamoDBClient,
    };
  }
  if (request === "@google-cloud/firestore") {
    return {
      Firestore: MockFirestore,
      FieldValue: {
        increment: vi.fn((delta) => ({ _increment: delta })),
      },
    };
  }
  return originalLoad.apply(this, arguments);
};

const mockFirestoreDoc = {
  set: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ id: "chunk-1" }) }),
};
const mockFirestoreCollection = {
  doc: vi.fn(() => mockFirestoreDoc),
};
const mockFirestore = {
  collection: vi.fn(() => mockFirestoreCollection),
};

vi.mock("@google-cloud/firestore", () => ({
  Firestore: vi.fn().mockImplementation(() => mockFirestore),
  FieldValue: {
    increment: vi.fn((delta) => ({ _increment: delta })),
  },
}));

vi.mock("./storage.cjs", () => ({
  downloadObject: vi.fn(),
  downloadFromUri: vi.fn(),
  uploadObject: vi.fn(),
  getSignedDownloadUrl: vi.fn(),
  getSignedUrlForUri: vi.fn(),
  objectExists: vi.fn(),
  deleteObject: vi.fn(),
  toPublicHttpsUrl: vi.fn(),
  toStorageUri: vi.fn(),
  parseStorageUri: vi.fn(),
  parseS3Uri: vi.fn(),
  parseGsUri: vi.fn(),
  activeProvider: vi.fn(() => "aws"),
}));

const jobstore = require("./jobstore.cjs");
const { getRecipeById, updateChunkStatus } = require("./server.js");

describe("Cloud Run Worker - Chunk State & Recipe Store Access", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockDdbSend.mockClear();
    mockFirestoreDoc.set.mockClear();
    mockFirestore.collection.mockClear();
  });

  it("getRecipeById delegates to jobstore.getRecipe", async () => {
    const mockRecipe = {
      id: "recipe-123",
      videoUrl: "https://example.com/video.mp4",
      segments: [{ start: 0, end: 10 }],
    };

    const spy = vi.spyOn(jobstore, "getRecipe").mockResolvedValue(mockRecipe);

    const result = await getRecipeById("recipe-123");

    expect(spy).toHaveBeenCalledWith("recipe-123");
    expect(result).toEqual(mockRecipe);
  });

  it("getRecipeById throws when recipe is not found", async () => {
    vi.spyOn(jobstore, "getRecipe").mockResolvedValue(null);

    await expect(getRecipeById("missing-recipe")).rejects.toThrow(
      "Recipe not found: missing-recipe"
    );
  });

  it("updateChunkStatus delegates patch to jobstore.setChunkStatus without undefined firestore", async () => {
    const spy = vi.spyOn(jobstore, "setChunkStatus").mockResolvedValue(undefined);

    const patch = {
      recipeId: "recipe-123",
      status: "PROCESSING",
      rawBucket: "raw-bucket",
      rawObject: "chunk_001.webm",
      error: null,
    };

    await expect(updateChunkStatus("chunk-001", patch)).resolves.not.toThrow();
    expect(spy).toHaveBeenCalledWith("chunk-001", patch);
  });

  describe("DynamoDB UpdateCommand generation in jobstore.setChunkStatus", () => {
    it("preserves error: null in ExpressionAttributeValues when updating chunk status", async () => {
      const origProvider = process.env.STORAGE_PROVIDER;
      try {
        process.env.STORAGE_PROVIDER = "aws";
        await jobstore.setChunkStatus("chunk-001", {
          recipeId: "recipe-123",
          status: "PROCESSING",
          rawBucket: "raw-bkt",
          rawObject: "input.webm",
          error: null,
        });

        expect(mockDdbSend).toHaveBeenCalledOnce();
        const command = mockDdbSend.mock.calls[0][0];
        expect(command).toBeInstanceOf(MockUpdateCommand);
        const { TableName, Key, UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues } =
          command.input;

        expect(TableName).toBe("marvedge-chunks");
        expect(Key).toEqual({ id: "chunk-001" });

        // 1. error: null is preserved in ExpressionAttributeValues
        const errorKey = Object.keys(ExpressionAttributeNames).find(
          (k) => ExpressionAttributeNames[k] === "error"
        );
        expect(errorKey).toBeDefined();
        const errorValPlaceholder = errorKey.replace("#k", ":v");
        expect(ExpressionAttributeValues[errorValPlaceholder]).toBeNull();
        expect(UpdateExpression).toContain(`${errorKey} = ${errorValPlaceholder}`);
      } finally {
        process.env.STORAGE_PROVIDER = origProvider;
      }
    });

    it("excludes keys with undefined values from UpdateExpression and attribute values", async () => {
      const origProvider = process.env.STORAGE_PROVIDER;
      try {
        process.env.STORAGE_PROVIDER = "aws";
        await jobstore.setChunkStatus("chunk-002", {
          status: "PROCESSING",
          error: null,
          skippedField1: undefined,
          skippedField2: undefined,
          processedBucket: "bucket-done",
        });

        expect(mockDdbSend).toHaveBeenCalledOnce();
        const { UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues } =
          mockDdbSend.mock.calls[0][0].input;

        // 2. Keys with undefined values are excluded
        const namesList = Object.values(ExpressionAttributeNames);
        expect(namesList).not.toContain("skippedField1");
        expect(namesList).not.toContain("skippedField2");
        expect(namesList).toContain("status");
        expect(namesList).toContain("error");
        expect(namesList).toContain("processedBucket");

        for (const [key, val] of Object.entries(ExpressionAttributeValues)) {
          expect(val).not.toBeUndefined();
        }
      } finally {
        process.env.STORAGE_PROVIDER = origProvider;
      }
    });

    it("includes updatedAt in names, values, and UpdateExpression", async () => {
      const origProvider = process.env.STORAGE_PROVIDER;
      try {
        process.env.STORAGE_PROVIDER = "aws";
        await jobstore.setChunkStatus("chunk-003", { status: "DONE", error: null });

        expect(mockDdbSend).toHaveBeenCalledOnce();
        const { UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues } =
          mockDdbSend.mock.calls[0][0].input;

        // 3. updatedAt is included
        expect(ExpressionAttributeNames["#ua"]).toBe("updatedAt");
        expect(typeof ExpressionAttributeValues[":ua"]).toBe("string");
        expect(new Date(ExpressionAttributeValues[":ua"]).toString()).not.toBe("Invalid Date");
        expect(UpdateExpression).toContain("#ua = :ua");
      } finally {
        process.env.STORAGE_PROVIDER = origProvider;
      }
    });

    it("generates an UpdateExpression and attribute-name mappings that are internally consistent", async () => {
      const origProvider = process.env.STORAGE_PROVIDER;
      try {
        process.env.STORAGE_PROVIDER = "aws";
        await jobstore.setChunkStatus("chunk-004", {
          recipeId: "r-999",
          status: "PROCESSING",
          error: null,
          rawBucket: "bkt",
          undefinedKey: undefined,
        });

        expect(mockDdbSend).toHaveBeenCalledOnce();
        const { UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues } =
          mockDdbSend.mock.calls[0][0].input;

        // 4. Expression and attribute mappings internal consistency
        expect(UpdateExpression.startsWith("SET ")).toBe(true);
        const setClauses = UpdateExpression.replace(/^SET\s+/, "").split(", ");

        for (const clause of setClauses) {
          const [namePlaceholder, valPlaceholder] = clause.split(" = ");
          expect(namePlaceholder in ExpressionAttributeNames).toBe(true);
          expect(valPlaceholder in ExpressionAttributeValues).toBe(true);
        }

        for (const nameKey of Object.keys(ExpressionAttributeNames)) {
          expect(UpdateExpression).toContain(nameKey);
        }

        for (const valKey of Object.keys(ExpressionAttributeValues)) {
          expect(UpdateExpression).toContain(valKey);
        }
      } finally {
        process.env.STORAGE_PROVIDER = origProvider;
      }
    });

    it("preserves Firestore fallback behavior when STORAGE_PROVIDER=gcs", async () => {
      const origProvider = process.env.STORAGE_PROVIDER;
      try {
        process.env.STORAGE_PROVIDER = "gcs";
        await jobstore.setChunkStatus("chunk-gcs", {
          status: "DONE",
          error: null,
        });

        // 5. Existing Firestore fallback behavior remains unchanged
        expect(mockFirestore.collection).toHaveBeenCalledWith("marvedge-chunks");
        expect(mockFirestoreCollection.doc).toHaveBeenCalledWith("chunk-gcs");
        expect(mockFirestoreDoc.set).toHaveBeenCalledWith(
          { status: "DONE", error: null },
          { merge: true }
        );
        expect(mockDdbSend).not.toHaveBeenCalled();
      } finally {
        process.env.STORAGE_PROVIDER = origProvider;
      }
    });
  });
});
