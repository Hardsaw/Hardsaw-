# Phase 1 — Multi-Tenant RLS Foundation: Written Plan

**Status:** Planning + draft (unapplied) migrations only. Nothing in this document has
been applied to the live database. No functions deployed. No push/merge.
**Author:** Claude Code session (branch `claude/sharp-maxwell-k0zosv`)
**Date:** 2026-07-16
**Project:** `unddklhbrmqvyqagomtn` ("Hardsaw's Project"), schema `hardsaw`

---

## 0. TL;DR — the single most important finding

**The per-tenant RLS foundation this task asks us to "build" already exists and is
deployed.** Before writing a line of new SQL I inspected the live database, and the
core of what the brief describes is already in production:

- A tenant table already exists: **`hardsaw.contractors`** (1 row today = *Hardsaw
  Fence LLC*, `id = ce43db8b-1bd1-44fd-aece-c4ad7c26efcd`).
- A tenant key already threads through the operational tables: **`contractor_id`**.
- A resolver function already exists: **`hardsaw.current_contractor_id()`**.
- Tenant-scoped RLS policies already exist on **jobs, decision_results, bom_lines,
  readiness_reports, issues, job_packets, job_state_transitions, checkpoints,
  replay_bundles, gaia_proof_packets, clif_variances, lifevault_events, obs_traces**
  — all keyed off `contractor_id = hardsaw.current_contractor_id()`.
- Existing data is **already backfilled**: all 22 `jobs` and all 282
  `lifevault_events` carry the Hardsaw `contractor_id` with **zero nulls**.

So this is **not** a greenfield "add a `tenants` table + `tenant_id` columns" job.
Doing that literally would *fork* the identity model, collide with the deployed
`contractor_id` policies, and break every existing edge function. The correct Phase-1
work is to **complete and harden the tenant model that already exists** so that a
*second* tenant (the Hardsaw Assist AI pilot) is provably isolated. That is what the
draft migrations in `supabase/migrations/drafts/` do.

The brief itself pre-authorized this reframing: *"confirm or challenge this list …
don't just assume,"* and *"design something that fits the existing auth reality rather
than inventing a parallel auth system."* This plan follows that instruction.

---

## 1. The two-layer principle, mapped to the live schema

The brief defines two layers. Here is how each maps to what is actually in the DB:

### Layer 1 — Universal / shared / never tenant-scoped (do not touch)
- **bom-calc formulas / geometry / FAM + ST registries** — live entirely in
  `supabase/functions/bom-calc/index.ts` as pure code (no DB rows). Untouched.
- **Public catalog data** — `product_skus` (164 rows), `manufacturers` (10),
  `product_lines` (20), `vendor_product_mappings` (12). These are shared reference
  data. **Out of scope per the brief; left exactly as-is.**
- **System/enum tables** — `case_states`, `severity_weights`, `trust_thresholds`,
  `lifevault_event_types`, `checkpoint_stages`, etc. Global config, not tenant data.

### Layer 2 — Tenant-isolated, must never cross tenants (needs real RLS)
Pricing, wholesaler relationships, job history, customer data, material preferences.
In the live schema these are: `jobs`, `decision_results`, `bom_lines`,
`readiness_reports`, `issues`, `job_packets`, `job_state_transitions`, `checkpoints`,
`replay_bundles`, `gaia_proof_packets`, `clif_variances`, `lifevault_events`,
`obs_traces`, `obs_events`, `t2_measurements`, `shield_signals`,
`behavioral_baselines`, `luna_actions`, `luna_freeze_events`, and **`leads`**
(customer PII).

Almost all of these are **already** RLS-scoped to `contractor_id`. The gaps are
enumerated in §4.

---

## 2. (a) Which tables need a tenant key — confirm/challenge the candidate list

The brief proposed: `jobs, decision_results, bom_lines, readiness_reports, leads`,
and *"likely NOT product_skus, manufacturers, vendor_product_mappings."*

**Verdict on the "likely NOT" list: CONFIRMED.** `product_skus`, `manufacturers`,
`product_lines`, and `vendor_product_mappings` are shared catalog data under the SKU
doctrine. They must stay global. (Note: their read exposure is inconsistent today —
`manufacturers`, `product_lines`, `vendor_product_mappings` grant `anon` SELECT, but
`product_skus` is currently **service-role-only**, i.e. not anon-readable. The
frontend reads SKUs indirectly through the `bom-calc` edge function, so nothing is
broken. This inconsistency is noted but **explicitly out of scope** to change.)

