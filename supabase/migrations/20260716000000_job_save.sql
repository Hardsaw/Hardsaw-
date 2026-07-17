-- job-save: atomic persistence of a completed bom-calc result across the 4 normalized tables
-- (jobs -> decision_results -> bom_lines, readiness_reports). Author: Forge | 2026-07-16
--
-- WHY THE SCHEMA RELAX BELOW:
-- bom-calc is a SKU-agnostic *quantity* engine. Its output carries a SKU (real where a
-- distributor SKU is vaulted for the combo, null where "unconfirmed") and a qty, but it emits
-- NO price and is bound to NO external vendor_profile. The normalized tables were designed for a
-- different, vendor-vaulted pipeline. Rather than fabricate a price/SKU/vendor (explicitly
-- forbidden), we relax the three bom_lines NOT-NULLs (+ decision_results.vendor_profile_version)
-- so bom-calc output can be stored EXACTLY as produced: real SKU where confirmed, null where not,
-- null price, null vendor. Postgres FKs are MATCH SIMPLE, so a NULL vendor_profile_id auto-
-- satisfies both bom_lines FKs (the vendor_profiles ref and the composite skus ref) with no FK
-- drops. The 22 legacy jobs live entirely in jobs.canonical_spec and are untouched by this.

-- 1) Relax only the columns bom-calc genuinely cannot source (store NULL, never a fake value) ---
ALTER TABLE hardsaw.bom_lines        ALTER COLUMN vendor_profile_id      DROP NOT NULL;
ALTER TABLE hardsaw.bom_lines        ALTER COLUMN sku                    DROP NOT NULL;
ALTER TABLE hardsaw.bom_lines        ALTER COLUMN price                  DROP NOT NULL;
ALTER TABLE hardsaw.decision_results ALTER COLUMN vendor_profile_version DROP NOT NULL;

