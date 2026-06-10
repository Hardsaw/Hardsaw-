/**
 * Hardsaw LifeVault Memory Logger
 *
 * POST endpoint for structured event capture into hardsaw.lifevault_memory.
 * Append-only by table trigger. Service role insert.
 *
 * Accepts: { memory_type: string, content: object }
 * Returns: { success: boolean, id?: uuid, memory_type?: string, inserted_at?: timestamp, error?: string }
 *
 * Deployed with --no-verify-jwt (anon callable).
 * Used by Luna sessions for Daily Reports, Move reports, ADRs, conversation captures.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Validate memory_type
  if (
    body.memory_type === undefined ||
    body.memory_type === null ||
    typeof body.memory_type !== "string" ||
    body.memory_type.trim() === ""
  ) {
    return new Response(
      JSON.stringify({ success: false, error: "memory_type is required and must be a non-empty string" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Validate content
  if (
    body.content === undefined ||
    body.content === null ||
    typeof body.content !== "object" ||
    Array.isArray(body.content)
  ) {
    return new Response(
      JSON.stringify({ success: false, error: "content is required and must be a JSON object" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data, error } = await supabase
    .schema("hardsaw")
    .from("lifevault_memory")
    .insert({
    .insert({
      content: body.content,
    })
    .select("id, memory_type, created_at")
    .single();

  if (error) {
    console.error("[vault] Database insert failed:", error);
    return new Response(JSON.stringify({ success: false, error: "Database insert failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      success: true,
      id: data.id,
      memory_type: data.memory_type,
      inserted_at: data.created_at,
    }),
    {
      status: 201,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});


