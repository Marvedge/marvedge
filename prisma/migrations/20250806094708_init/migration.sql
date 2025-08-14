/*
  Warnings:

  - You are about to drop the column `segments` on the `Demo` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Demo" DROP COLUMN "segments",
ADD COLUMN     "editing" JSONB;
