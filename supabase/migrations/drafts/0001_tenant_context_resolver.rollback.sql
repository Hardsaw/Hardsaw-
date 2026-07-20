-- =============================================================================
-- ROLLBACK for DRAFT MIGRATION 0001 — restore original resolver  (UNAPPLIED)
-- =============================================================================
-- Restores hardsaw.current_contractor_id() to its exact pre-0001 body (the
-- auth.uid()-only lookup) and drops the set_tenant_context() helper.
-- Safe to run whether or not any GUC was ever set.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION hardsaw.current_contractor_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SET search_path TO 'hardsaw', 'pg_catalog'
AS $function$
  SELECT id FROM hardsaw.contractors WHERE auth_user_id = auth.uid() LIMIT 1;
$function$;

DROP FUNCTION IF EXISTS hardsaw.set_tenant_context(uuid);

COMMIT;