**Verdict on the candidate list: CHALLENGED / already satisfied, with one real gap.**

| Table | Needs tenant key? | Reality in live DB |
|---|---|---|
| `jobs` | Yes | ✅ Already has `contractor_id` (NOT NULL) + `jobs_tenant` policy. Backfilled (22/22 Hardsaw). |
| `decision_results` | Yes (indirect) | ✅ No own column — scoped **via `job_id → jobs.contractor_id`** by `decision_results_tenant`. Correct design; a direct column would be denormalized. |
| `bom_lines` | Yes (indirect) | ✅ Scoped **via `decision_result_id → decision_results → jobs`** by `bom_lines_tenant`. Correct. |
| `readiness_reports` | Yes (indirect) | ✅ Scoped **via `job_id → jobs`** by `readiness_reports_tenant`. Correct. |
| `leads` | Yes — customer PII | ❌ **GAP.** No `contractor_id`, no tenant SELECT policy. Only an anon-insert funnel. This is the one candidate that genuinely needs work → migration `0003`. |

**Design principle applied:** child tables (`decision_results`, `bom_lines`,
`readiness_reports`, `issues`, `job_packets`, …) are scoped **by joining up to
`jobs.contractor_id`, not by carrying their own `contractor_id`.** This is already how
the deployed policies work and it is the right call — it prevents the tenant key on a
child row from ever drifting out of sync with its parent job. We keep that pattern; we
do **not** add redundant `tenant_id`/`contractor_id` columns to child tables.

**Additional Layer-2 tables already scoped** (beyond the candidate list), confirmed
present with `_tenant` policies: `clif_variances`, `lifevault_events`, `obs_traces`,
`checkpoints`, `replay_bundles`, `gaia_proof_packets`, `job_state_transitions`.

**Layer-2 tables that are RLS-enabled but whose policy coverage should be audited in
Phase 2** (not changed tonight): `obs_events`, `t2_measurements`, `shield_signals`,
`behavioral_baselines`, `luna_actions`, `luna_freeze_events`. Flagged, not touched.

---

## 3. (b) Tenant model design — do we need a `tenants` table? How does backfill work?

**Do we need a new `tenants` table? No.** `hardsaw.contractors` already *is* the tenant
anchor:

```
hardsaw.contractors(
  id uuid PK,              -- the tenant id
  auth_user_id uuid,       -- optional link to a Supabase Auth user
  display_name text,       -- e.g. "Hardsaw Fence LLC"
  email text,
  luna_token_scope text,
  frozen boolean, frozen_reason text,
  created_at, updated_at
)
```

Introducing a separate `tenants(id, name, created_at)` table would create **two**
competing notions of "who owns this row" (`tenant_id` vs the existing `contractor_id`),
requiring us to rewrite ~14 deployed policies, the resolver function, the anon-insert
policy, and every edge function. That is a large, risky, backward-incompatible change
for zero functional gain. **Recommendation: treat `contractors` as the tenant table.**
If a human-friendly "tenant" vocabulary is desired later, add a view
`hardsaw.tenants` that simply selects from `contractors` — cosmetic, non-breaking.
(Not included tonight to keep the surface minimal.)

**Default/backfill row — already exists.** The "one real tenant that exists today"
already has its row: `contractors.id = ce43db8b-1bd1-44fd-aece-c4ad7c26efcd`
("Hardsaw Fence LLC", created 2026-05-25).

**Is existing Hardsaw data already assigned? Yes.** Verified live:
`jobs`: 22 rows, 0 null `contractor_id`, 1 distinct contractor (Hardsaw).
`lifevault_events`: 282 rows, 0 null, 1 distinct. The only Layer-2 table missing a
tenant key is `leads` (1 row) — migration `0003` adds the column and backfills that
single row to Hardsaw. **So "nothing breaks for the one real tenant" is already true
for the operational tables; the migrations only close the `leads` gap and harden the
enforcement path.**

**How a second tenant (Assist AI pilot) gets created:** insert a second
`contractors` row and (depending on the auth decision in §5) optionally link an
`auth_user_id`. A guarded, non-destructive template for this is provided as draft
migration `0004`. It creates *no* data until explicitly filled in — it is a documented
onboarding recipe, not an onboarding UI (which is out of scope).

---

## 4. Gap analysis — what is actually missing for *real* two-tenant isolation

The structural RLS exists, but three things stand between "structure exists" and
"a second tenant is provably isolated in production":

