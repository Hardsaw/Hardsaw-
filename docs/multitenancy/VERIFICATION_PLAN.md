# Phase 1 — Verification Plan (sketch; NOT executed against prod)

**Goal:** prove, after the draft migrations are applied, that
1. **(No regression)** Hardsaw's existing data and queries behave exactly as before.
2. **(Isolation)** A hypothetical second tenant's data is invisible to Hardsaw's
   queries, and Hardsaw's data is invisible to the second tenant.

**None of the below has been run against production.** It is written to run on a
**Supabase branch** (`create_branch`) that clones prod, so real Hardsaw data is never
at risk. Constants:
`HARDSAW = ce43db8b-1bd1-44fd-aece-c4ad7c26efcd`; `TENANT2 = <uuid created in test>`.

---

## Why a role matters (read first)
RLS is only meaningful when queries run under a role that is subject to it. The MCP
`execute_sql` path and edge functions use `service_role`, which **bypasses RLS** —
running the checks there would falsely show "no isolation." Every isolation assertion
below must run under a **non-BYPASSRLS role** with tenant context set. In a branch, do
this by `SET ROLE authenticated;` (or a dedicated `tenant_runtime` role) and setting
the tenant GUC, all inside one transaction:

```sql
BEGIN;
  SET LOCAL ROLE authenticated;                                   -- non-bypass role
  SELECT hardsaw.set_tenant_context('<TENANT_UUID>'::uuid);       -- from migration 0001
  -- ... assertions ...
ROLLBACK;   -- read-only checks; never commit the test session
```

---

## Phase A — Pre-migration baseline (capture BEFORE applying anything)
Run as service_role (ground truth, RLS-independent) and save the numbers:

```sql
SELECT
  (SELECT count(*) FROM hardsaw.jobs)              AS jobs_total,              -- expect 22
  (SELECT count(*) FROM hardsaw.jobs
     WHERE contractor_id = 'ce43db8b-1bd1-44fd-aece-c4ad7c26efcd') AS jobs_hardsaw, -- 22
  (SELECT count(*) FROM hardsaw.decision_results)  AS dr_total,               -- 0
  (SELECT count(*) FROM hardsaw.lifevault_events)  AS lve_total,              -- 282
  (SELECT count(*) FROM hardsaw.leads)             AS leads_total;            -- 1

-- snapshot the resolver body + policy list so we can diff after:
SELECT pg_get_functiondef('hardsaw.current_contractor_id'::regproc);
SELECT tablename, policyname, cmd FROM pg_policies
 WHERE schemaname='hardsaw' ORDER BY 1,2;
```

## Phase B — Apply drafts on the branch
Apply `0001`, `0002`, `0003` (in order). Do **not** apply `0004` (template).

---

## Test 1 — No regression for Hardsaw (structure + data intact)

**1a. Resolver still returns NULL on the legacy anon path (unchanged behavior).**
```sql
BEGIN;
  SET LOCAL ROLE anon;
  -- no GUC set, anon has no auth.uid(): must be NULL, exactly like pre-0001
  SELECT hardsaw.current_contractor_id() IS NULL AS resolver_null_for_anon;  -- expect TRUE
ROLLBACK;
```

**1b. Hardsaw sees all 22 of its jobs when its tenant context is set.**
```sql
BEGIN;
  SET LOCAL ROLE authenticated;
  SELECT hardsaw.set_tenant_context('ce43db8b-1bd1-44fd-aece-c4ad7c26efcd');
  SELECT count(*) AS hardsaw_visible_jobs FROM hardsaw.jobs;                  -- expect 22
  SELECT count(*) AS hardsaw_visible_leads FROM hardsaw.leads;               -- expect 1 (backfilled)
  -- child tables resolve via join to jobs; with 0 rows today they stay 0, but
  -- the query must not error:
  SELECT count(*) FROM hardsaw.decision_results;                             -- expect 0
  SELECT count(*) FROM hardsaw.bom_lines;                                    -- expect 0
ROLLBACK;
```

**1c. The anon job-save funnel still works (the deployed path saveJob() uses).**
```sql
BEGIN;
  SET LOCAL ROLE anon;
  -- mirrors the browser POST /rest/v1/jobs with Content-Profile: hardsaw
  INSERT INTO hardsaw.jobs (id, contractor_id, intent_id, trace_id, state,
                            canonical_spec, ruleset_version, vendor_profile_version,
                            core_engine_version)
  VALUES (gen_random_uuid(), 'ce43db8b-1bd1-44fd-aece-c4ad7c26efcd',
          'VERIFY_TEST', 'verifyte', 'PACKETS_READY', '{}'::jsonb,'x','x','x');
  -- expect: SUCCESS (anon_insert_jobs WITH CHECK passes for the Hardsaw id)
ROLLBACK;
```

**1d. The anon lead-capture funnel still works.**
```sql
BEGIN;
  SET LOCAL ROLE anon;
  INSERT INTO hardsaw.leads (id, name, phone) VALUES (gen_random_uuid(), 'Verify Tester', '5551234567');
  -- expect: SUCCESS (existing "anon insert only" policy unchanged; contractor_id
  -- left NULL = unrouted intake)
ROLLBACK;
```

**1e. Policy/predicate diff is empty except the intended additions.**
Compare Phase-A policy snapshot to post-migration: the only new rows should be
`leads.leads_tenant_read`; every existing `_tenant` policy predicate is byte-identical.

**Pass criteria for Test 1:** 1a TRUE, 1b = (22, 1, 0, 0), 1c & 1d succeed, 1e shows
only the intended delta.

---

## Test 2 — Cross-tenant isolation (the core proof)

