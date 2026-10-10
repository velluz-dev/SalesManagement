-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('DEALER', 'RETAILER', 'CORPORATE', 'OTHER');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'KPAY';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "paymentTermId" UUID,
ADD COLUMN     "type" "CustomerType" NOT NULL DEFAULT 'OTHER';


-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "paymentTermId" UUID,
ADD COLUMN     "salesOrderId" UUID;

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "productId" UUID;

-- AlterTable
ALTER TABLE "QuotationItem" ADD COLUMN     "productId" UUID;

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'unit',
    "category" TEXT,
    "description" TEXT,
    "listPrice" DECIMAL(14,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTerm" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "quotationId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "value" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "status" "ContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "terms" TEXT,
    "documentUrl" TEXT,
    "cancelReason" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "contractId" UUID,
    "quotationId" UUID,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'PENDING',
    "orderDate" DATE NOT NULL,
    "deliveryDate" DATE,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "confirmedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderItem" (
    "id" UUID NOT NULL,
    "salesOrderId" UUID NOT NULL,
    "productId" UUID,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,

    CONSTRAINT "SalesOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTerm_name_key" ON "PaymentTerm"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_number_key" ON "Contract"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_quotationId_key" ON "Contract"("quotationId");

-- CreateIndex
CREATE INDEX "Contract_ownerId_idx" ON "Contract"("ownerId");

-- CreateIndex
CREATE INDEX "Contract_customerId_idx" ON "Contract"("customerId");

-- CreateIndex
CREATE INDEX "Contract_status_idx" ON "Contract"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_number_key" ON "SalesOrder"("number");

-- CreateIndex
CREATE INDEX "SalesOrder_ownerId_idx" ON "SalesOrder"("ownerId");

-- CreateIndex
CREATE INDEX "SalesOrder_customerId_idx" ON "SalesOrder"("customerId");

-- CreateIndex
CREATE INDEX "SalesOrder_contractId_idx" ON "SalesOrder"("contractId");

-- CreateIndex
CREATE INDEX "SalesOrder_status_idx" ON "SalesOrder"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrderItem_salesOrderId_position_key" ON "SalesOrderItem"("salesOrderId", "position");

-- CreateIndex
CREATE INDEX "Customer_paymentTermId_idx" ON "Customer"("paymentTermId");

-- CreateIndex
CREATE INDEX "Invoice_salesOrderId_idx" ON "Invoice"("salesOrderId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "PaymentTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "PaymentTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ───────────── Data migration: per-customer payment days → PaymentTerm master ─────────────
-- Standard terms, then one "Net N" term for any other day count already in use.
INSERT INTO "PaymentTerm" ("id", "name", "days", "updatedAt") VALUES
  (gen_random_uuid(), 'COD', 0, NOW()),
  (gen_random_uuid(), 'Net 15', 15, NOW()),
  (gen_random_uuid(), 'Net 30', 30, NOW()),
  (gen_random_uuid(), 'Net 45', 45, NOW()),
  (gen_random_uuid(), 'Net 60', 60, NOW());

INSERT INTO "PaymentTerm" ("id", "name", "days", "updatedAt")
SELECT gen_random_uuid(), 'Net ' || d.days, d.days, NOW()
FROM (SELECT DISTINCT "paymentTermsDays" AS days FROM "CustomerCredit") d
WHERE d.days NOT IN (0, 15, 30, 45, 60);

UPDATE "Customer" c
SET "paymentTermId" = t."id"
FROM "CustomerCredit" cc
JOIN "PaymentTerm" t ON t."days" = cc."paymentTermsDays" AND (t."name" = 'Net ' || cc."paymentTermsDays" OR (cc."paymentTermsDays" = 0 AND t."name" = 'COD'))
WHERE cc."customerId" = c."id";

-- AlterTable (after the data has been moved)
ALTER TABLE "CustomerCredit" DROP COLUMN "paymentTermsDays";

-- ───────────── Integrity constraints ─────────────
ALTER TABLE "Product"        ADD CONSTRAINT "Product_listPrice_nonneg" CHECK ("listPrice" >= 0);
ALTER TABLE "PaymentTerm"    ADD CONSTRAINT "PaymentTerm_days_range" CHECK ("days" BETWEEN 0 AND 365);
ALTER TABLE "Contract"       ADD CONSTRAINT "Contract_value_nonneg" CHECK ("value" >= 0);
ALTER TABLE "Contract"       ADD CONSTRAINT "Contract_dates" CHECK ("endDate" IS NULL OR "endDate" >= "startDate");
ALTER TABLE "SalesOrder"     ADD CONSTRAINT "SalesOrder_totals_nonneg" CHECK ("subtotal" >= 0 AND "discountTotal" >= 0 AND "taxTotal" >= 0 AND "total" >= 0);
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_values" CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "discountPercent" BETWEEN 0 AND 100 AND "taxRate" BETWEEN 0 AND 100);

-- An order or quotation is invoiced at most once (cancelled invoices excepted).
CREATE UNIQUE INDEX "Invoice_one_active_per_order" ON "Invoice" ("salesOrderId") WHERE "salesOrderId" IS NOT NULL AND "status" <> 'CANCELLED';

-- Concurrency-safe document numbering.
CREATE SEQUENCE IF NOT EXISTS "contract_number_seq" START 1000;
CREATE SEQUENCE IF NOT EXISTS "sales_order_number_seq" START 1000;
