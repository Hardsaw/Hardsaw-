import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SHIELD_AUTH_TOKEN = Deno.env.get('SHIELD_AUTH_TOKEN') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-shield-token',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function authOk(req: Request): boolean {
  const token =
    req.headers.get('x-shield-token') ??
    req.headers.get('authorization')?.replace('Bearer ', '') ?? '';
  return SHIELD_AUTH_TOKEN.length > 0 && token === SHIELD_AUTH_TOKEN;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!authOk(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const endpoint = url.pathname.split('/').pop();

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    if (endpoint === 'audit') {
      const limit = parseInt(url.searchParams.get('limit') ?? '50');
      const { data, error } = await sb
        .schema('hardsaw')
        .from('luna_actions')
        .select('id, action, token, granted, reason, ts')
        .order('ts', { ascending: false })
        .limit(Math.min(limit, 200));
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, rows: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (endpoint === 'rls') {
      const { data, error } = await sb.rpc('shield_rls_check');
      if (error) {
        // Fallback: direct query if RPC not available
        const { data: d2, error: e2 } = await sb
          .from('pg_tables')
          .select('tablename, rowsecurity')
          .eq('schemaname', 'hardsaw')
          .in('tablename', ['lifevault_memory','luna_identity','luna_sessions','t2_measurements','luna_actions','product_skus','leads']);
        if (e2) throw e2;
        return new Response(JSON.stringify({ ok: true, rows: d2 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true, rows: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (endpoint === 'memory') {
      const limit = parseInt(url.searchParams.get('limit') ?? '20');
      const { data, error } = await sb
        .schema('hardsaw')
        .from('lifevault_memory')
        .select('id, domain, tier, tags, source, created_at')
        .order('created_at', { ascending: false })
        .limit(Math.min(limit, 100));
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, rows: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (endpoint === 'threats') {
      const limit = parseInt(url.searchParams.get('limit') ?? '50');
      const { data, error } = await sb
        .schema('hardsaw')
        .from('luna_actions')
        .select('id, action, token, granted, reason, ts')
        .eq('granted', false)
        .order('ts', { ascending: false })
        .limit(Math.min(limit, 200));
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, rows: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (endpoint === 'health') {
      return new Response(JSON.stringify({
        ok: true,
        service: 'shield-read',
        ts: new Date().toISOString(),
        endpoints: ['audit','rls','memory','threats','health'],
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown endpoint. Use: audit | rls | memory | threats | health' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
