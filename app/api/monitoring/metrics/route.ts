import { dubbingQueue, reframeQueue } from "../../../lib/queue";
import { collectQueueMetrics } from "../../../lib/monitoring/queueMetrics";
import { metricsRegistry } from "../../../lib/monitoring/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await collectQueueMetrics({
      reframe: reframeQueue,
      dubbing: dubbingQueue,
    });
  } catch (error) {
    console.error("[monitoring] Queue metrics collection failed:", error);
  }

  try {
    const body = await metricsRegistry.metrics();
    return new Response(body, {
      headers: {
        "Content-Type": metricsRegistry.contentType,
      },
    });
  } catch (error) {
    console.error("[monitoring] Metrics serialization failed:", error);
    return new Response("Unable to serialize metrics", {
      status: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
}
