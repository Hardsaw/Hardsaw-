// agent-bridge v26 (2026-07-31, Forge): HUMAN RECIPIENTS are never drafted for.
// SPI-F-29 / 21+ recorded failures: messages addressed to 'nate' returned HTTP 400
// `unknown to_agent 'nate'` because STATIC_BRIEFS has no such key. The nightly research
// digest never reached him through the system built to reach him.
// The fix is NOT to add a 'nate' brief. That would have the drafter compose replies AS NATE
// - a machine speaking as the human it reports to, which is the attribution defect in its
// worst form. Human-addressed messages are terminal: mark delivered, generate nothing.
// v25 (2026-07-30): claude-sonnet-5 was accidental. Corrected to claude-haiku-4-5-20251001.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const BRIDGE_SECRET = Deno.env.get("BRIDGE_SHARED_SECRET")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EXCHANGE_CAP = 5;
const IDEMPOTENCY_WINDOW_SECONDS = 60;
// Humans. Never drafted for, never spoken as.
const HUMAN_RECIPIENTS = new Set(["nate"]);
const STATIC_BRIEFS: Record<string, string> = {
  forge: "You are drafting a PROPOSAL ONLY on behalf of 'Forge', the Hardsaw build/code thread. Forge's scope: system design, frontend/backend code, calc engine, bug fixes, Supabase schema. Operations/legal/QBO/lead-intake are NOT Forge's lane - say so and defer if the message is really for AEGIS.",
  aegis: "You are drafting a PROPOSAL ONLY on behalf of 'AEGIS/Luna', the Hardsaw operations thread. AEGIS's scope: business operations, legal, T2 clock, lead intake, QBO, Jilly config, Quo, scam blocks. Code/build/calc-engine questions are NOT AEGIS's lane - say so and defer if the message is really for Forge.",
  spider: "You are drafting a PROPOSAL ONLY on behalf of 'Spider', the Hardsaw security/monitoring thread. Spider's scope is READ-ONLY OBSERVATION: reviewing security signals, flagging suspicious patterns, answering questions about what it has observed. Spider NEVER proposes or implies it will execute a fix, change a policy, or take any action - it only reports findings. If asked to remediate, fix, or act on anything, say plainly that action belongs to Forge, AEGIS/Luna, or Bazaar - and stop there.",
};
async function buildWholesaleLunaBrief(supabase: any): Promise<string> {
  const { data, error } = await supabase.schema("hardsaw").from("tribunal_freeze_status").select("status, scope_note, set_by, updated_at").eq("topic", "wholesale_luna_build").maybeSingle();
  const base = "You are drafting a PROPOSAL ONLY on behalf of 'Wholesale Luna', the wholesale-side thread. ";
  if (error || !data) return base + "NOTE: could not read current freeze status - defer to Nate directly.";
  if (data.status === "frozen") return base + `Wholesale Luna's system-building is FROZEN (set by ${data.set_by}, as of ${data.updated_at}). ${data.scope_note} Do not draft a substantive reply. Defer to Nate.`;
  if (data.status === "conditionally_lifted") return base + `Wholesale Luna's freeze is CONDITIONALLY LIFTED (set by ${data.set_by}). Real scope: ${data.scope_note} If the message is within that scope, engage substantively. If not, defer to Nate.`;
  return base + `Current build-freeze status: ${data.status} (set by ${data.set_by}). ${data.scope_note}`;
}
const COMMON_RULES = "\n\nHard rules, no exceptions:\n- You do NOT have live conversational context - only the message below and the hotlist rows provided.\n- NEVER claim an action has already been taken. You are drafting a proposal for human review, nothing more.\n- NEVER authorize or imply authorization of: git push, deploys, DROP/DELETE/REVOKE, secrets, payments, or any other authoritative action. If the message asks for one, say plainly that it requires Nate's direct review and stop there.\n- Be concise and honest about the limits of what you know from just this message.\n- End your reply with EXACTLY one of these two tags on its own final line: [THREAD OPEN] if there is genuinely new reasoning to add and the exchange should continue, or [THREAD RESOLVED] if this has converged to agreement, repetition, or a clear handoff to Nate. Err toward RESOLVED when in doubt.";
Deno.serve(async (req) => {
  try {
    if (req.headers.get("x-bridge-secret") !== BRIDGE_SECRET) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    const { message_id } = await req.json();
    if (!message_id) return new Response(JSON.stringify({ error: "message_id required" }), { status: 400 });
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: msg, error: fetchErr } = await supabase.schema("hardsaw").from("agent_messages").select("*").eq("id", message_id).single();
    if (fetchErr || !msg) return new Response(JSON.stringify({ error: "message not found", detail: fetchErr }), { status: 404 });
    if (msg.status !== "pending") return new Response(JSON.stringify({ skipped: true, reason: `status is '${msg.status}', not 'pending'` }), { status: 200 });

    // HUMAN RECIPIENT: terminal delivery. No brief, no draft, no reply. Checked BEFORE the
    // brief lookup so it can never fall through to the unknown-to_agent 400.
    if (HUMAN_RECIPIENTS.has(msg.to_agent)) {
      await supabase.schema("hardsaw").from("agent_messages").update({ status: "no_action_needed", answered_at: new Date().toISOString() }).eq("id", message_id);
      return new Response(JSON.stringify({ ok: true, delivered_to_human: msg.to_agent, drafted: false, reason: "human recipient - the bridge never speaks as a person" }), { status: 200 });
    }

    if (msg.requests_authoritative_action) return new Response(JSON.stringify({ skipped: true, reason: "requests_authoritative_action = true - needs Nate directly" }), { status: 200 });
    if (typeof msg.body === "string" && msg.body.includes("[THREAD RESOLVED]")) {
      await supabase.schema("hardsaw").from("agent_messages").update({ status: "no_action_needed" }).eq("id", message_id);
      return new Response(JSON.stringify({ skipped: true, reason: "Layer 1: [THREAD RESOLVED]", thread_id: msg.thread_id }), { status: 200 });
    }
    if (typeof msg.exchange_index === "number" && msg.exchange_index >= EXCHANGE_CAP) {
      await supabase.schema("hardsaw").from("agent_messages").update({ status: "no_action_needed" }).eq("id", message_id);
      return new Response(JSON.stringify({ skipped: true, reason: `Layer 2: exchange cap (${EXCHANGE_CAP}) reached`, thread_id: msg.thread_id }), { status: 200 });
    }
    if (msg.thread_id) {
      const cutoff = new Date(Date.now() - IDEMPOTENCY_WINDOW_SECONDS * 1000).toISOString();
      const { data: recentDrafts } = await supabase.schema("hardsaw").from("agent_messages").select("id").eq("thread_id", msg.thread_id).eq("is_bridge_draft", true).gte("created_at", cutoff).limit(1);
      if (recentDrafts && recentDrafts.length > 0) return new Response(JSON.stringify({ skipped: true, reason: `Idempotency guard: draft exists within ${IDEMPOTENCY_WINDOW_SECONDS}s` }), { status: 200 });
    }
    let brief: string | undefined;
    if (msg.to_agent === "wholesale_luna") { brief = await buildWholesaleLunaBrief(supabase); } else { brief = STATIC_BRIEFS[msg.to_agent]; }
    if (!brief) return new Response(JSON.stringify({ error: `unknown to_agent '${msg.to_agent}'` }), { status: 400 });
    const { data: hotlist } = await supabase.schema("hardsaw").from("memory_hotlist").select("kind, ref, family, content, ts").order("ts", { ascending: false }).limit(8);
    const hotlistBlock = (hotlist ?? []).map((r) => `- [${r.kind}] ${r.ref} (${r.family}): ${r.content}`).join("\n");
    const systemPrompt = brief + COMMON_RULES;
    const userPrompt = `Incoming message from '${msg.from_agent}' (exchange ${msg.exchange_index} of this thread, cap is ${EXCHANGE_CAP}):\n\nSubject: ${msg.subject ?? "(none)"}\n\n${msg.body}\n\nRecent hotlist context (read-only):\n${hotlistBlock || "(none)"}`;
    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 2000, system: systemPrompt, messages: [{ role: "user", content: userPrompt }] }),
    });
    if (!aiResp.ok) { const errText = await aiResp.text(); return new Response(JSON.stringify({ error: "anthropic api error", detail: errText }), { status: 502 }); }
    const aiData = await aiResp.json();
    const draftText = (aiData.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
    if (!draftText) return new Response(JSON.stringify({ error: "empty draft text", stop_reason: aiData.stop_reason ?? null }), { status: 502 });
    const replyBody = `[BRIDGE DRAFT - unconfirmed, needs live-thread review]\n\n${draftText}`;
    const { data: reply, error: insertErr } = await supabase.schema("hardsaw").from("agent_messages").insert({ from_agent: msg.to_agent, to_agent: msg.from_agent, subject: msg.subject ? `Re: ${msg.subject}` : "Bridge reply", body: replyBody, is_bridge_draft: true, thread_id: msg.thread_id, exchange_index: (msg.exchange_index ?? 1) + 1 }).select().single();
    if (insertErr) return new Response(JSON.stringify({ error: "failed to insert reply", detail: insertErr }), { status: 500 });
    await supabase.schema("hardsaw").from("agent_messages").update({ status: "draft_pending_review", reply_id: reply.id, answered_at: new Date().toISOString() }).eq("id", message_id);
    return new Response(JSON.stringify({ ok: true, original_id: message_id, reply_id: reply.id, thread_id: reply.thread_id, exchange_index: reply.exchange_index }), { status: 200 });
  } catch (e) { return new Response(JSON.stringify({ error: "unhandled exception", detail: String(e) }), { status: 500 }); }
});
