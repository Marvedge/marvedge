// Fallback metadata contract for pipeline stages (Task-00082).
// ZERO Prisma/Postgres imports.

export type JobFallbackStage =
  | "SCENE_DETECTION"
  | "REFRAME"
  | "ACTIVE_SPEAKER"
  | "CAPTIONS"
  | "DUBBING";

export interface JobFallbackMetadata {
  fallback?: boolean;
  fallbackStage?: JobFallbackStage;
  fallbackReason?: string;
  attemptsMade?: number;
}
