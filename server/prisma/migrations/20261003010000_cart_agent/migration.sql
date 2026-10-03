-- AlterTable
ALTER TABLE "Price" ADD COLUMN     "packagePrice" DOUBLE PRECISION,
ADD COLUMN     "packageSize" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "cartRunId" INTEGER,
ADD COLUMN     "packageInfo" TEXT,
ADD COLUMN     "packages" INTEGER,
ADD COLUMN     "productUrl" TEXT;

-- CreateTable
CREATE TABLE "CartRun" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "summary" TEXT NOT NULL DEFAULT '',
    "items" JSONB,
    "cartUrl" TEXT,
    "cartTotal" DOUBLE PRECISION,
    "screenshot" TEXT,
    "steps" INTEGER NOT NULL DEFAULT 0,
    "confirmationId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "orderedAt" TIMESTAMP(3),

    CONSTRAINT "CartRun_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_cartRunId_fkey" FOREIGN KEY ("cartRunId") REFERENCES "CartRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartRun" ADD CONSTRAINT "CartRun_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
