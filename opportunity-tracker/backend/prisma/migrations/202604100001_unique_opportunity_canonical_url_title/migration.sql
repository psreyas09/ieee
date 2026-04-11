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

  -- Replace URL-only uniqueness with URL+title uniqueness to support
  -- multiple opportunities listed on the same canonical page.
  EXECUTE 'DROP INDEX IF EXISTS unique_opportunity';

  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS unique_opportunity ON %I (canonical_url, title)',
    target_table
  );
END $$;
