// Netlify Function: /api/classify
//
// Second-pass rule matcher for the Client Communication tab. The deterministic
// matcher in public/comms-matcher.js runs FIRST in the browser; this is only
// called when that matcher finds nothing confident enough (Lane B), which is
// where paraphrases the keyword list has never seen end up.
//
// HARD CONTRACT — this endpoint SELECTS a rule, it never writes one:
//   · in  : { question, candidates: [{ id, topic }] }
//   · out : { id: "<one of the candidate ids>" | null, reason }
// The browser then renders the STORED reply for that id out of its own copy of
// the answer bank. The model's output is never shown to a VA or a client, so a
// hallucinated id simply fails the lookup and falls back to the gap card.
//
// The clinical and payment lanes run before this in the browser and are not
// reachable from here. The instruction below refuses them a second time anyway
// — a guardrail that only exists in one place isn't a guardrail.

const MAX_QUESTION = 600;
const MAX_CANDIDATES = 120;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY env var not set on Netlify project" }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ error: "invalid JSON body" }, 400); }

  const question = String((body && body.question) || "").trim().slice(0, MAX_QUESTION);
  const candidates = Array.isArray(body && body.candidates) ? body.candidates.slice(0, MAX_CANDIDATES) : [];
  if (!question) return json({ error: "missing question" }, 400);
  if (!candidates.length) return json({ error: "missing candidates" }, 400);

  const allowed = new Set(candidates.map(c => String(c.id)));
  const list = candidates.map(c => `${c.id}: ${String(c.topic || "").slice(0, 140)}`).join("\n");

  const prompt = `You route client questions for a functional medicine clinic's front desk.

Below is the complete list of answer rules the team has written. Each line is "id: what the rule covers".

${list}

A client sent this message:
"""
${question}
"""

Pick the ONE rule that answers it, matching on meaning rather than shared words — the client will not use our vocabulary. "Any update on my labs" means the same as a rule about result turnaround. "My vitamins" means supplements.

Return null instead of a rule when:
- no rule genuinely covers the question, even loosely
- you are picking a rule only because it is the closest of a bad set
- the question asks about symptoms, dosing, whether to take or stop something, what a result means, or anything else clinical
- the question involves money — invoices, charges, pricing, refunds, subscriptions

Returning null is the safe answer and is always acceptable. A wrong rule sends a client incorrect information about their care, so choose it only when you are confident.

Reply with JSON only, no other text:
{"id": "<rule id or null>", "reason": "<max 12 words>"}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: Netlify.env.get("CLAUDE_CLASSIFY_MODEL") || "claude-haiku-4-5",
        max_tokens: 100,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      console.error("classify: anthropic error", res.status, await res.text());
      return json({ id: null, reason: "classifier unavailable" });
    }

    const data = await res.json();
    const text = ((data.content || []).find(b => b.type === "text") || {}).text || "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return json({ id: null, reason: "unparseable" });

    let parsed;
    try { parsed = JSON.parse(m[0]); } catch { return json({ id: null, reason: "unparseable" }); }

    // Only ever hand back an id the caller itself offered.
    const id = parsed && parsed.id != null ? String(parsed.id) : null;
    if (!id || !allowed.has(id)) return json({ id: null, reason: "no confident match" });

    return json({ id, reason: String(parsed.reason || "").slice(0, 80) });
  } catch (e) {
    console.error("classify: failed", e);
    return json({ id: null, reason: "classifier error" });
  }
};
