import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROMPT = `You are extracting fence job measurements from a hand-drawn field sketch or AFC quote sheet.

Return ONLY valid JSON matching this structure exactly. No other text.

{
  "job_name": {"value": null, "confidence": 0},
  "total_lf": {"value": null, "confidence": 0},
  "fence_runs": {
    "value": [],
    "confidence": 0,
    "note": null
  },
  "height_ft": {"value": null, "confidence": 0},
  "ends": {"value": 2, "confidence": 0.7},
  "corners": {"value": null, "confidence": 0},
  "walk_gates": {"value": null, "confidence": 0},
  "drive_gates": {"value": null, "confidence": 0},
  "gate_widths": {"value": [], "confidence": 0, "note": null},
  "pool_flag": {"value": null, "confidence": 0},
  "notes": null,
  "extraction_warnings": [],
  "fields_missing": []
}

CRITICAL RULES — read carefully:

FENCE RUNS:
- List every dimension that represents a length of fence as kind=fence
- ALL short segments between gate openings are real fence runs — include them even if only 2-3 ft
- Short segments (1-5ft) flanking a gate opening are real fence runs, NOT noise
- Do NOT skip any dimension you can read, even small ones

GATE OPENINGS:
- Mark as kind=opening if the dimension has: an arrow through it, the word Gate, the letter G, a double-headed arrow, or is labeled as a gate width
- Gate openings are typically 4-6ft wide
- If a dimension is clearly labeled as a gate or has a gate symbol, it is kind=opening
- Standard single swing gate = 4ft opening. Double drive = 10-12ft opening.

HEIGHT:
- Look for explicit ft or inch labels: 4ft 5ft 6ft 4' 5' 6' 48in 60in 72in
- Return as integer: 4 5 or 6
- If not found leave null — do NOT guess

CORNERS:
- Count the corner posts shown as dots or filled circles on the sketch perimeter
- A rectangular enclosure typically has 4 corners
- Do not count gate posts as corners

GATE COUNTS:
- walk_gates = single swing gates (SS)
- drive_gates = double drive gates (DD) — typically 10ft+ wide openings
- Count gate symbols carefully

POOL FLAG:
- true if you see: pool, POOL, swimming pool, BOCA, pool enclosure, pool compliance
- false if none of those appear
- null if uncertain

CONFIDENCE:
- 0.9+ = clearly printed/written, unambiguous
- 0.7-0.8 = legible but requires interpretation
- 0.5-0.6 = partially visible or inferred from context
- below 0.5 = uncertain guess

Do not invent values. If a field is not visible return null.`;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    const ct = req.headers.get("content-type") ?? "";
    let imageBase64: string;
    let mediaType: string;

    if (ct.includes("application/json")) {
      let body: any;
      try { body = await req.json(); } catch (e) {
        return new Response(JSON.stringify({ error: "Failed to parse JSON", detail: String(e) }), {
          status: 400, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }
      if (!body.image_base64) {
        return new Response(JSON.stringify({ error: "image_base64 required", keys: Object.keys(body) }), {
          status: 400, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }
      imageBase64 = body.image_base64;
      mediaType = body.media_type ?? "image/jpeg";
    } else if (ct.includes("multipart/form-data")) {
      let form: FormData;
      try { form = await req.formData(); } catch (e) {
        return new Response(JSON.stringify({ error: "Failed to parse form", detail: String(e) }), {
          status: 400, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }
      const file = form.get("image") as File;
      if (!file) {
        return new Response(JSON.stringify({ error: "image field required" }), {
          status: 400, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      imageBase64 = btoa(binary);
      mediaType = file.type || "image/jpeg";
    } else {
      return new Response(JSON.stringify({ error: "Unsupported content-type", received: ct }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text", text: PROMPT },
          ],
        }],
      }),
    });

    const claudeText = await claudeRes.text();
    if (!claudeRes.ok) {
      return new Response(JSON.stringify({ error: "Claude API error", status: claudeRes.status, detail: claudeText.substring(0, 500) }), {
        status: 502, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    const claudeData = JSON.parse(claudeText);
    const rawText = claudeData.content?.[0]?.text ?? "";

    let extracted: any;
    try {
      const clean = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      extracted = JSON.parse(clean);
    } catch {
      return new Response(JSON.stringify({ error: "Failed to parse extraction JSON", raw: rawText.substring(0, 500) }), {
        status: 422, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    const fields = ["job_name","total_lf","fence_runs","height_ft","ends","corners","walk_gates","drive_gates","pool_flag"];
    const highConfidence: string[] = [];
    const needsConfirmation: string[] = [];
    const missing: string[] = extracted.fields_missing ?? [];

    for (const f of fields) {
      const fld = extracted[f];
      if (!fld || fld.value === null || fld.value === undefined) {
        if (!missing.includes(f)) missing.push(f);
      } else if (fld.confidence >= 0.8) {
        highConfidence.push(f);
      } else {
        needsConfirmation.push(f);
      }
    }

    const formParams: any = {};
    if (extracted.height_ft?.confidence >= 0.8)  formParams.height_ft = extracted.height_ft.value;
    if (extracted.ends?.confidence >= 0.7)        formParams.ends      = extracted.ends.value;
    if (extracted.corners?.confidence >= 0.7)     formParams.corners   = extracted.corners.value;
    if (extracted.walk_gates?.confidence >= 0.7)  formParams.walks     = extracted.walk_gates.value;
    if (extracted.drive_gates?.confidence >= 0.7) formParams.drives    = extracted.drive_gates.value;
    if (extracted.pool_flag?.confidence >= 0.7)   formParams.pool      = extracted.pool_flag.value;
    if (extracted.fence_runs?.confidence >= 0.6 && extracted.fence_runs?.value?.length > 0) {
      formParams.edges = extracted.fence_runs.value.map((r: any) => ({
        kind: r.kind,
        length: r.length_ft,
      }));
    }

    const assistQuestions: string[] = [];
    if (missing.includes("height_ft") || needsConfirmation.includes("height_ft"))
      assistQuestions.push("What is the fence height? (4ft, 5ft, or 6ft)");
    if (missing.includes("walk_gates") || needsConfirmation.includes("walk_gates"))
      assistQuestions.push("How many walk gates (single swing)?");
    if (missing.includes("drive_gates") || needsConfirmation.includes("drive_gates"))
      assistQuestions.push("How many drive gates (double drive)?");
    if (missing.includes("corners") || needsConfirmation.includes("corners"))
      assistQuestions.push("How many corner posts?");
    if (missing.includes("pool_flag"))
      assistQuestions.push("Is this a pool enclosure? (yes/no)");

    if (extracted.fence_runs?.value?.length > 0 && extracted.fence_runs?.confidence >= 0.6) {
      const fenceRuns = extracted.fence_runs.value.filter((r:any) => r.kind === 'fence').map((r:any) => `${r.length_ft}ft`).join(", ");
      const openingRuns = extracted.fence_runs.value.filter((r:any) => r.kind === 'opening').map((r:any) => `${r.length_ft}ft`).join(", ");
      if (fenceRuns) assistQuestions.push(`Fence runs I see: ${fenceRuns}. Correct?`);
      if (openingRuns) assistQuestions.push(`Gate openings I see: ${openingRuns}. Correct?`);
    }
    if (extracted.total_lf?.value && extracted.total_lf?.confidence >= 0.7)
      assistQuestions.push(`Total fence LF looks like ${extracted.total_lf.value}ft. Confirm?`);

    return new Response(JSON.stringify({
      version: "vision-parse-v2.1.0",
      timestamp: new Date().toISOString(),
      extraction: extracted,
      summary: {
        high_confidence: highConfidence,
        needs_confirmation: needsConfirmation,
        missing,
        ready_to_calc: missing.length === 0 && needsConfirmation.length <= 2,
      },
      form_params: formParams,
      assist_questions: assistQuestions,
    }), { headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Unhandled exception", detail: String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
});
