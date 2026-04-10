import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";

const ddb = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
});

const DDB_TABLE = process.env.DDB_TABLE || "marvedge-export-jobs";

type AwsJobStatus = {
  state: string;
  progress: number;
  exportedUrl?: string | null;
  error?: string | null;
  totalChunks?: number | null;
  chunksFinished?: number | null;
};

function parseNum(value: { N?: string } | undefined): number | null {
  if (!value?.N) {
    return null;
  }
  const parsed = Number(value.N);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getAwsJobProgress(jobId: string): Promise<AwsJobStatus | null> {
  if (!jobId) {
    return null;
  }

  const resp = await ddb.send(
    new GetItemCommand({
      TableName: DDB_TABLE,
      Key: {
        jobId: { S: jobId },
      },
      ConsistentRead: true,
    })
  );

  const item = resp.Item;
  if (!item) {
    return null;
  }

  const status = item.status?.S || "PENDING";
  const totalChunks = parseNum(item.totalChunks);
  const chunksFinished = parseNum(item.chunks_finished);
  const exportedUrl = item.exportedUrl?.S || null;
  const error = item.error?.S || null;

  let progress = 0;
  if (status === "MERGED" || status === "COMPLETED") {
    progress = 100;
  } else if (totalChunks && chunksFinished !== null && totalChunks > 0) {
    const ratio = Math.max(0, Math.min(1, chunksFinished / totalChunks));
    progress = Math.min(95, 5 + Math.floor(ratio * 90));
  } else if (status === "MERGING") {
    progress = 95;
  } else if (status === "FAILED" || status === "MERGE_FAILED") {
    progress = 0;
  } else {
    progress = 5;
  }

  const stateMap: Record<string, string> = {
    PENDING: "waiting",
    SPLITTING: "active",
    PROCESSING: "active",
    MERGING: "active",
    MERGED: "completed",
    COMPLETED: "completed",
    FAILED: "failed",
    MERGE_FAILED: "failed",
  };

  return {
    state: stateMap[status] || status.toLowerCase(),
    progress,
    exportedUrl,
    error,
    totalChunks,
    chunksFinished,
  };
}
