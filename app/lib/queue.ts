import { Queue } from "bullmq";
import connection from "./redis";

// Shared retry policy for all queues so failed jobs retry with backoff.
const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5000 },
  removeOnComplete: 200,
  removeOnFail: 1000,
};

export const videoQueue = new Queue("video-processing", {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connection: connection as any,
  defaultJobOptions,
});

export const subtitleQueue = new Queue("subtitle-processing", {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connection: connection as any,
  defaultJobOptions,
});

export const audioQueue = new Queue("audio-processing", {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connection: connection as any,
  defaultJobOptions,
});

export const reframeQueue = new Queue("reframe-processing", {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connection: connection as any,
});

export const dubbingQueue = new Queue("dubbing-processing", {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connection: connection as any,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 200,
    removeOnFail: 1000,
  },
});

export const reframeQueue = new Queue("reframe-processing", {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connection: connection as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

export const reframeJobQueue = reframeQueue;
