ALTER TYPE "NotificationType" ADD VALUE 'FOLLOW_UP_DUE';
ALTER TYPE "NotificationType" ADD VALUE 'INVOICE_DUE_SOON';
ALTER TYPE "NotificationType" ADD VALUE 'QUOTATION_EXPIRED';

ALTER TYPE "QuotationStatus" ADD VALUE 'EXPIRED';

ALTER TABLE "Lead" ADD COLUMN "nextFollowUpAt" TIMESTAMP(3);
ALTER TABLE "Quotation" ADD COLUMN "paymentTermId" UUID;
ALTER TABLE "Contract" ADD COLUMN "paymentTermId" UUID;
ALTER TABLE "SalesOrder" ADD COLUMN "paymentTermId" UUID;

CREATE INDEX "Lead_nextFollowUpAt_idx" ON "Lead"("nextFollowUpAt");

ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "PaymentTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "PaymentTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "PaymentTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "Quotation" q SET "paymentTermId" = c."paymentTermId" FROM "Customer" c WHERE c."id" = q."customerId";
UPDATE "Contract" k SET "paymentTermId" = q."paymentTermId" FROM "Quotation" q WHERE q."id" = k."quotationId";
UPDATE "SalesOrder" o SET "paymentTermId" = c."paymentTermId" FROM "Customer" c WHERE c."id" = o."customerId";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."code" IN ('target.manage', 'activity.read.all')
WHERE r."code" = 'DIRECTOR' AND r."isSystem"
ON CONFLICT DO NOTHING;
