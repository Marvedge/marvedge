-- Task-00133: Add WorkspaceConsent table for voice cloning and face tracking consent controls

-- CreateTable
CREATE TABLE IF NOT EXISTS "WorkspaceConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "voiceCloningConsent" BOOLEAN NOT NULL DEFAULT false,
    "faceTrackingConsent" BOOLEAN NOT NULL DEFAULT false,
    "voiceCloningConsentAt" TIMESTAMP(3),
    "faceTrackingConsentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceConsent_userId_key" ON "WorkspaceConsent"("userId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'WorkspaceConsent_userId_fkey'
    ) THEN
        ALTER TABLE "WorkspaceConsent" ADD CONSTRAINT "WorkspaceConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;