1. **The resolver is inert for the app's real auth.** `current_contractor_id()` is
   `SELECT id FROM contractors WHERE auth_user_id = auth.uid()`. But:
   - the browser talks to the DB with the **anon publishable key** → `auth.uid()` is
     NULL → resolver returns NULL;
   - the Hardsaw contractor row has **no `auth_user_id`** linked anyway;
   - edge functions use the **service_role key**, which has `BYPASSRLS` → policies are
     not evaluated at all on the server path.

   Net effect today: the `_tenant` policies neither help nor hurt Hardsaw (anon can't
   read through them; service_role bypasses them). They are a *dormant safety rail*.
   For a second tenant to be isolated, the resolver must actually resolve a tenant on
   whatever path that tenant's traffic uses. → **migration `0001`** makes the resolver
   also honor a request-scoped GUC that a trusted backend sets per request, *without*
   removing the existing `auth.uid()` path. This is the "fit the existing auth reality"
   choice discussed in §5.

2. **The anon `jobs` INSERT hardcodes Hardsaw.** Policy `anon_insert_jobs` has
   `WITH CHECK (contractor_id = 'ce43db8b-…'::uuid)`. This is a single-tenant seam: it
   lets the browser save jobs *only* as Hardsaw. A second tenant's browser using the
   same anon key would write as Hardsaw. → addressed as a documented decision in §5
   and a policy template in `0004` (kept non-breaking for Hardsaw tonight).

3. **Owner-bypass is open.** No Layer-2 table has `FORCE ROW LEVEL SECURITY`, so the
   table-owner role bypasses RLS. → **migration `0002`** adds `FORCE` on the tenant
   tables (belt-and-suspenders; does **not** affect the `service_role`/`BYPASSRLS`
   path, which is a separate decision in §5).

---

## 5. (c) RLS pattern design — fitting the *actual* auth, not `app.tenant_id`

**What I checked first (as instructed).** The brief floated
`tenant_id = current_setting('app.tenant_id')::uuid`. Before adopting it I traced how
each caller actually authenticates:

| Caller | Key / role | RLS effect |
|---|---|---|
| Browser `saveJob()` → `POST /rest/v1/jobs` | **anon** publishable key, `Content-Profile: hardsaw` | RLS enforced as role `anon`; `auth.uid()` = NULL |
| Browser → `functions/v1/{bom-calc,assist,vault,vision-parse}` | anon key in `Authorization` | function runs server-side |
| `jilly_form.html` → `functions/v1/lead-capture` | anon key | function runs server-side |
| Edge functions (bom-calc, lead-capture, vault, assist…) | **service_role** key | **`BYPASSRLS` — policies skipped** |

Findings that shape the design:

- There is **no Supabase Auth end-user login** anywhere in the app today. The
  `auth.uid()`-based resolver has nothing to resolve for real traffic.
- The naive `current_setting('app.tenant_id')` pattern would be **worse than what
  exists**: (a) nothing currently sets such a GUC; (b) under the anon key the client
  could try to set it and spoof a tenant; (c) under service_role the GUC is irrelevant
  because RLS is bypassed regardless. Adopting it as-is would be "inventing a parallel
  auth system" — exactly what the brief warns against.

**Chosen pattern: keep `contractor_id = hardsaw.current_contractor_id()` as the single
policy predicate everywhere (already deployed), and make the *resolver* multi-source
so it fits both the present and the near future:**

```sql
-- migration 0001 (draft)
CREATE OR REPLACE FUNCTION hardsaw.current_contractor_id() RETURNS uuid
LANGUAGE sql STABLE SET search_path TO 'hardsaw','pg_catalog' AS $$
  SELECT COALESCE(
    -- (1) trusted-backend path: an edge function / RPC sets this per request
    NULLIF(current_setting('request.hardsaw.contractor_id', true), '')::uuid,
    -- (2) future authenticated-login path: unchanged, still works
    (SELECT id FROM hardsaw.contractors WHERE auth_user_id = auth.uid() LIMIT 1)
  );
$$;
```

- **No policy rewrites.** All 14 existing `_tenant` policies keep working verbatim
  because the predicate string is unchanged.
