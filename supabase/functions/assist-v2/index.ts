// ============================================================
// HARDSAW ASSIST-V2
// ============================================================
// 2026-08-02 (Forge) THREE FIXES, all measured before shipping:
//
// 1. PARSE BUG, four days stale and mine. `claudeData.content?.[0]?.text` assumes block zero
//    is text. If the model emits any non-text block first, .text is undefined and a contractor
//    silently got "Assist unavailable." with HTTP 200. I diagnosed this on 7/29, fixed it in
//    jilly, WROTE A PATCH FOR THIS FUNCTION, and never deployed it. The header below already
//    documented the symptom being observed live for 24h+. Same shape as lead-capture, where I
//    fixed the schema bug for the rate limiter and left it on the insert three lines down.
//
// 2. PROMPT CACHING. buildMemoryContext loads EVERY tier-0 row with no LIMIT - measured at
//    364 rows, 138,051 chars, ~34,500 tokens, ~$0.10 of input on EVERY question before the
//    question is read. Uncached, that was paid in full every call, and it grew every time any
//    agent wrote a tier-0 row.
//    cache_control on the doctrine block: cache reads bill at 10% of base input.
//    DELIBERATELY NOT TRUNCATING. Which doctrine an assist call needs is a doctrine question
//    and belongs to AEGIS, not to whoever types a LIMIT. Caching makes the existing load cheap
//    so that decision can be made unhurried rather than under cost pressure.
//    Cache ordering matters: static identity + doctrine FIRST, volatile recent-history and the
//    user question LAST, or nothing caches.
//
// 3. ASSIST WRITES A tier-1 VAULT ROW PER QUERY. Every question logged a row into the same
//    table the prompt reads from. Left in place - it is tier 1, not tier 0, so it does not
//    feed the doctrine block - but it is why lifevault_memory has 1,456 rows.
//
// Prior header, retained: built 7/28 per Spider's converged plan after 3 failed redeploys on
// the original 'assist' slug. Three real layers: verify_jwt, app-secret header checked against
// hardsaw.assist_app_secret, Postgres rate limit. Honest limit: the secret still lives in
// frontend JS. This raises the bar; it is not unbreakable. Full fix is a governed session proxy.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// STABLE half of the prompt: identity + doctrine. Cacheable.
async function buildStableContext(supabase: any): Promise<string> {
  const sections: string[] = [];
  try {
    const { data: doctrine, error: docErr } = await supabase
      .from('lifevault_memory').select('content, domain')
      .eq('tier', 0).order('created_at', { ascending: true });
    if (!docErr && doctrine?.length) {
      sections.push(`DOCTRINE LOCKS (immutable):\n${doctrine.map((d: any) => `  [${String(d.domain).toUpperCase()}] ${d.content}`).join('\n')}`);
    } else { sections.push(`DOCTRINE LOCKS: none loaded`); }
  } catch (e) { sections.push(`DOCTRINE LOCKS: query failed`); }
  return sections.join('\n\n');
}

// VOLATILE half: health numbers and recent history. Changes constantly, must come last.
async function buildVolatileContext(supabase: any): Promise<string> {
  const sections: string[] = [];
  try {
    const { data: health, error: healthErr } = await supabase.rpc('get_system_health');
    if (!healthErr && health && health[0]) {
      const h = health[0];
      sections.push(`SYSTEM HEALTH:\n  product_skus: ${h.confirmed_prices} confirmed / ${h.total_skus} total\n  golden_vectors: ${h.golden_vectors} registered\n  last_vault_write: ${h.last_vault_write?.split('T')[0] || 'unknown'}`);
    }
  } catch (e) { sections.push(`SYSTEM HEALTH: unavailable`); }
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recent, error: recentErr } = await supabase
      .from('lifevault_memory').select('content, domain, created_at, tags')
      .eq('tier', 1).in('domain', ['operational', 'architecture'])
      .gt('created_at', since).order('created_at', { ascending: false }).limit(15);
    if (!recentErr && recent?.length) {
      sections.push(`RECENT HISTORY (30 days, newest first):\n${recent.map((m: any) => {
        const date = new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const tags = m.tags?.includes('build_thread') ? '[BUILD]' : m.tags?.includes('aegis_thread') ? '[AEGIS]' : '';
        return `  [${date}] ${tags} ${m.content}`;
      }).join('\n')}`);
    } else { sections.push(`RECENT HISTORY: no entries in last 30 days`); }
  } catch (e) { sections.push(`RECENT HISTORY: query failed`); }
  return sections.join('\n\n');
}

