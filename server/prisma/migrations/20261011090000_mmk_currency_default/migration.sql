-- Myanmar Kyat is the default document currency. Existing documents keep the currency they were created in.
ALTER TABLE "Quotation"  ALTER COLUMN "currency" SET DEFAULT 'MMK';
ALTER TABLE "Invoice"    ALTER COLUMN "currency" SET DEFAULT 'MMK';
ALTER TABLE "Contract"   ALTER COLUMN "currency" SET DEFAULT 'MMK';
ALTER TABLE "SalesOrder" ALTER COLUMN "currency" SET DEFAULT 'MMK';
