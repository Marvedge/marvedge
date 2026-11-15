-- Task 112: Add captionUrl and scoreJson fields to VideoJob
--
-- Both columns are NULLABLE with no backfill required.
-- captionUrl stores the reachable URL to the generated ASS subtitle artifact.
-- scoreJson stores the computed ClipScore (durationScore, bitrateScore, overlapScore).

ALTER TABLE "VideoJob" ADD COLUMN IF NOT EXISTS "captionUrl" VARCHAR(2048);
ALTER TABLE "VideoJob" ADD COLUMN IF NOT EXISTS "scoreJson" JSONB;