async function loadLunaIdentity(supabase: any): Promise<string> {
  try {
    const { data, error } = await supabase.from('luna_identity').select('content').order('created_at', { ascending: true }).limit(30);
    if (error || !data?.length) return '';
    return data.map((row: any) => row.content).join('\n');
  } catch (e) { return ''; }
}

const BEHAVIORAL_RULES = `BEHAVIORAL RULES:
- Engine decides. You explain. Never compute quantities independently.
- Never invent SKUs or prices not confirmed in product_skus.
- If you reference memory, say "based on recent build history" not "I remember".
- Calibration sources: always cite the KAN number when referencing a price or formula.
- Response length: 2-4 sentences for simple questions, up to 8 for complex ones.
- Tone: direct, contractor-grade, no hedging, no sycophancy.
- If the memory context is empty or stale, say so honestly.`;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-App-Secret' } });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const supabaseHardsaw = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { db: { schema: 'hardsaw' } });

  const providedSecret = req.headers.get('x-app-secret') ?? '';
  const { data: secretRow, error: secretErr } = await supabaseHardsaw
    .from('assist_app_secret').select('secret_value').eq('id', 1).single();
  if (secretErr || !secretRow || providedSecret !== secretRow.secret_value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  const clientKey = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || req.headers.get('cf-connecting-ip') || 'unknown';
  const { data: limited, error: rlErr } = await supabaseHardsaw.rpc('check_assist_rate_limit', {
    p_client_key: clientKey, p_max: 10, p_window_minutes: 10,
  });
  if (rlErr) {
    console.error('[assist-v2] rate limit check error:', rlErr);
  } else if (limited) {
    return new Response(JSON.stringify({ error: 'Too many requests, please try again shortly.', answer: 'Give me just a moment and ask again.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const { question, jobContext, sessionRef } = await req.json();
    if (!question) return new Response(JSON.stringify({ error: 'question required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const [identityText, stableCtx, volatileCtx] = await Promise.all([
      loadLunaIdentity(supabase), buildStableContext(supabase), buildVolatileContext(supabase),
    ]);

    const userMessage = jobContext ? `CURRENT JOB CONTEXT:\n${jobContext}\n\nQUESTION: ${question}` : `QUESTION: ${question}`;

    // Static-first ordering. The cache_control breakpoint sits after identity + doctrine +
    // rules; everything after it is volatile and would break the cache if placed earlier.
    const systemBlocks = [
      { type: 'text',
        text: [identityText || 'You are Assist — the AI explanation layer for Hardsaw Fence LLC.',
               stableCtx, BEHAVIORAL_RULES].join('\n\n'),
        cache_control: { type: 'ephemeral' } },
      { type: 'text',
        text: `=== VOLATILE CONTEXT (generated ${new Date().toISOString()}) ===\n${volatileCtx}` },
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1024, system: systemBlocks, messages: [{ role: 'user', content: userMessage }] }),
    });

    const claudeData = await response.json();
    if (!response.ok) throw new Error(`Claude API error: ${JSON.stringify(claudeData)}`);

    // FIX 1: select the first ACTUAL text block, join multiples, and report shape when empty.
    const textBlocks = (claudeData.content ?? []).filter((b: any) => b?.type === 'text' && b.text);
    const answer = textBlocks.map((b: any) => b.text).join('\n').trim() || 'Assist unavailable.';
    const assistOk = textBlocks.length > 0;
    if (!assistOk) {
      console.error('[assist-v2] no text block in Claude response', {
        stop_reason: claudeData.stop_reason,
        block_types: (claudeData.content ?? []).map((b: any) => b?.type),
        usage: claudeData.usage,
      });
    }

    const u = claudeData.usage ?? {};
    console.log('[assist-v2] usage', {
      input: u.input_tokens, cache_create: u.cache_creation_input_tokens,
      cache_read: u.cache_read_input_tokens, output: u.output_tokens,
    });

    supabase.from('lifevault_memory').insert({
      domain: 'operational', tier: 1,
      content: `Assist query: "${question.slice(0, 80)}${question.length > 80 ? '...' : ''}" — memory_loaded: true`,
      owner: 'luna', tags: ['assist_interaction', 'build_thread'],
      source: 'assist_v2_edge_function', session_ref: sessionRef || `assist-${Date.now()}`,
    }).then(() => {});

    return new Response(JSON.stringify({
      answer, assist_ok: assistOk, memory_loaded: true,
      cache: { read: u.cache_read_input_tokens ?? 0, created: u.cache_creation_input_tokens ?? 0 },
      context_generated_at: new Date().toISOString(),
    }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message, answer: 'Assist temporarily offline — calculator results are valid.', assist_ok: false, memory_loaded: false }), {
      status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
});