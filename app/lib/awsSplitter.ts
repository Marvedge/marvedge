import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";

type SplitterPayload = {
  jobId: string;
  userId: string;
  demoId: string | null;
  videoUrl: string;
  segments: unknown[];
  zoomEffects: unknown[];
  textOverlays: unknown[];
  subtitles: unknown[];
  selectedBackground: string | null;
  customBackgroundUrl: string | null;
  imageMap: Record<string, string>;
  settings: unknown;
  aspectRatio: string;
  browserFrame: {
    mode: string;
    drawShadow: boolean;
    drawBorder: boolean;
  };
};

const getSplitterLambdaName = () => process.env.AWS_SPLITTER_FUNCTION_NAME || "";

const getAwsRegion = () => process.env.AWS_REGION || "us-east-1";

export async function invokeAwsSplitter(payload: SplitterPayload) {
  const functionName = getSplitterLambdaName();
  if (!functionName) {
    throw new Error("AWS_SPLITTER_FUNCTION_NAME is not configured");
  }

  const client = new LambdaClient({ region: getAwsRegion() });

  const command = new InvokeCommand({
    FunctionName: functionName,
    InvocationType: "Event",
    Payload: Buffer.from(JSON.stringify(payload)),
  });

  const response = await client.send(command);

  // Async invoke should return 202 when accepted.
  if (response.StatusCode && response.StatusCode >= 400) {
    throw new Error(`Splitter invoke failed with status ${response.StatusCode}`);
  }

  return {
    statusCode: response.StatusCode ?? 0,
    requestId: response.$metadata?.requestId ?? "",
  };
}
