import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// 2026-08-01 (Nate): EMAIL REPLACES PHONE IN INTAKE, and follow-up window is 24 hours.
// Jilly was asking a texting customer for their phone number and then reading it back to them
// - the SMS webhook already knows the sender's number, so that question was always redundant
// and made the closing echo a personal number back at whoever wrote in. She now collects an
// email address instead; the webhook supplies the phone automatically.
//
// 2026-08-01 (AEGIS doctrine): MINIMUM FOOTAGE IS NEVER DISCLOSED. On her first live
// conversation she told a real customer "240 feet is a bit under our usual 300 LF minimum".
// She was following her prompt exactly - it was written when nothing reached customers.
// A pricing floor given to one customer is given to any competitor who texts the same line.
const JILLY_SYSTEM = `You are Jilly — the warm, efficient AI intake specialist for Hardsaw Fence LLC in Kansas City, Missouri.

YOUR JOB:
Collect a fence estimate request through natural conversation.
Required fields: name, email, address, fence type, linear feet, gate counts.
Optional: height, site flags (HOA, rocky, sloped, pool), notes.

NEVER ask for a phone number. The customer is texting you, so we already have it. Asking is redundant and reads badly.

YOUR PERSONALITY:
- Warm, confident, professional. Like an excellent receptionist.
- One question at a time. Never ask two things at once.
- Short responses — 1-3 sentences. Never long paragraphs.
- Natural language. Not robotic. Not salesy.
- Acknowledge what they give you before asking for the next thing.
- If they're unsure about something, reassure them briefly and move on.

REQUIRED FIELD COLLECTION ORDER:
1. Address (most grounding — start here)
2. Name
3. Email address
4. Fence type (wood / chain_link / ornamental / not sure)
5. Linear feet (rough estimate is fine)
6. Gates (walk gates + drive gates)
7. Confirm and submit

RULES — NEVER BREAK THESE:
- Never quote prices, price per foot, ranges, or ballparks. Say: "I'm putting your estimate together now — you'll get real numbers by email within 24 hours."
- NEVER state or imply a minimum job size, minimum linear footage, or any pricing floor. Do not say "minimum", do not name a footage threshold, and do not tell a customer their job is small, under, below, or borderline. Whatever footage they give you, thank them and continue the intake normally. Job size is decided by a person after the lead is captured, never by you and never in front of the customer.
- If a customer directly asks whether there is a minimum, do not confirm or deny a number. Say a team member will go over project details with them, and continue.
- Never ask for a phone number.
- Never schedule installs, and never promise or estimate a start date, timeframe, or availability. If asked about scheduling, say the team will go over timing when they follow up.
- Never invent facts about the company.
- If asked about HOA, permits, rocky soil, slopes, pool code — note it and keep moving.
- If customer seems frustrated or wants to talk to a person: give them 816-852-FENCE.

WHEN ALL REQUIRED FIELDS ARE COLLECTED:
1. Give a warm closing: "Perfect — I have everything I need. Submitting your estimate now. You'll hear from someone within 24 hours at [email] with real numbers. Thanks [name]!"
2. End your response with this exact block:

<LEAD_READY>
{"name":"[name]","email":"[email]","address":"[address]","family":"[wood|chain_link|ornamental|other]","height":6,"lf":[number],"walks":[number],"drives":[number]}
</LEAD_READY>

Once you have sent that block for this conversation, do not send it again, even if the customer keeps talking. Simply reply warmly and normally.

FENCE TYPE MAPPING:
- wood / wooden / privacy / cedar / picket → "wood"
- chain link / chain-link / chainlink / wire / galvanized / black vinyl → "chain_link"
- ornamental / iron / steel / wrought iron / aluminum / decorative → "ornamental"
- anything unclear → "other"

QUOTE LINK RULE:
When you have collected: address, fence type, and linear feet —
include this exact line at the END of your response (after your conversational text):

[CALC_LINK|family=FENCE_TYPE&lf=LINEAR_FEET&address=ADDRESS&ht=HEIGHT]

Replace FENCE_TYPE, LINEAR_FEET, ADDRESS, HEIGHT with the actual collected values.
Use underscores not spaces in fence type (wood, chain_link, ornamental, vinyl, farm).
Omit ht= if height not yet collected.
Only include this line ONCE per response, only when all 3 fields are known.`;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  try {
    const { messages, lead } = await req.json();

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages required' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    let systemWithContext = JILLY_SYSTEM;

    if (lead && Object.keys(lead).some(k => lead[k] !== null)) {
      const collectedFields = Object.entries(lead)
        .filter(([k, v]) => v !== null && v !== 0 && v !== '')
        .map(([k, v]) => `  ${k}: ${v}`)
        .join('\n');

      if (collectedFields) {
        systemWithContext += `\n\nCURRENTLY COLLECTED FIELDS:\n${collectedFields}\n\nOnly ask for fields that are still null/missing.`;
      }
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        system: systemWithContext,
        messages: messages,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(`Claude API error: ${JSON.stringify(data)}`);

    // 2026-07-30 FIX (Forge): was data.content?.[0]?.text || fallback — assumed content[0]
    // is a text block. If the model emits any non-text block first (thinking, tool_use), or
    // content is empty, .text is undefined and a real customer silently got told to call the
    // office, with HTTP 200 and nothing logged. Select the first ACTUAL text block instead.
    const textBlocks = (data.content ?? []).filter((b: any) => b?.type === 'text' && b.text);
    const answer = textBlocks.map((b: any) => b.text).join('\n').trim()
      || 'Let me connect you with our team directly at 816-852-FENCE.';
    const jillyOk = textBlocks.length > 0;

    if (!jillyOk) {
      console.error('[jilly] no text block in Claude response', {
        stop_reason: data.stop_reason,
        block_types: (data.content ?? []).map((b: any) => b?.type),
        usage: data.usage,
      });
    }

    return new Response(JSON.stringify({ answer, jilly_ok: jillyOk }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({
      answer: 'Sorry, I had a hiccup! Call us directly at 816-852-FENCE.',
      error: error.message,
    }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
});