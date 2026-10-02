-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "batchSize" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "batchUnit" TEXT NOT NULL DEFAULT 'batch';