-- 2) Atomic all-or-nothing save. The whole body runs in the caller's transaction; any RAISE
--    aborts every insert, so nothing partially persists. Returns the ids + line count for the
--    caller's independent verify-after-write read.
CREATE OR REPLACE FUNCTION hardsaw.save_job(
  p_payload    jsonb,                 -- a completed bom-calc result payload
  p_contractor uuid,                  -- owning contractor (jobs.contractor_id, NOT NULL FK)
  p_input      jsonb DEFAULT '{}'::jsonb,  -- the bom-calc request that produced p_payload (carries flags)
  p_job_id     uuid  DEFAULT NULL     -- reuse an existing job instead of creating one
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_job_id    uuid;
  v_dr_id     uuid;
  v_trace     text;
  v_flags     jsonb;
  v_readiness text := p_payload->>'readiness';
  v_trust_lvl text;
  v_trust_scr numeric;
  v_bom_count int;
BEGIN
  -- validation ---------------------------------------------------------------------------------
  IF p_payload->>'decision_hash' IS NULL THEN
    RAISE EXCEPTION 'save_job: payload missing decision_hash';
  END IF;
  IF jsonb_typeof(p_payload->'bom') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'save_job: payload.bom must be an array';
  END IF;
  IF p_contractor IS NULL THEN
    RAISE EXCEPTION 'save_job: p_contractor is required';
  END IF;

  -- clean 8-char trace from the (possibly signed) engine decision_hash, e.g. "-74ED386B"->"74ED386B"
  v_trace := upper(regexp_replace(p_payload->>'decision_hash', '[^A-Za-z0-9]', '', 'g'));
  v_flags := COALESCE(p_input->'flags', '[]'::jsonb);
  IF jsonb_typeof(v_flags) IS DISTINCT FROM 'array' THEN v_flags := '[]'::jsonb; END IF;

  -- trust derived from the engine's own readiness verdict (documented mapping; not fabricated data)
  v_trust_lvl := CASE v_readiness
                   WHEN 'READY'        THEN 'CLEAR'
                   WHEN 'NEEDS_REVIEW' THEN 'HUMAN_RECOMMENDED'
                   WHEN 'BLOCKED'      THEN 'BLOCKED'
                   ELSE 'HUMAN_REQUIRED' END;
  v_trust_scr := CASE v_trust_lvl
                   WHEN 'CLEAR'             THEN 1.0
                   WHEN 'HUMAN_RECOMMENDED' THEN 0.5
                   WHEN 'HUMAN_REQUIRED'    THEN 0.25
                   ELSE 0.0 END;

  -- 1) jobs (create, or reuse a passed-in job) -------------------------------------------------
  IF p_job_id IS NULL THEN
    INSERT INTO hardsaw.jobs (
      contractor_id, intent_id, trace_id, state, canonical_spec,
      vendor_profile_id, vendor_profile_version, ruleset_version, core_engine_version
    ) VALUES (
      p_contractor,
      'HARDSAW_JOB_' || v_trace,
      v_trace,
      'PACKETS_READY',
      jsonb_build_object(
        'style',          p_payload->>'style_id',
        'style_label',    p_payload->>'style_label',
        'height_ft',      p_payload->'height_ft',
        'total_lf',       p_payload->'total_lf',
        'build_lf',       p_payload->'build_lf',
        'bom_items',      jsonb_array_length(p_payload->'bom'),
        'readiness',      p_payload->>'readiness',
        'decision_hash',  p_payload->>'decision_hash',
        'geometry_hash',  p_payload->>'geo_hash',
        'engine_version', p_payload->>'engine_version',
        'saved_via',      'job-save'
      ),
      NULL,                              -- no vendor profile (bom-calc SKUs are engine-embedded)
      NULL,
      p_payload->>'engine_version',      -- ruleset+engine are one monolith in bom-calc
      p_payload->>'engine_version'
    ) RETURNING id INTO v_job_id;
  ELSE
    v_job_id := p_job_id;
    PERFORM 1 FROM hardsaw.jobs WHERE id = v_job_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'save_job: job % not found', v_job_id; END IF;
  END IF;

  -- 2) decision_results (UNIQUE job_id => a job saves exactly once) -----------------------------
  INSERT INTO hardsaw.decision_results (
    job_id, geometry, warnings, ruleset_version, vendor_profile_version, core_engine_version,
    version_manifest, intent_hash, geometry_hash, output_hash, invariants
  ) VALUES (
    v_job_id,
    -- everything needed to reconstruct the decision (bom itself is normalized into bom_lines):
    (p_payload - 'bom') || jsonb_build_object('flags', v_flags, 'input', p_input),
    COALESCE(p_payload->'findings', '[]'::jsonb),
    p_payload->>'engine_version',
    NULL,                                -- no external vendor profile version
    p_payload->>'engine_version',
    jsonb_build_object(
      'engine_version',   p_payload->>'engine_version',
      'resolution_mode',  p_payload->>'resolution_mode',
      'style_id',         p_payload->>'style_id',
      'protocol',         'bom-calc'
    ),
    md5(COALESCE(p_input, '{}'::jsonb)::text),   -- honest hash of the real request intent
    p_payload->>'geo_hash',
    p_payload->>'decision_hash',
    jsonb_build_object('proof_state', p_payload->>'proof_state', 'sku_summary', p_payload->'sku_summary')
  ) RETURNING id INTO v_dr_id;

  -- 3) bom_lines: store bom-calc output EXACTLY. real sku or null; qty/unit/label as-is; no price
  INSERT INTO hardsaw.bom_lines (
    decision_result_id, line_number, vendor_profile_id, sku, qty, unit, price, description
  )
  SELECT
    v_dr_id,
    ord::int,
    NULL,                                -- vendor_profile_id: none (satisfies both FKs via NULL)
    item->>'sku',                        -- real SKU where confirmed, SQL NULL where json null
    (item->>'qty')::numeric,
    item->>'unit',
    NULL,                                -- price: bom-calc emits none
    item->>'label'
  FROM jsonb_array_elements(p_payload->'bom') WITH ORDINALITY AS t(item, ord);

  -- 4) readiness_reports (one per job; UNIQUE job_id) ------------------------------------------
  INSERT INTO hardsaw.readiness_reports (
    job_id, decision_result_id, trust_score, trust_level, next_action, severity_breakdown, invariants
  ) VALUES (
    v_job_id, v_dr_id, v_trust_scr, v_trust_lvl,
    jsonb_build_object(
      'action', CASE v_readiness
                  WHEN 'READY'        THEN 'PROCEED'
                  WHEN 'NEEDS_REVIEW' THEN 'REVIEW'
                  WHEN 'BLOCKED'      THEN 'RESOLVE_BLOCKERS'
                  ELSE 'REVIEW' END,
      'findings', COALESCE(p_payload->'findings', '[]'::jsonb)
    ),
    jsonb_build_object(
      'findings_total', jsonb_array_length(COALESCE(p_payload->'findings', '[]'::jsonb)),
      'proof_state',    p_payload->>'proof_state'
    ),
    jsonb_build_object('sku_summary', p_payload->'sku_summary')
  );

  SELECT count(*) INTO v_bom_count FROM hardsaw.bom_lines WHERE decision_result_id = v_dr_id;

  RETURN jsonb_build_object(
    'job_id',             v_job_id,
    'decision_result_id', v_dr_id,
    'bom_line_count',     v_bom_count,
    'output_hash',        p_payload->>'decision_hash',
    'trust_level',        v_trust_lvl
  );
END;
$$;
