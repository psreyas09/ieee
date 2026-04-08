DO $$
DECLARE
  target_table TEXT;
BEGIN
  IF to_regclass('public.opportunities') IS NOT NULL THEN
    target_table := 'opportunities';
  ELSIF to_regclass('public."Opportunity"') IS NOT NULL THEN
    target_table := 'Opportunity';
  ELSE
    RAISE EXCEPTION 'Neither opportunities nor "Opportunity" table exists';
  END IF;

  -- Ensure canonical_url exists before applying unique constraint.
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS canonical_url TEXT', target_table);

  -- Backfill canonical_url from url where missing.
  EXECUTE format(
    'UPDATE %I
     SET canonical_url = LOWER(REGEXP_REPLACE(SPLIT_PART(SPLIT_PART(TRIM(url), ''#'', 1), ''?'', 1), ''/+$'', ''''))
     WHERE canonical_url IS NULL
       AND url IS NOT NULL
       AND TRIM(url) <> ''''',
    target_table
  );

  -- Remove duplicates before adding the index (keeps the lexicographically smallest UUID per canonical URL).
  EXECUTE format(
    'WITH ranked AS (
       SELECT
         id,
         canonical_url,
         ROW_NUMBER() OVER (PARTITION BY canonical_url ORDER BY id) AS row_num
       FROM %I
       WHERE canonical_url IS NOT NULL
     )
     DELETE FROM %I o
     USING ranked r
     WHERE o.id = r.id
       AND r.row_num > 1',
    target_table,
    target_table
  );

  -- Required DB-level hard stop for dedup safety.
  EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS unique_opportunity ON %I (canonical_url)', target_table);
END $$;
