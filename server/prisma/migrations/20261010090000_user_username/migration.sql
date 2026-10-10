ALTER TABLE "User" ADD COLUMN "username" TEXT;

WITH base AS (
  SELECT
    "id",
    COALESCE(NULLIF(TRIM(BOTH '._' FROM LEFT(REGEXP_REPLACE(LOWER(SPLIT_PART("email", '@', 1)), '[^a-z0-9._]', '', 'g'), 28)), ''), 'user') AS name,
    "createdAt"
  FROM "User"
),
ranked AS (
  SELECT "id", name, ROW_NUMBER() OVER (PARTITION BY name ORDER BY "createdAt", "id") AS n
  FROM base
)
UPDATE "User" u
SET "username" = CASE
  WHEN r.n = 1 AND LENGTH(r.name) >= 3 THEN r.name
  ELSE LEFT(r.name, 25) || '.' || LEFT(REPLACE(u."id"::text, '-', ''), 6)
END
FROM ranked r
WHERE u."id" = r."id";

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
