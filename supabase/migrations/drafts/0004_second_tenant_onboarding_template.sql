-- =============================================================================
-- DRAFT MIGRATION 0004 — Second-tenant onboarding TEMPLATE  (UNAPPLIED, GUARDED)
-- =============================================================================
-- This is a DOCUMENTED TEMPLATE, not a migration to run tonight. As written it
-- is INERT: the guard block does nothing until you fill in real values and flip
-- the ENABLE flag. It shows exactly how tenant #2 (the Hardsaw Assist AI pilot)
-- is created and, optionally, how its browser-side job-save path is authorized.
--
-- It intentionally creates NO tenant onboarding UI (out of scope) — it is the
-- SQL recipe a human or a future onboarding flow would run once per new tenant.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1 — create the tenant row (this is the whole "tenant model": a contractor)
-- -----------------------------------------------------------------------------
-- Fill in :new_tenant_name (and, if using auth Option A, :new_tenant_auth_user_id
-- from auth.users) then set v_enable := true.

DO $$
DECLARE
  v_enable            boolean := false;                 -- <== flip to true to run
  v_new_tenant_name   text    := 'REPLACE_ME Pilot Co'; -- <== tenant display name
  v_new_tenant_email  text    := NULL;                  -- optional
  v_new_auth_user_id  uuid    := NULL;                  -- Option A: link an auth.users id; else leave NULL
  v_new_id            uuid;
BEGIN
  IF NOT v_enable THEN
    RAISE NOTICE 'onboarding template is inert (v_enable=false); no rows created';
    RETURN;
  END IF;

  INSERT INTO hardsaw.contractors (id, display_name, email, auth_user_id, frozen)
  VALUES (gen_random_uuid(), v_new_tenant_name, v_new_tenant_email, v_new_auth_user_id, false)
  RETURNING id INTO v_new_id;

  RAISE NOTICE 'created tenant % (%). Use this id as the tenant/contractor_id.', v_new_tenant_name, v_new_id;

  -- Existing tenant data is untouched. A new tenant starts with zero rows in
  -- jobs/leads/etc., so there is nothing to backfill for tenant #2 — isolation
  -- is automatic because every _tenant policy filters on contractor_id.
END $$;

-- -----------------------------------------------------------------------------
-- STEP 2 (OPTIONAL, auth Option B only) — per-tenant anon job-insert policy
-- -----------------------------------------------------------------------------
-- The deployed `anon_insert_jobs` policy hardcodes Hardsaw's contractor_id in its
-- WITH CHECK. If tenant #2 also saves jobs from a browser using the anon key, add
-- a SEPARATE anon-insert policy scoped to its id. (Policies are OR'd together, so
-- Hardsaw's existing policy keeps working unchanged.)
--
-- SECURITY NOTE: this pattern only makes sense when each tenant's browser uses a
-- DISTINCT anon deployment/key you control; the anon key itself is public, so this
-- is a soft boundary. For a hard boundary, prefer auth Option A (authenticated
-- login) or route job-create through a trusted backend that sets tenant context.
--
--   CREATE POLICY anon_insert_jobs_tenant2 ON hardsaw.jobs
--     FOR INSERT TO anon
--     WITH CHECK (contractor_id = '<TENANT_2_UUID>'::uuid);
--
-- Rollback for STEP 2:  DROP POLICY IF EXISTS anon_insert_jobs_tenant2 ON hardsaw.jobs;

-- -----------------------------------------------------------------------------
-- ROLLBACK for STEP 1 (only if a tenant was created and has NO dependent rows):
--   DELETE FROM hardsaw.contractors WHERE id = '<TENANT_2_UUID>';
-- Do NOT delete a tenant that already owns jobs/leads/events — archive instead.
-- =============================================================================
