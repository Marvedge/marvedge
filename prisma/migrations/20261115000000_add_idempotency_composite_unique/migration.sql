-- AlterTable
ALTER TABLE "VideoJob" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "VideoJob" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;

-- DropIndex
DROP INDEX IF EXISTS "VideoJob_idempotencyKey_key";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "VideoJob_userId_idempotencyKey_key" ON "VideoJob"("userId", "idempotencyKey");