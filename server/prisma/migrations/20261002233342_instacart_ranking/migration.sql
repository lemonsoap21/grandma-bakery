-- AlterTable
ALTER TABLE "Price" ADD COLUMN     "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "origins" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "verified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "checkoutUrl" TEXT,
ADD COLUMN     "score" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "brand" TEXT,
ADD COLUMN     "countryCode" TEXT,
ADD COLUMN     "instacartRetailerKey" TEXT,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lon" DOUBLE PRECISION;
