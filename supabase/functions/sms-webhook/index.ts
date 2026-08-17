// sms-webhook v2 (2026-08-01, Forge) - DUPLICATE LEAD FIX.
//
// v1 worked end to end on the first real conversation: 6 turns, memory intact, full intake
// captured. Then the customer said "Thank you jilly", jilly replied warmly AND re-emitted the
// <LEAD_READY> block, and v1 submitted the lead a second time. Two identical rows, 23:03 and
// 23:04. Every customer who says thanks would duplicate their own lead.
//
// jilly's prompt tells her to emit LEAD_READY when she has everything - it never says "only
// once", and she has no memory of having done it. That is not a prompt bug to argue with; the
// webhook is the only place that knows whether a lead already exists for this phone.
//
// FIX: check sms_conversations for an existing lead_id on this phone before submitting.
// Idempotency belongs at the write, not in the wording of a prompt.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const QUO_API_KEY       = Deno.env.get("QUO_API_KEY")!;
const WEBHOOK_SECRET    = Deno.env.get("SMS_WEBHOOK_SECRET") || "";
const QUO_NUMBER        = "+18168523623";
const MAX_TURNS         = 20;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE, { db: { schema: "hardsaw" } });

function norm(p: string): string {
  const d = (p || "").replace(/\D/g, "");
  return d.length === 10 ? "+1" + d : d.length === 11 ? "+" + d : (p || "");
}

function extract(payload: any): { from: string; text: string; to: string } {
  const d = payload?.data ?? payload;
  const msg = d?.message ?? d?.object ?? d;
  const from = msg?.from?.phoneNumber ?? msg?.from ?? d?.from ?? "";
  const to   = msg?.to?.[0]?.phoneNumber ?? msg?.to?.[0] ?? msg?.to ?? QUO_NUMBER;
  const text = msg?.body ?? msg?.text ?? msg?.content ?? d?.body ?? "";
  return { from: typeof from === "string" ? from : (from?.phoneNumber ?? ""),
           to:   typeof to   === "string" ? to   : (to?.phoneNumber   ?? QUO_NUMBER),
           text: String(text || "") };
}

async function sendSMS(to: string, body: string) {
  const r = await fetch("https://api.quo.com/v1/messages", {
    method: "POST",
    headers: { "Authorization": QUO_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ content: body, from: QUO_NUMBER, to: [to] }),
  });
  if (!r.ok) console.error("[sms-webhook] Quo send failed:", r.status, await r.text());
  return r.ok;
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

    if (WEBHOOK_SECRET) {
      const given = new URL(req.url).searchParams.get("s") ?? req.headers.get("x-webhook-secret");
      if (given !== WEBHOOK_SECRET) {
        console.error("[sms-webhook] rejected: bad or missing secret");
        return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
      }
    }

    const payload = await req.json();
    const { from, text } = extract(payload);

    if (!from || !text) {
      console.error("[sms-webhook] UNPARSED PAYLOAD:", JSON.stringify(payload).slice(0, 800));
      return new Response(JSON.stringify({ ok: false, error: "could not extract from/text", shape: Object.keys(payload ?? {}) }), { status: 422 });
    }

    const phone = norm(from);
    if (phone === QUO_NUMBER) return new Response(JSON.stringify({ ok: true, skipped: "own number" }));

    await supabase.from("sms_conversations").insert({ phone, role: "user", body: text });

    const { data: hist } = await supabase.from("sms_conversations")
      .select("role, body, lead_id").eq("phone", phone)
      .order("created_at", { ascending: false }).limit(MAX_TURNS);
    const rows = (hist ?? []).reverse();
    const messages = rows.map((h: any) => ({ role: h.role, content: h.body }));

    // IDEMPOTENCY: has a lead already been captured on this phone in this conversation?
    const existingLeadId: string | null = rows.find((h: any) => h.lead_id)?.lead_id ?? null;

    const jr = await fetch(`${SUPABASE_URL}/functions/v1/jilly`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    const jd = await jr.json();
    const answer: string = jd?.answer ?? "";
    if (!jr.ok || !answer || jd?.jilly_ok === false) {
      console.error("[sms-webhook] jilly failed:", jr.status, JSON.stringify(jd).slice(0, 400));
      await sendSMS(phone, "Thanks! Nate will follow up with you shortly at this number.");
      return new Response(JSON.stringify({ ok: false, jilly_ok: false }), { status: 502 });
    }

    let leadId: string | null = existingLeadId;
    let duplicateSuppressed = false;
    const m = answer.match(/<LEAD_READY>([\s\S]*?)<\/LEAD_READY>/);
    if (m) {
      if (existingLeadId) {
        // jilly re-emits LEAD_READY on later turns because she has no memory of having done
        // it. Suppress rather than argue with the prompt.
        duplicateSuppressed = true;
        console.log(`[sms-webhook] LEAD_READY re-emitted for ${phone}, already captured as ${existingLeadId} - suppressed`);
      } else {
        try {
          const lead = JSON.parse(m[1].trim());
          if (!lead.phone) lead.phone = phone;
          const lr = await fetch(`${SUPABASE_URL}/functions/v1/lead-capture`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(lead),
          });
          const ld = await lr.json();
          if (ld?.lead_saved) leadId = ld.lead_id;
          else console.error("[sms-webhook] lead-capture did not save:", JSON.stringify(ld).slice(0, 300));
        } catch (e) { console.error("[sms-webhook] LEAD_READY parse failed:", e); }
      }
    }

    const visible = answer
      .replace(/<LEAD_READY>[\s\S]*?<\/LEAD_READY>/g, "")
      .replace(/\[CALC_LINK\|[^\]]*\]/g, "")
      .trim();

    await supabase.from("sms_conversations").insert({ phone, role: "assistant", body: visible, lead_id: leadId });
    if (leadId) await supabase.from("sms_conversations").update({ lead_id: leadId }).eq("phone", phone).is("lead_id", null);

    if (visible) await sendSMS(phone, visible);

    return new Response(JSON.stringify({ ok: true, phone, turns: messages.length,
      lead_saved: !!leadId && !duplicateSuppressed, lead_id: leadId, duplicate_suppressed: duplicateSuppressed }),
      { headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("[sms-webhook] fatal:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message ?? err) }), { status: 500 });
  }
});
