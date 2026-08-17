// forge-overnight — Continuous Mind, Stage A (READER).
// Founder direction: Nate, 2026-08-03 (vault d4ce3e18). Built by Forge on active feed.
// HARD SCOPE: hydrates from live state, DRAFTS to hardsaw.overnight_quarantine ONLY.
// Never writes findings, vault, doctrine, or messages. Never acts. b10aa855-compliant:
// quarantined drafts awaiting live review are not deliberation.
//
// DEDUP-ON-REF FIX (2026-08-06, Forge, per SPD-RESEARCH-01/SPD-QUAR-01):
// Every quarantine row was content-unique but ref-repeated - one ref re-observed hourly
// with the note reworded each time, so a content-hash dedup never fires. 490 rows / 99
// distinct refs, one ref alone at 30+ rows saying the same two sentences differently.
// Fix: before inserting a draft_closure or observation, check for an existing UNREVIEWED
// row with the same (kind, ref). If one exists, update it in place instead of adding a
// duplicate. A reviewed row is never touched - review always wins over a later draft.
// Contradictions (array-keyed) and the one-off brief are left as always-insert; keying
// those correctly is a real design question, not resolved here on purpose.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const BASE = "https://unddklhbrmqvyqagomtn.supabase.co";

Deno.serve(async (req: Request) => {
  const shared = Deno.env.get("BRIDGE_SHARED_SECRET");
  if (!shared || req.headers.get("x-bridge-secret") !== shared) {
    return new Response("unauthorized", { status: 401 });
  }

  let svc = "";
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    svc = keys["default"] ?? "";
  } catch (_) { /* fall through */ }
  if (!svc) svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!svc) return new Response("no service key", { status: 500 });

  const H: Record<string, string> = {
    apikey: svc,
    Authorization: `Bearer ${svc}`,
    "Content-Type": "application/json",
    "Accept-Profile": "hardsaw",
    "Content-Profile": "hardsaw",
  };

  const startedAt = new Date().toISOString();

  const insertRun = async (status: string, detail: unknown, drafts: number): Promise<string | null> => {
    const r = await fetch(`${BASE}/rest/v1/overnight_runs`, {
      method: "POST",
      headers: { ...H, Prefer: "return=representation" },
      body: JSON.stringify({ started_at: startedAt, finished_at: new Date().toISOString(), status, detail, drafts_written: drafts }),
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows?.[0]?.id ?? null;
  };

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) {
    await insertRun("no_api_key", { note: "ANTHROPIC_API_KEY missing from edge secrets" }, 0);
    return new Response(JSON.stringify({ status: "no_api_key" }), { status: 500 });
  }

  // ---- HYDRATE (read-only against live state) ----
  const rpc = async (fn: string, args: unknown): Promise<unknown> => {
    const r = await fetch(`${BASE}/rest/v1/rpc/${fn}`, { method: "POST", headers: H, body: JSON.stringify(args) });
    return r.ok ? await r.json() : { rpc_error: fn, status: r.status };
  };

  const surface = await rpc("session_open_surface", { p_agent: "forge" });
  // NOTE: deliberately NOT calling check_bridge_since_last — it advances a durable
  // checkpoint that belongs to live Forge. Reading pending messages non-destructively:
  const pendingMsgs = await fetch(
    `${BASE}/rest/v1/agent_messages?status=eq.pending&is_bridge_draft=eq.false&select=from_agent,to_agent,subject,created_at&order=created_at.desc&limit=10`,
    { headers: H },
  ).then((r) => (r.ok ? r.json() : []));
  const openFindings = await fetch(
    `${BASE}/rest/v1/session_findings?closed_at=is.null&select=finding_code,agent_name,claim,falsifier,created_at&order=created_at.desc&limit=25`,
    { headers: H },
  ).then((r) => (r.ok ? r.json() : []));

  // ---- ONE BOUNDED CLAUDE CALL: read, correlate, draft. Nothing else. ----
  const sys = `You are Forge Overnight Reader — Stage A of the Hardsaw continuous mind. You run while Nate sleeps.\nHARD RULES: You DRAFT only. You act on nothing, decide nothing, close nothing. Your output goes to a quarantine table that a live agent or Nate must review. You never speak as the tribunal.\nDoctrine you operate under: ran_clean_is_not_tested; structural_gate_over_remembered_check; check what a container HOLDS, not what it is named; a count is not a measurement.\nRespond with STRICT JSON only, no markdown fences, matching:\n{"brief": "3-6 sentence morning brief for Nate: what changed overnight, what needs his eyes first",\n "draft_closures": [{"finding_code": "...", "rationale": "why its falsifier now appears satisfiable", "evidence_to_run": "the exact query or check a live agent should run"}],\n "contradictions": [{"summary": "two items in the data that cannot both be true", "refs": ["..."]}],\n "observations": [{"note": "anything a live session should look at", "ref": "..."}]}\nEmpty arrays are fine and often correct. Do not manufacture work.`;

  const userMsg = `SESSION_OPEN_SURFACE for forge:\n${JSON.stringify(surface).slice(0, 6000)}\n\nPENDING LIVE MESSAGES (non-destructive read):\n${JSON.stringify(pendingMsgs).slice(0, 3000)}\n\nOPEN FINDINGS (up to 25, newest first):\n${JSON.stringify(openFindings).slice(0, 9000)}`;

  let parsed: {
    brief?: string;
    draft_closures?: unknown[];
    contradictions?: unknown[];
    observations?: unknown[];
  } = {};
  let llmStatus = "ok";
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: [{ type: "text", text: sys, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    if (!resp.ok) {
      llmStatus = `llm_http_${resp.status}`;
    } else {
      const data = await resp.json();
      const text = (data.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n");
      parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    }
  } catch (e) {
    llmStatus = `llm_error: ${String(e).slice(0, 200)}`;
  }

  // ---- WRITE TO QUARANTINE ONLY ----
  const runId = await insertRun(llmStatus, { surface_rows: Array.isArray(surface) ? surface.length : -1, open_findings: openFindings.length, pending_msgs: pendingMsgs.length }, 0);

  let drafts = 0;
  let updates = 0;

  // DEDUP-ON-REF FIX: per-kind field that identifies "the same underlying thing being
  // re-observed" versus "a genuinely new item." Only kinds with an unambiguous single-value
  // key are covered - see header comment for what's deliberately left out and why.
  const dedupField: Record<string, string> = {
    draft_closure: "finding_code",
    observation: "ref",
  };

  const q = async (kind: string, content: Record<string, unknown>) => {
    const field = dedupField[kind];
    const key = field ? content?.[field] : null;

    if (key && typeof key === "string") {
      const existing = await fetch(
        `${BASE}/rest/v1/overnight_quarantine?kind=eq.${encodeURIComponent(kind)}&reviewed_by=is.null&content->>${field}=eq.${encodeURIComponent(key)}&select=id&limit=1`,
        { headers: H },
      ).then((r) => (r.ok ? r.json() : []));

      if (Array.isArray(existing) && existing.length > 0) {
        const id = existing[0].id;
        const r = await fetch(`${BASE}/rest/v1/overnight_quarantine?id=eq.${id}`, {
          method: "PATCH",
          headers: H,
          body: JSON.stringify({ content, run_id: runId, created_at: new Date().toISOString() }),
        });
        if (r.ok) updates++;
        return;
      }
    }

    const r = await fetch(`${BASE}/rest/v1/overnight_quarantine`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ run_id: runId, kind, content }),
    });
    if (r.ok) drafts++;
  };

  if (llmStatus === "ok") {
    if (parsed.brief) await q("brief", { text: parsed.brief });
    for (const c of parsed.draft_closures ?? []) await q("draft_closure", c as Record<string, unknown>);
    for (const c of parsed.contradictions ?? []) await q("contradiction", c as Record<string, unknown>);
    for (const o of parsed.observations ?? []) await q("observation", o as Record<string, unknown>);
    if (runId) {
      await fetch(`${BASE}/rest/v1/overnight_runs?id=eq.${runId}`, {
        method: "PATCH",
        headers: H,
        body: JSON.stringify({ drafts_written: drafts, finished_at: new Date().toISOString() }),
      });
    }
  }

  return new Response(JSON.stringify({ status: llmStatus, run_id: runId, drafts, updates }), {
    headers: { "Content-Type": "application/json" },
  });
});
