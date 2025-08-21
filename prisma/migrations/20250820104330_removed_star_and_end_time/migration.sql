/*
  Warnings:

  - You are about to drop the column `endTime` on the `Demo` table. All the data in the column will be lost.
  - You are about to drop the column `startTime` on the `Demo` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Demo" DROP COLUMN "endTime",
DROP COLUMN "startTime";
