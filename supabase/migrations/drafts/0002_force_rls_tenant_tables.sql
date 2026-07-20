-- =============================================================================
-- DRAFT MIGRATION 0002 — FORCE ROW LEVEL SECURITY on Layer-2 tables  (UNAPPLIED)
-- =============================================================================
-- Purpose:
--   Close the "table owner bypasses RLS" hole. By default a table's OWNER role
--   is exempt from that table's RLS policies. FORCE ROW LEVEL SECURITY subjects
--   even the owner to the policies, so a stray query run as the owner cannot
--   silently read across tenants.
--
-- What this does NOT do:
--   * It does NOT affect roles with the BYPASSRLS attribute (notably
--     `service_role`). Edge functions using the service_role key still bypass
--     RLS. Constraining that path is a separate decision (PHASE1_PLAN.md §5),
--     not this migration.
--   * `anon` / `authenticated` are not owners, so they were already subject to
--     RLS; FORCE does not change their behavior.
--
-- Safety:
--   No runtime code path in the app runs DML as the table owner (browser = anon,
--   edge = service_role). So FORCE is expected to be behavior-neutral for the
--   live app while removing a latent cross-tenant footgun. Verify on a branch
--   first (VERIFICATION_PLAN.md).
--
-- Scope note: catalog tables (product_skus, manufacturers, product_lines,
--   vendor_product_mappings) are intentionally EXCLUDED — they are shared/public.
-- =============================================================================

BEGIN;

ALTER TABLE hardsaw.jobs                   FORCE ROW LEVEL SECURITY;
ALTER TABLE hardsaw.decision_results       FORCE ROW LEVEL SECURITY;
ALTER TABLE hardsaw.bom_lines              FORCE ROW LEVEL SECURITY;
ALTER TABLE hardsaw.readiness_reports      FORCE ROW LEVEL SECURITY;
ALTER TABLE hardsaw.issues                 FORCE ROW LEVEL SECURITY;
ALTER TABLE hardsaw.job_packets            FORCE ROW LEVEL SECURITY;
ALTER TABLE hardsaw.job_state_transitions  FORCE ROW LEVEL SECURITY;
ALTER TABLE hardsaw.checkpoints            FORCE ROW LEVEL SECURITY;
ALTER TABLE hardsaw.replay_bundles         FORCE ROW LEVEL SECURITY;
ALTER TABLE hardsaw.gaia_proof_packets     FORCE ROW LEVEL SECURITY;
ALTER TABLE hardsaw.clif_variances         FORCE ROW LEVEL SECURITY;
ALTER TABLE hardsaw.lifevault_events       FORCE ROW LEVEL SECURITY;
ALTER TABLE hardsaw.obs_traces             FORCE ROW LEVEL SECURITY;
-- leads is FORCE-enabled by migration 0003 after it gains a tenant column.

COMMIT;

-- Rollback: see 0002_force_rls_tenant_tables.rollback.sql
