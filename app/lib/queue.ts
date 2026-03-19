import { Queue } from "bullmq";
import connection from "./redis";

export const videoQueue = new Queue("video-processing", {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connection: connection as any,
});

export const subtitleQueue = new Queue("subtitle-processing", {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connection: connection as any,
});
