/**
 * cloudrun-worker/jobstore.cjs
 *
 * Job state store — AWS DynamoDB (primary) replacing Google Cloud Firestore.
 *
 * Provides the same API surface that server.js used via the Firestore SDK:
 *   - getRecipe(recipeId)             → recipe document
 *   - setChunkStatus(chunkId, data)   → upsert chunk state
 *   - getChunk(chunkId)               → chunk document
 *   - incrementField(table, id, field, delta) → atomic counter increment
 *
 * Collection names are read from env vars set in .env:
 *   RECIPES_COLLECTION  = "marvedge-recipes"  (DynamoDB table)
 *   CHUNKS_COLLECTION   = "marvedge-chunks"   (DynamoDB table)
 *
 * Fallback: When STORAGE_PROVIDER=gcs (GCS fallback mode), this module
 * transparently routes calls to Firestore, keeping GCS + Firestore together
 * as a unified fallback tier.
 */

"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

const RECIPES_TABLE  = process.env.RECIPES_COLLECTION  || "marvedge-recipes";
const CHUNKS_TABLE   = process.env.CHUNKS_COLLECTION   || "marvedge-chunks";

// ---------------------------------------------------------------------------
// Provider detection (mirrors storage.cjs)
// ---------------------------------------------------------------------------

function activeProvider() {
  const p = (process.env.STORAGE_PROVIDER || "aws").trim().toLowerCase();
  return p === "gcs" ? "gcs" : "aws";
}

// ---------------------------------------------------------------------------
// DynamoDB singleton
// ---------------------------------------------------------------------------

let _ddb = null;
function getDdb() {
  if (_ddb) return _ddb;
  const client = new DynamoDBClient({ region: process.env.AWS_REGION || "ap-southeast-2" });
  _ddb = DynamoDBDocumentClient.from(client, {
    marshallOptions:   { removeUndefinedValues: true },
    unmarshallOptions: { wrapNumbers: false },
  });
  return _ddb;
}

// ---------------------------------------------------------------------------
// Firestore singleton (lazy — only when STORAGE_PROVIDER=gcs)
// ---------------------------------------------------------------------------

let _firestore = null;
function getFirestore() {
  if (_firestore) return _firestore;
  const { Firestore } = require("@google-cloud/firestore");
  _firestore = new Firestore();
  return _firestore;
}

// ---------------------------------------------------------------------------
// Recipe operations
// ---------------------------------------------------------------------------

/**
 * Fetch a recipe document by ID.
 * Returns null if not found.
 */
async function getRecipe(recipeId) {
  if (activeProvider() === "aws") {
    const resp = await getDdb().send(new GetCommand({
      TableName: RECIPES_TABLE,
      Key: { id: recipeId },
    }));
    return resp.Item || null;
  }
  // Firestore fallback
  const doc = await getFirestore().collection(RECIPES_TABLE).doc(recipeId).get();
  return doc.exists ? doc.data() : null;
}

/**
 * Write or overwrite a recipe document.
 */
async function putRecipe(recipeId, data) {
  if (activeProvider() === "aws") {
    await getDdb().send(new PutCommand({
      TableName: RECIPES_TABLE,
      Item: { id: recipeId, updatedAt: new Date().toISOString(), ...data },
    }));
    return;
  }
  // Firestore fallback
  await getFirestore().collection(RECIPES_TABLE).doc(recipeId).set(data, { merge: true });
}

// ---------------------------------------------------------------------------
// Chunk operations
// ---------------------------------------------------------------------------

/**
 * Fetch a chunk document by ID.
 * Returns null if not found.
 */
async function getChunk(chunkId) {
  if (activeProvider() === "aws") {
    const resp = await getDdb().send(new GetCommand({
      TableName: CHUNKS_TABLE,
      Key: { id: chunkId },
    }));
    return resp.Item || null;
  }
  // Firestore fallback
  const doc = await getFirestore().collection(CHUNKS_TABLE).doc(chunkId).get();
  return doc.exists ? doc.data() : null;
}

/**
 * Upsert chunk state. Merges data into the existing document.
 */
async function setChunkStatus(chunkId, data) {
  if (activeProvider() === "aws") {
    // Build a safe UpdateExpression from the data keys
    const keys  = Object.keys(data);
    const names  = {};
    const values = {};
    const setParts = keys.map((k, i) => {
      names[`#k${i}`]  = k;
      values[`:v${i}`] = data[k];
      return `#k${i} = :v${i}`;
    });
    // Always stamp updatedAt
    names["#ua"]   = "updatedAt";
    values[":ua"]  = new Date().toISOString();
    setParts.push("#ua = :ua");

    await getDdb().send(new UpdateCommand({
      TableName: CHUNKS_TABLE,
      Key: { id: chunkId },
      UpdateExpression: `SET ${setParts.join(", ")}`,
      ExpressionAttributeNames:  names,
      ExpressionAttributeValues: values,
    }));
    return;
  }
  // Firestore fallback
  await getFirestore().collection(CHUNKS_TABLE).doc(chunkId).set(data, { merge: true });
}

/**
 * Atomically increment a numeric field by `delta` (default 1).
 * This mirrors Firestore's FieldValue.increment().
 */
async function incrementField(tableName, docId, fieldName, delta = 1) {
  if (activeProvider() === "aws") {
    await getDdb().send(new UpdateCommand({
      TableName: tableName,
      Key: { id: docId },
      UpdateExpression: "ADD #f :d SET #ua = :ua",
      ExpressionAttributeNames: { "#f": fieldName, "#ua": "updatedAt" },
      ExpressionAttributeValues: { ":d": delta, ":ua": new Date().toISOString() },
    }));
    return;
  }
  // Firestore fallback
  const { FieldValue } = require("@google-cloud/firestore");
  await getFirestore()
    .collection(tableName)
    .doc(docId)
    .update({ [fieldName]: FieldValue.increment(delta) });
}

module.exports = {
  RECIPES_TABLE,
  CHUNKS_TABLE,
  getRecipe,
  putRecipe,
  getChunk,
  setChunkStatus,
  incrementField,
};
