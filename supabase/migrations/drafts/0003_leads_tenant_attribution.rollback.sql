-- =============================================================================
-- ROLLBACK for DRAFT MIGRATION 0003 — leads tenant attribution  (UNAPPLIED)
-- =============================================================================
-- Removes the tenant SELECT policy, the FORCE flag, and the contractor_id column.
-- The backfill UPDATE is undone implicitly by dropping the column. The original
-- "anon insert only" policy was never modified, so nothing to restore there.
-- =============================================================================

BEGIN;

ALTER TABLE hardsaw.leads NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leads_tenant_read ON hardsaw.leads;

ALTER TABLE hardsaw.leads DROP COLUMN IF EXISTS contractor_id;

COMMIT;
