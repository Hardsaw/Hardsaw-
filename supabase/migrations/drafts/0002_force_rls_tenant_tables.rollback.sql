-- =============================================================================
-- ROLLBACK for DRAFT MIGRATION 0002 — remove FORCE ROW LEVEL SECURITY (UNAPPLIED)
-- =============================================================================
-- Returns each table to NO FORCE (RLS remains ENABLED; only the owner-exemption
-- is restored to the pre-0002 default).
-- =============================================================================

BEGIN;

ALTER TABLE hardsaw.jobs                   NO FORCE ROW LEVEL SECURITY;
ALTER TABLE hardsaw.decision_results       NO FORCE ROW LEVEL SECURITY;
ALTER TABLE hardsaw.bom_lines              NO FORCE ROW LEVEL SECURITY;
ALTER TABLE hardsaw.readiness_reports      NO FORCE ROW LEVEL SECURITY;
ALTER TABLE hardsaw.issues                 NO FORCE ROW LEVEL SECURITY;
ALTER TABLE hardsaw.job_packets            NO FORCE ROW LEVEL SECURITY;
ALTER TABLE hardsaw.job_state_transitions  NO FORCE ROW LEVEL SECURITY;
ALTER TABLE hardsaw.checkpoints            NO FORCE ROW LEVEL SECURITY;
ALTER TABLE hardsaw.replay_bundles         NO FORCE ROW LEVEL SECURITY;
ALTER TABLE hardsaw.gaia_proof_packets     NO FORCE ROW LEVEL SECURITY;
ALTER TABLE hardsaw.clif_variances         NO FORCE ROW LEVEL SECURITY;
ALTER TABLE hardsaw.lifevault_events       NO FORCE ROW LEVEL SECURITY;
ALTER TABLE hardsaw.obs_traces             NO FORCE ROW LEVEL SECURITY;

COMMIT;