- **Backward compatible.** With neither source set (today's anon browser path), it
  returns NULL exactly as before — Hardsaw's behavior is unchanged.
- **GUC name has a dotted prefix** (`request.hardsaw.contractor_id`) so it is a valid
  custom parameter and, critically, is **not** a session default a low-trust client can
  rely on — it must be set per transaction with `set_config(..., is_local => true)`.
- A helper `hardsaw.set_tenant_context(uuid)` wraps the `set_config` call for backends.

**The one decision only Nate can make — how the Assist pilot authenticates.** The
resolver above supports two enforcement models; the *migrations are written to be
compatible with either*, but which one we operationalize is an architecture call:

- **Option A — per-tenant authenticated login (recommended long-term).** Give each
  tenant a Supabase Auth user, set `contractors.auth_user_id`, and have that tenant's
  surface use a logged-in (`authenticated` role) session. The existing `auth.uid()`
  branch then isolates tenants with **zero** trust in client-supplied ids, and RLS is
  genuinely enforced (authenticated role does not bypass RLS). Downside: introduces a
  login step the product does not have today.

- **Option B — trusted backend sets tenant context (fits today's reality).** Route
  tenant-scoped writes/reads through edge functions that call
  `hardsaw.set_tenant_context($tenant)` at the top of each request. **Caveat that must
  be understood:** because edge functions currently use the `service_role` key
  (`BYPASSRLS`), setting the GUC alone does *not* re-enable RLS — the function would
  still need to run under a **non-BYPASSRLS role** (e.g. a dedicated `tenant_runtime`
  role, or a per-tenant signed JWT used with the `authenticated` role) for RLS to
  actually enforce isolation. Otherwise isolation on the server path remains a matter
  of edge-code discipline, not database enforcement.

**Recommendation:** adopt the resolver change (`0001`) now — it is safe and unlocks
both options — and **decide A vs B before wiring the second tenant's traffic.** My
lean is **A for any surface a human logs into, B (with a non-BYPASSRLS runtime role)
for machine/agent traffic.** This is called out again as an open question in §7.

---

## 6. Draft migrations (see `supabase/migrations/drafts/`)

All are **unapplied**. Each has an explicit paired `.rollback.sql`. They live under
`drafts/` specifically so they are **not** in the live `supabase migration` sequence
and cannot be auto-applied.

| File | What it does | Breaks Hardsaw? | Reversible |
|---|---|---|---|
| `0001_tenant_context_resolver.sql` | Make `current_contractor_id()` GUC-aware; add `set_tenant_context()` helper | No — NULL fallback identical to today | `0001_…rollback.sql` restores original one-line body, drops helper |
| `0002_force_rls_tenant_tables.sql` | `FORCE ROW LEVEL SECURITY` on the Layer-2 tables | No — only affects table-owner DML, not anon/service paths | `0002_…rollback.sql` sets `NO FORCE` |
| `0003_leads_tenant_attribution.sql` | Add nullable `leads.contractor_id` FK, backfill the 1 existing lead → Hardsaw, add tenant SELECT policy, keep anon-insert funnel | No — column nullable, existing insert policy untouched | `0003_…rollback.sql` drops policy + column |
| `0004_second_tenant_onboarding_template.sql` | **Guarded** template for creating tenant #2 + an optional per-tenant anon-insert policy. No-ops until explicitly filled in | No — inert by default | rollback notes inline |

**Ordering:** 0001 → 0002 → 0003. 0004 is a template, applied only at real onboarding.

---

## 7. Open questions for Nate (do not guess)

1. **Second-tenant auth model — Option A vs B (§5).** This is the one decision that
   determines whether the deployed `auth.uid()` RLS is sufficient or whether we need a
   non-BYPASSRLS runtime role for edge traffic. Everything else is decided.
2. **`leads` routing for tenant #2.** New anon-captured leads land with
   `contractor_id = NULL` (unrouted intake) because an anon client can't be trusted to
   declare its tenant. For the Assist pilot, should lead capture go through an edge
   function that stamps the capturing tenant? (Recommended; requires a later,
   in-scope-for-Phase-2 change to `lead-capture`.)
3. **`FORCE RLS` (`0002`)** — apply now, or defer until Option A/B is chosen? It's safe
   either way; included as a draft so it's ready.
4. **`product_skus` anon-read inconsistency** (§2) — leave as-is (service-role-only)?
   Out of scope tonight; flagging for awareness.

## 8. Explicitly OUT OF SCOPE tonight (per brief) — and honored
- Applying any migration to the live DB. **Not done.**
- Tenant onboarding UI. **Not built** (0004 is a SQL template, not UI).
- Changes to bom-calc core formulas. **Not touched.**
- Changes to RLS on `product_skus` / `manufacturers` / `vendor_product_mappings`.
  **Not touched.**
- Deploying edge functions / `supabase migration apply`. **Not run.**
- git push / merge. **Not done** (local commit only).
