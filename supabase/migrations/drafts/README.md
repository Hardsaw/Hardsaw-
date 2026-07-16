# DRAFT migrations — multi-tenant RLS hardening (Phase 1)

**These files are UNAPPLIED drafts. They are intentionally placed in `drafts/` so they
are NOT part of the live `supabase/migrations` sequence and will not be picked up by
`supabase migration up` / `apply`.**

Nothing here has been run against the live database (`unddklhbrmqvyqagomtn`). See
`docs/multitenancy/PHASE1_PLAN.md` for the full rationale and the open questions that
must be answered before any of this is applied.

## Context (why these look small)
The per-tenant RLS foundation **already exists** in production: `hardsaw.contractors`
is the tenant table, `contractor_id` is the tenant key, `hardsaw.current_contractor_id()`
is the resolver, and `_tenant` policies are already deployed on the Layer-2 tables.
These drafts *complete and harden* that model; they do not rebuild it.

## Apply order (when a decision is made — NOT tonight)
1. `0001_tenant_context_resolver.sql`
2. `0002_force_rls_tenant_tables.sql`
3. `0003_leads_tenant_attribution.sql`
4. `0004_second_tenant_onboarding_template.sql`  ← template only, applied at real onboarding

Each `NNNN_*.sql` has a paired `NNNN_*.rollback.sql`.

## Recommended safe application path
Do **not** apply to prod directly. Use a Supabase **branch** (`create_branch`), apply
there, run `docs/multitenancy/VERIFICATION_PLAN.md`, then `merge_branch` only after
sign-off.

## Constant used in these drafts
`HARDSAW_CONTRACTOR_ID = ce43db8b-1bd1-44fd-aece-c4ad7c26efcd` (contractors row for
"Hardsaw Fence LLC"). This is already the id hardcoded in the frontend `saveJob()` and
in the deployed `anon_insert_jobs` policy — reused here for consistency, not invented.
