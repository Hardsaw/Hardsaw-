-- =============================================================================
-- DRAFT MIGRATION 0003 — leads tenant attribution  (UNAPPLIED)
-- =============================================================================
-- Purpose:
--   `leads` holds customer PII (name/phone/email/address) but currently has NO
--   tenant key and NO tenant SELECT policy — only an anon-insert funnel. This is
--   the one genuine gap among the brief's candidate tables. Give leads a tenant
--   owner so a second tenant's leads are invisible to Hardsaw and vice versa,
--   WITHOUT breaking the public capture funnel.
--
-- Design decisions:
--   * contractor_id is NULLABLE. An anon client cannot be trusted to declare its
--     own tenant, so anon-captured leads land with contractor_id = NULL
--     ("unrouted intake"), to be claimed/stamped later by a tenant-aware backend
--     (see PHASE1_PLAN.md §7 Q2). Making it NOT NULL would break the anon funnel.
--   * The existing "anon insert only" policy is left UNTOUCHED, so lead capture
--     keeps working exactly as today.
--   * A tenant SELECT policy is added so authenticated/backend tenant context can
--     only read its own leads. Anon still has no SELECT grant at all.
--   * The single existing lead row is backfilled to Hardsaw.
-- =============================================================================

BEGIN;

-- 1) tenant key (nullable, FK to the tenant table)
ALTER TABLE hardsaw.leads
  ADD COLUMN IF NOT EXISTS contractor_id uuid REFERENCES hardsaw.contractors(id);

-- 2) backfill existing intake to the one real tenant (Hardsaw Fence LLC)
UPDATE hardsaw.leads
  SET contractor_id = 'ce43db8b-1bd1-44fd-aece-c4ad7c26efcd'
  WHERE contractor_id IS NULL;

-- 3) tenant read isolation. NULL contractor_id (unrouted intake) is NOT visible to
--    any tenant via this policy — only a service_role/back-office path sees NULLs.
CREATE POLICY leads_tenant_read ON hardsaw.leads
  FOR SELECT
  TO public
  USING (contractor_id = hardsaw.current_contractor_id());

-- 4) close owner-bypass on this table too (consistent with migration 0002)
ALTER TABLE hardsaw.leads FORCE ROW LEVEL SECURITY;

COMMIT;

-- NOTE (not changed here): to route NEW anon leads to a specific tenant, the
-- `lead-capture` edge function should stamp contractor_id server-side. That is a
-- Phase-2, in-scope change to the function and is intentionally NOT done tonight
-- (no function deploys per task scope).
--
-- Rollback: see 0003_leads_tenant_attribution.rollback.sql
