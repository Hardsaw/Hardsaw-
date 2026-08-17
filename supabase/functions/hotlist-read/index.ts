import { createClient } from "npm:@supabase/supabase-js@2";

const PATTERNS = [
  [/KAN\d{6}/g, "[QUOTE]"],
  [/invoice\s?\d{3,}/gi, "[INVOICE]"],
];
function sanitize(text) {
  let out = text;
  for (const [re, sub] of PATTERNS) out = out.replace(re, sub);
  return out;
}

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, x-hotlist-key",
    "Content-Type": "application/json",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const provided = req.headers.get("x-hotlist-key") ?? "";
  const expected = Deno.env.get("HOTLIST_SHARED_SECRET") ?? "";
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ ok: false, rows: [] }), { status: 401, headers: cors });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
      { db: { schema: "hardsaw" } },
    );
    const { data, error } = await supabase
      .from("memory_hotlist")
      .select("kind, family, content, ts")
      .eq("kind", "promotion_candidate")
      .order("ts", { ascending: false })
      .limit(40);
    if (error) throw error;

    const rows = (data ?? []).map((r) => {
      try { return { kind: r.kind, family: r.family, content: sanitize(r.content ?? ""), ts: r.ts }; }
      catch { return null; }
    }).filter(Boolean);

    return new Response(JSON.stringify({ ok: true, rows }), { headers: cors });
  } catch (_e) {
    return new Response(JSON.stringify({ ok: false, rows: [] }), { status: 500, headers: cors });
  }
});