Seed a second tenant and one job for each tenant on the branch:
```sql
-- as service_role (setup only)
INSERT INTO hardsaw.contractors (id, display_name, frozen)
VALUES ('22222222-2222-2222-2222-222222222222', 'Verify Pilot Co', false);  -- TENANT2 (illustrative uuid)

INSERT INTO hardsaw.jobs (id, contractor_id, intent_id, trace_id, state, canonical_spec,
                          ruleset_version, vendor_profile_version, core_engine_version)
VALUES (gen_random_uuid(), '22222222-2222-2222-2222-222222222222',
        'T2_JOB', 't2job000', 'PACKETS_READY', '{}'::jsonb, 'x','x','x');

INSERT INTO hardsaw.leads (id, name, phone, contractor_id)
VALUES (gen_random_uuid(), 'T2 Customer', '5559990000', '22222222-2222-2222-2222-222222222222');
```

**2a. Hardsaw context cannot see tenant-2 rows.**
```sql
BEGIN;
  SET LOCAL ROLE authenticated;
  SELECT hardsaw.set_tenant_context('ce43db8b-1bd1-44fd-aece-c4ad7c26efcd');
  SELECT count(*) FROM hardsaw.jobs
    WHERE contractor_id = '22222222-2222-2222-2222-222222222222';            -- expect 0
  SELECT count(*) FROM hardsaw.leads  WHERE name = 'T2 Customer';           -- expect 0
  SELECT count(*) FROM hardsaw.jobs;                                        -- expect 22 (+ any 1c/1d NOT committed) = 22
ROLLBACK;
```

**2b. Tenant-2 context cannot see Hardsaw rows.**
```sql
BEGIN;
  SET LOCAL ROLE authenticated;
  SELECT hardsaw.set_tenant_context('22222222-2222-2222-2222-222222222222');
  SELECT count(*) FROM hardsaw.jobs;                                        -- expect 1 (only T2_JOB)
  SELECT count(*) FROM hardsaw.jobs
    WHERE contractor_id = 'ce43db8b-1bd1-44fd-aece-c4ad7c26efcd';            -- expect 0
  SELECT count(*) FROM hardsaw.leads;                                       -- expect 1 (only T2 Customer)
ROLLBACK;
```

**2c. Tenant-2 cannot WRITE as Hardsaw (WITH CHECK enforcement).**
```sql
BEGIN;
  SET LOCAL ROLE authenticated;
  SELECT hardsaw.set_tenant_context('22222222-2222-2222-2222-222222222222');
  -- attempt to insert a job owned by Hardsaw while in tenant-2 context:
  INSERT INTO hardsaw.jobs (id, contractor_id, intent_id, trace_id, state, canonical_spec,
                            ruleset_version, vendor_profile_version, core_engine_version)
  VALUES (gen_random_uuid(), 'ce43db8b-1bd1-44fd-aece-c4ad7c26efcd',
          'SPOOF', 'spoof000', 'PACKETS_READY', '{}'::jsonb,'x','x','x');
  -- expect: ERROR — new row violates row-level security policy (jobs_tenant WITH CHECK)
ROLLBACK;
```

**2d. Child-table isolation via join (populate then check).** Insert a
`decision_results` + `bom_lines` row under each tenant's job (as service_role), then
repeat 2a/2b for those tables — Hardsaw context must see only rows whose
`job_id → jobs.contractor_id = HARDSAW`, and vice versa. Expected: each tenant sees
only its own decision_results/bom_lines/readiness_reports.

**2e. FORCE-RLS closes owner bypass.** Confirm that even connecting as the table owner
role (not service_role) with no tenant context returns 0 rows from `hardsaw.jobs`
after `0002`:
```sql
BEGIN;
  SET LOCAL ROLE <table_owner_role>;   -- e.g. the migration/owner role, NOT service_role
  SELECT count(*) FROM hardsaw.jobs;   -- expect 0 (owner now subject to RLS, no context)
ROLLBACK;
```

**Pass criteria for Test 2:** 2a = 0/0/22, 2b = 1/0/1, 2c raises an RLS error, 2d each
tenant sees only its own children, 2e = 0.

---

## Test 3 — service_role bypass is understood, not a surprise
Document (not a failure) that as `service_role` all counts are global regardless of
context — this is expected and is exactly why the second-tenant auth decision
(PHASE1_PLAN.md §5, Option A vs B) matters. If Option B is chosen, re-run Test 2 under
the actual non-BYPASSRLS runtime role the edge functions will use, to prove the server
path enforces isolation too.

```sql
-- expectation-setting, not a pass/fail gate:
SET LOCAL ROLE service_role;
SELECT count(*) FROM hardsaw.jobs;   -- returns ALL tenants' jobs (bypass) — by design
RESET ROLE;
```

---

## Test 4 — Application-level smoke (post-branch, before any prod apply)
Point a scratch copy of the frontend at the branch URL and exercise the two real
browser paths end-to-end:
- `saveJob()` → `POST /rest/v1/jobs` with the anon key → still returns 201.
- `jilly_form.html` → `functions/v1/lead-capture` (unchanged; still service_role) →
  still returns success; confirm the new `leads.contractor_id` column is present and
  the insert does not error on the added column.
- `bom-calc` calls are pure compute → unaffected; spot-check one quote hash is
  identical to a pre-migration run of the same input.

---

## Rollback verification
After running each rollback file, re-run Phase A. The resolver body, policy list, and
`leads` columns must return to their exact Phase-A snapshot (0001/0002/0003 fully
reversible). Then `delete_branch` to discard the test branch.

## Sign-off gate before touching prod
All of Test 1 and Test 2 pass on a branch, Test 4 smoke is green, rollbacks verified,
AND the Option A/B auth decision (PHASE1_PLAN.md §7 Q1) is made — only then schedule a
prod apply via a fresh branch → `merge_branch`.
