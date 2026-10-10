-- Atomic, concurrency-safe document numbering for quotations and invoices.
CREATE SEQUENCE IF NOT EXISTS "quotation_number_seq" START 1000;
CREATE SEQUENCE IF NOT EXISTS "invoice_number_seq" START 1000;
