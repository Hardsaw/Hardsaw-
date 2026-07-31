-- =============================================================================
-- DRAFT MIGRATION 0001 — Multi-source tenant resolver  (UNAPPLIED)
-- =============================================================================
-- Purpose:
--   Make hardsaw.current_contractor_id() resolve the current tenant from EITHER
--     (1) a request-scoped GUC set by a trusted backend  (edge fn / RPC), OR
--     (2) the existing authenticated-login path (auth.uid() -> contractors).
--   This keeps the SINGLE policy predicate `contractor_id = current_contractor_id()`
--   used by every deployed _tenant policy, so NO policy needs to change.
--
-- Safety / backward-compat:
--   * With neither source set (today's anon-key browser path) it returns NULL,
--     byte-identical to the current deployed behavior. Hardsaw is unaffected.
--   * The GUC is read with missing_ok=true and must be set transaction-locally
--     (set_config(..., is_local => true)) so it cannot leak across pooled
--     connections.
--
-- IMPORTANT operational caveat (see PHASE1_PLAN.md §5):
--   Setting the GUC does NOT re-enable RLS for a BYPASSRLS role (service_role).
--   To have RLS actually ENFORCE isolation on the server path, the backend must
--   run under a NON-BYPASSRLS role. This migration only makes the resolver
--   capable of honoring a per-request tenant; it does not change any role.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION hardsaw.current_contractor_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SET search_path TO 'hardsaw', 'pg_catalog'
AS $function$
  SELECT COALESCE(
    -- (1) trusted-backend path: edge function / RPC sets this per request
    NULLIF(current_setting('request.hardsaw.contractor_id', true), '')::uuid,
    -- (2) authenticated-login path: unchanged from the original deployed body
    (SELECT id FROM hardsaw.contractors WHERE auth_user_id = auth.uid() LIMIT 1)
  );
$function$;

-- Helper for trusted backends to stamp the request tenant. is_local => true means
-- the setting lives only for the current transaction.
CREATE OR REPLACE FUNCTION hardsaw.set_tenant_context(p_contractor_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SET search_path TO 'hardsaw', 'pg_catalog'
AS $function$
BEGIN
  PERFORM set_config('request.hardsaw.contractor_id',
                     COALESCE(p_contractor_id::text, ''),
                     true);  -- transaction-local
END;
$function$;

-- Keep execution grants conservative: only trusted backends should set context.
-- (Adjust to the runtime role chosen in PHASE1_PLAN.md §5 before applying.)
REVOKE ALL ON FUNCTION hardsaw.set_tenant_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hardsaw.set_tenant_context(uuid) TO service_role;

COMMIT;

-- Rollback: see 0001_tenant_context_resolver.rollback.sql
