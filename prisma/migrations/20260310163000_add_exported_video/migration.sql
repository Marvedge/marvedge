-- CreateTable
CREATE TABLE "ExportedVideo" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "exportedUrl" TEXT NOT NULL,
    "shareableUrl" TEXT NOT NULL,
    "sourceVideoUrl" TEXT,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "demoId" TEXT,

    CONSTRAINT "ExportedVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExportedVideo_demoId_key" ON "ExportedVideo"("demoId");

-- CreateIndex
CREATE INDEX "ExportedVideo_userId_createdAt_idx" ON "ExportedVideo"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ExportedVideo" ADD CONSTRAINT "ExportedVideo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportedVideo" ADD CONSTRAINT "ExportedVideo_demoId_fkey" FOREIGN KEY ("demoId") REFERENCES "Demo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
