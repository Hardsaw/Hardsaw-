// job-save | Forge | 2026-07-16
// Atomically persists a completed bom-calc result across the 4 normalized tables
// (jobs -> decision_results -> bom_lines, readiness_reports) so a job's full computed state
// survives past the browser session. All inserts happen inside the hardsaw.save_job() SQL
// function, which runs as a single transaction: if any part fails, nothing partially persists.
// After the write, this function independently reads the rows back by id and confirms the stored
// output_hash matches the result's decision_hash before reporting success.
//
// Request body: { result: <bom-calc payload>, input?: <bom-calc request>, contractor_id?: uuid, job_id?: uuid }
//   - result   : REQUIRED. The payload returned by bom-calc (must carry decision_hash + bom[]).
//   - input    : OPTIONAL. The request that produced `result`; stored for exact decision replay
//                (carries flags used in the decision hash). Defaults to {}.
//   - contractor_id : OPTIONAL. Owning contractor. If omitted and exactly one contractor exists,
//                that one is used; otherwise 400.
//   - job_id   : OPTIONAL. Reuse an existing job instead of creating one (job saves exactly once).
//
// NOTE: pre-req migration supabase/migrations/20260716000000_job_save.sql must be applied.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const result = body.result;
  const input = body.input ?? {};
  if (!result || typeof result !== "object") return json({ error: "Missing 'result' (bom-calc payload)" }, 400);
  if (typeof result.decision_hash !== "string") return json({ error: "result.decision_hash missing" }, 400);
  if (!Array.isArray(result.bom)) return json({ error: "result.bom must be an array" }, 400);
  if (result.error) return json({ error: `Refusing to save an errored result: ${result.error}` }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const db = supabase.schema("hardsaw");

  // Resolve contractor: explicit id, else the sole contractor if there is exactly one.
  let contractorId: string | undefined = body.contractor_id;
  if (!contractorId) {
    const { data: contractors, error: cErr } = await db.from("contractors").select("id").limit(2);
    if (cErr) return json({ error: `contractor lookup failed: ${cErr.message}` }, 400);
    if (!contractors || contractors.length !== 1) {
      return json({ error: "contractor_id required (could not resolve a single default contractor)" }, 400);
    }
    contractorId = contractors[0].id;
  }

  // Atomic all-or-nothing persist.
  const { data: saved, error: saveErr } = await db.rpc("save_job", {
    p_payload: result,
    p_contractor: contractorId,
    p_input: input,
    p_job_id: body.job_id ?? null,
  });
  if (saveErr) return json({ error: `save failed: ${saveErr.message}` }, 400);

  const jobId = (saved as any).job_id;
  const drId = (saved as any).decision_result_id;

  // Verify-after-write: independently read the rows back by id and confirm integrity.
  const [{ data: dr, error: drErr }, { data: lines, error: lErr }, { data: rr, error: rErr }] = await Promise.all([
    db.from("decision_results").select("output_hash, geometry_hash").eq("id", drId).single(),
    db.from("bom_lines").select("line_number").eq("decision_result_id", drId),
    db.from("readiness_reports").select("trust_level").eq("decision_result_id", drId).single(),
  ]);
  const verifyOk =
    !drErr && !lErr && !rErr &&
    dr?.output_hash === result.decision_hash &&
    Array.isArray(lines) && lines.length === result.bom.length &&
    !!rr;
  if (!verifyOk) {
    return json({
      error: "verify-after-write failed",
      detail: {
        drErr: drErr?.message, lErr: lErr?.message, rErr: rErr?.message,
        stored_output_hash: dr?.output_hash, expected: result.decision_hash,
        stored_lines: lines?.length, expected_lines: result.bom.length,
      },
      job_id: jobId, decision_result_id: drId,
    }, 500);
  }

  return json({
    success: true,
    job_id: jobId,
    decision_result_id: drId,
    bom_line_count: (saved as any).bom_line_count,
    output_hash: dr!.output_hash,
    geometry_hash: dr!.geometry_hash,
    trust_level: rr!.trust_level,
    verified: true,
  }, 200);
});
