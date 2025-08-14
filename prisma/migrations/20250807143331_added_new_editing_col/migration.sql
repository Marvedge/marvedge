/*
  Warnings:

  - Added the required column `editing` to the `Demo` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Demo" ADD COLUMN     "editing" JSONB NOT NULL;
